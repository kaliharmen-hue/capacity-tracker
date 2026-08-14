import {
  applyClusterDecision,
  daysBetween,
  detectCapacityClusters,
  resolveHormonalRelevance,
  restoreManualEpisode,
  type CapacityCluster,
  type ClusterDecision,
  type HormonalRelevance,
  type NormalizedTimelineDay,
  capacityRank
} from "./timeline-model.ts";

export interface MedicationCourse {
  id: string;
  startDate: string;
  stopDate: string | null;
  lastTakenDate: string;
  medicationDates: string[];
}

export interface PatternFeature {
  key: string;
  label: string;
  group: string;
  episodeCount: number;
}

export type MedicationTrajectory = "improvement-followed" | "mixed" | "no-clear-improvement" | "insufficient";

export interface MedicationResponseAssessment {
  trajectory: MedicationTrajectory;
  label: string;
  detail: string;
  beforeDays: number;
  afterDays: number;
}

export interface MoodCapacityPattern {
  reducedDays: number;
  moodDaysRecorded: number;
  reducedWithMoodData: number;
  reducedWithStableMood: number;
  reducedWithInterestData: number;
  reducedWithInterest: number;
  reducedWithWakingMoodData: number;
  reducedWithNeutralOrPositiveWakingMood: number;
  reducedWithStableOverallState: number;
  longestLowMoodRun: number;
}

interface FeatureDefinition {
  key: string;
  label: string;
  group: string;
  matches: (day: NormalizedTimelineDay) => boolean;
}

function rawString(day: NormalizedTimelineDay, key: string): string {
  const value = day.raw[key];
  return value === undefined || value === null ? "" : String(value).toLowerCase();
}

function rawArray(day: NormalizedTimelineDay, key: string): string[] {
  const value = day.raw[key];
  return Array.isArray(value) ? value.map(String).map((item) => item.toLowerCase()) : [];
}

function signsInclude(day: NormalizedTimelineDay, ...patterns: string[]): boolean {
  return day.hormonalSigns.some((sign) => patterns.some((pattern) => sign.toLowerCase().includes(pattern)));
}

export const patternFeatureDefinitions: FeatureDefinition[] = [
  { key: "bloating", label: "Bloating", group: "Physical / hormonal", matches: (day) => day.flags.bloating },
  { key: "low-energy", label: "Low usable energy", group: "Energy / capacity", matches: (day) => day.energy !== null && day.energy <= 4 },
  { key: "lower-clarity", label: "Lower executive clarity", group: "Cognitive", matches: (day) => day.clarity !== null && day.clarity <= 5 },
  {
    key: "poor-sleep",
    label: "Poor / disrupted sleep",
    group: "Sleep",
    matches: (day) => day.sleepQuality.toLowerCase() === "poor" || rawString(day, "sleepFragmentation") === "yes" || rawString(day, "hotWaking") === "yes"
  },
  { key: "weaker-medication", label: "Amfexa felt weaker", group: "ADHD medication response", matches: (day) => day.flags.reducedMedicationEffect },
  { key: "head-pressure", label: "Head pressure / tension", group: "Physical / hormonal", matches: (day) => signsInclude(day, "head pressure") },
  { key: "sensitivity", label: "Increased sensitivity", group: "Emotional / social tolerance", matches: (day) => day.flags.sensitivity },
  { key: "appetite", label: "Cravings / increased appetite", group: "Appetite / cravings", matches: (day) => day.flags.cravings || day.flags.increasedAppetite },
  { key: "cognitive-slowing", label: "Cognitive slowing / head swimming", group: "Cognitive", matches: (day) => day.flags.brainFog || day.flags.headSwimming },
  { key: "low-mood", label: "Low / flat mood", group: "Emotional / social tolerance", matches: (day) => day.flags.lowMood },
  { key: "body-tension", label: "Body tension / unusual aches", group: "Physical / hormonal", matches: (day) => day.flags.bodyTension || signsInclude(day, "unusual body aches") },
  { key: "breast-changes", label: "Breast changes / tenderness", group: "Physical / hormonal", matches: (day) => signsInclude(day, "breast") },
  { key: "increased-libido", label: "Increased libido", group: "Behavioural / drive", matches: (day) => day.flags.libidoChanges },
  { key: "compulsive-spending", label: "Compulsive spending", group: "Behavioural / drive", matches: (day) => day.flags.impulsiveSpending },
  {
    key: "social-tolerance",
    label: "Lower social tolerance / withdrawal",
    group: "Emotional / social tolerance",
    matches: (day) => [rawString(day, "socialCapacity"), ...rawArray(day, "socialTolerance")].some((value) => value.includes("low tolerance") || value.includes("withdraw"))
  }
];

export function buildCapacityEvents(days: NormalizedTimelineDay[], decisions: ClusterDecision[]): CapacityCluster[] {
  const unused = new Set(decisions.map((decision) => decision.id));
  const detected = detectCapacityClusters(days).map((cluster) => {
    let decision = decisions.find((candidate) => candidate.id === cluster.id);
    if (!decision && cluster.kind === "episode") {
      decision = decisions
        .filter((candidate) => unused.has(candidate.id) && candidate.endDate >= cluster.startDate && candidate.startDate <= cluster.endDate)
        .sort((left, right) => {
          const leftOverlap = Math.min(Date.parse(left.endDate), Date.parse(cluster.endDate)) - Math.max(Date.parse(left.startDate), Date.parse(cluster.startDate));
          const rightOverlap = Math.min(Date.parse(right.endDate), Date.parse(cluster.endDate)) - Math.max(Date.parse(right.startDate), Date.parse(cluster.startDate));
          return rightOverlap - leftOverlap;
        })[0];
    }
    if (decision) unused.delete(decision.id);
    const compatibleDecision = decision && decision.id !== cluster.id
      ? { ...decision, id: cluster.id, startDate: cluster.startDate, endDate: cluster.endDate }
      : decision;
    return applyClusterDecision(cluster, compatibleDecision, days);
  });
  const restored = decisions
    .filter((decision) => unused.has(decision.id) && !decision.id.startsWith("auto:"))
    .map((decision) => restoreManualEpisode(decision, days));
  return [...detected, ...restored].sort((left, right) => left.startDate.localeCompare(right.startDate));
}

export function relevantHormonalEpisodes(events: CapacityCluster[]): CapacityCluster[] {
  return events.filter((event) => event.kind === "episode" && event.status !== "rejected" && ["Yes", "Possible"].includes(resolveHormonalRelevance(event)));
}

export function buildMedicationCourses(days: NormalizedTimelineDay[]): MedicationCourse[] {
  const courses: MedicationCourse[] = [];
  let active: MedicationCourse | null = null;
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.pmddMedicationTaken.toLowerCase() === "yes") {
      if (!active) {
        active = { id: `course:${day.date}`, startDate: day.date, stopDate: null, lastTakenDate: day.date, medicationDates: [] };
        courses.push(active);
      }
      active.medicationDates.push(day.date);
      active.lastTakenDate = day.date;
    } else if (day.pmddMedicationTaken.toLowerCase() === "no" && active) {
      active.stopDate = day.date;
      active = null;
    }
  }
  return courses;
}

export function courseEndDate(course: MedicationCourse): string {
  return course.stopDate ?? course.lastTakenDate;
}

export function associatedEpisode(course: MedicationCourse, episodes: CapacityCluster[]): CapacityCluster | undefined {
  const endDate = courseEndDate(course);
  return episodes
    .filter((episode) => course.startDate <= episode.endDate && endDate >= episode.startDate)
    .sort((left, right) => Math.abs(daysBetween(left.startDate, course.startDate)) - Math.abs(daysBetween(right.startDate, course.startDate)))[0];
}

function average(values: Array<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
}

export function assessMedicationResponse(course: MedicationCourse, days: NormalizedTimelineDay[]): MedicationResponseAssessment {
  const hasComparableMeasure = (day: NormalizedTimelineDay) => day.energy !== null || day.clarity !== null || capacityRank(day.capacityState) >= 0;
  const before = days.filter((day) => day.date < course.startDate && daysBetween(day.date, course.startDate) <= 3 && hasComparableMeasure(day));
  const after = days.filter((day) => day.date > course.startDate && daysBetween(course.startDate, day.date) <= 5 && hasComparableMeasure(day));
  const comparisons: number[] = [];
  const energyBefore = average(before.map((day) => day.energy));
  const energyAfter = average(after.map((day) => day.energy));
  const clarityBefore = average(before.map((day) => day.clarity));
  const clarityAfter = average(after.map((day) => day.clarity));
  const rankBefore = average(before.map((day) => capacityRank(day.capacityState)).filter((rank) => rank >= 0));
  const rankAfter = average(after.map((day) => capacityRank(day.capacityState)).filter((rank) => rank >= 0));
  if (energyBefore !== null && energyAfter !== null) comparisons.push(energyAfter - energyBefore);
  if (clarityBefore !== null && clarityAfter !== null) comparisons.push(clarityAfter - clarityBefore);
  if (rankBefore !== null && rankAfter !== null) comparisons.push(rankBefore - rankAfter);

  if (before.length < 2 || after.length < 2 || !comparisons.length) {
    return { trajectory: "insufficient", label: "Not enough data", detail: "There are not enough comparable recorded days before and after this medication start.", beforeDays: before.length, afterDays: after.length };
  }
  const improved = comparisons.some((change) => change >= 1);
  const worsened = comparisons.some((change) => change <= -1);
  if (improved && !worsened) {
    return { trajectory: "improvement-followed", label: "Improvement followed medication", detail: "Recorded capacity, energy or executive clarity improved in the five days after starting compared with the preceding three days. Timing alone cannot show that medication caused the change.", beforeDays: before.length, afterDays: after.length };
  }
  if (improved && worsened) {
    return { trajectory: "mixed", label: "Mixed change after medication", detail: "Some recorded measures improved while others worsened in the days after starting.", beforeDays: before.length, afterDays: after.length };
  }
  return { trajectory: "no-clear-improvement", label: "No clear improvement recorded", detail: worsened ? "The recorded measures did not improve overall in the five days after starting." : "Any change in the recorded measures was too small to identify a clear trajectory.", beforeDays: before.length, afterDays: after.length };
}

export function buildMoodCapacityPattern(days: NormalizedTimelineDay[]): MoodCapacityPattern {
  const reduced = days.filter((day) => ["Reduced", "Significant reduction"].includes(day.capacityState ?? ""));
  const reducedWithMood = reduced.filter((day) => Boolean(day.underlyingMood) && day.underlyingMood !== "Hard to tell");
  const reducedWithInterest = reduced.filter((day) => ["Yes", "Somewhat", "No"].includes(day.interestAvailable));
  const reducedWithWakingMood = reduced.filter((day) => Boolean(day.wakingMood) && day.wakingMood !== "Hard to tell");
  const lowMoodDays = days
    .filter((day) => ["low for most of the day", "flat or numb"].includes(day.underlyingMood.toLowerCase()))
    .sort((left, right) => left.date.localeCompare(right.date));
  let longestLowMoodRun = 0;
  let currentRun = 0;
  let previousDate = "";
  for (const day of lowMoodDays) {
    currentRun = previousDate && daysBetween(previousDate, day.date) === 1 ? currentRun + 1 : 1;
    longestLowMoodRun = Math.max(longestLowMoodRun, currentRun);
    previousDate = day.date;
  }
  return {
    reducedDays: reduced.length,
    moodDaysRecorded: days.filter((day) => Boolean(day.underlyingMood) && day.underlyingMood !== "Hard to tell").length,
    reducedWithMoodData: reducedWithMood.length,
    reducedWithStableMood: reducedWithMood.filter((day) => ["Positive / good", "Mostly okay / stable"].includes(day.underlyingMood)).length,
    reducedWithInterestData: reducedWithInterest.length,
    reducedWithInterest: reducedWithInterest.filter((day) => ["yes", "somewhat"].includes(day.interestAvailable.toLowerCase())).length,
    reducedWithWakingMoodData: reducedWithWakingMood.length,
    reducedWithNeutralOrPositiveWakingMood: reducedWithWakingMood.filter((day) => ["Very positive", "Good", "Neutral / okay"].includes(day.wakingMood)).length,
    reducedWithStableOverallState: reduced.filter((day) => ["calm", "balanced", "neutral / ordinary", "engaged"].includes(day.overallState.toLowerCase())).length,
    longestLowMoodRun
  };
}

export function episodeDays(episode: CapacityCluster, days: NormalizedTimelineDay[]): NormalizedTimelineDay[] {
  return days.filter((day) => day.date >= episode.startDate && day.date <= episode.endDate);
}

export function featuresForEpisode(episode: CapacityCluster, days: NormalizedTimelineDay[]): PatternFeature[] {
  const within = episodeDays(episode, days);
  return patternFeatureDefinitions
    .filter((definition) => within.some(definition.matches))
    .map(({ key, label, group }) => ({ key, label, group, episodeCount: 1 }));
}

export function recurringPattern(episodes: CapacityCluster[], days: NormalizedTimelineDay[], limit = 8): PatternFeature[] {
  const counts = new Map<string, number>();
  for (const episode of episodes) {
    featuresForEpisode(episode, days).forEach((feature) => counts.set(feature.key, (counts.get(feature.key) ?? 0) + 1));
  }
  return patternFeatureDefinitions
    .map(({ key, label, group }) => ({ key, label, group, episodeCount: counts.get(key) ?? 0 }))
    .filter((feature) => feature.episodeCount > 0)
    .sort((left, right) => right.episodeCount - left.episodeCount || left.label.localeCompare(right.label))
    .slice(0, limit);
}

export function intervalRange(episodes: CapacityCluster[]): string | null {
  if (episodes.length < 2) return null;
  const intervals = episodes.slice(1).map((episode, index) => daysBetween(episodes[index].startDate, episode.startDate));
  return `${Math.min(...intervals)}-${Math.max(...intervals)} days`;
}

export function hormonalRelevanceLabel(episode: CapacityCluster): HormonalRelevance {
  return resolveHormonalRelevance(episode);
}
