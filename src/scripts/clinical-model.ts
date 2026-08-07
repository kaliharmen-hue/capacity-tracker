import type { PostExertionalResponse } from "./db.ts";
import { type CapacityCluster, type NormalizedTimelineDay } from "./timeline-model.ts";

export interface BaselineInterval {
  startDate: string;
  endDate: string;
  days: number;
}

export interface PostExertionalCandidate {
  exposureDate: string;
  reasons: string[];
  laterReductionDate: string | null;
}

export interface DepressionPatternEvidence {
  status: "Insufficient direct data" | "No sustained depressive pattern identified" | "Some depressive features recorded" | "Sustained depressive pattern - consider clinical assessment";
  trackedDays: number;
  moodRecorded: number;
  interestRecorded: number;
  directLowMoodDays: number;
  reducedInterestDays: number;
  longestCoreRun: number;
  strongestWindow: { startDate: string; endDate: string; coreDays: number; recordedDays: number } | null;
  reducedCapacityDays: number;
  reducedCapacityInterestRecorded: number;
  interestAvailableOnReducedDays: number;
  interestPartlyAvailableOnReducedDays: number;
  interestUnavailableOnReducedDays: number;
  capacityImpactRecorded: number;
  substantialImpactDays: number;
  pushedThroughDays: number;
  lowDemandUnclearDays: number;
  baselineIntervals: BaselineInterval[];
  missingEvidence: string[];
}

export interface MeCfsPatternEvidence {
  status: "Insufficient evidence" | "Little current evidence of an ME/CFS pattern" | "Some ME/CFS-like features recorded" | "Persistent ME/CFS-type pattern - clinical assessment warranted";
  trackedDays: number;
  fatigueDays: number;
  energyRecorded: number;
  unrefreshingSleepDays: number;
  restorationRecorded: number;
  cognitiveDifficultyDays: number;
  clarityRecorded: number;
  substantialImpactDays: number;
  capacityImpactRecorded: number;
  pemSupportingResponses: number;
  pemExplicitNoResponses: number;
  pemResponsesRecorded: number;
  continuousPatternDays: number;
  baselineIntervals: BaselineInterval[];
  missingEvidence: string[];
}

export interface TemporalPatternEvidence {
  state: "Predominantly episodic" | "Predominantly persistent" | "Mixed" | "Insufficient data";
  description: string;
  trackedDays: number;
  calendarSpanDays: number;
  reducedDays: number;
  baselineDays: number;
  episodes: number;
  baselineIntervals: BaselineInterval[];
}

const DAY_MS = 86_400_000;
const impactSubstantial = new Set([
  "I had to reduce, postpone or cancel something",
  "I could not manage important or essential activities"
]);

function parseDate(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function addDays(date: string, amount: number): string {
  return new Date(parseDate(date) + amount * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end) - parseDate(start)) / DAY_MS);
}

function rawString(day: NormalizedTimelineDay, key: string): string {
  const value = day.raw[key];
  return value === undefined || value === null ? "" : String(value);
}

function rawArray(day: NormalizedTimelineDay, key: string): string[] {
  const value = day.raw[key];
  return Array.isArray(value) ? value.map(String) : [];
}

function isReduced(day: NormalizedTimelineDay): boolean {
  return day.capacityState === "Reduced" || day.capacityState === "Significant reduction";
}

function isCoreMoodDay(day: NormalizedTimelineDay): boolean {
  return ["Low for most of the day", "Flat or numb"].includes(day.underlyingMood) || day.interestAvailable === "No";
}

function longestConsecutiveRun(days: NormalizedTimelineDay[], test: (day: NormalizedTimelineDay) => boolean): number {
  let longest = 0;
  let current = 0;
  let previous = "";
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!test(day)) {
      current = 0;
      previous = day.date;
      continue;
    }
    current = previous && daysBetween(previous, day.date) === 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day.date;
  }
  return longest;
}

export function buildBaselineIntervals(days: NormalizedTimelineDay[]): BaselineInterval[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const intervals: BaselineInterval[] = [];
  let run: NormalizedTimelineDay[] = [];
  const close = () => {
    if (run.length >= 2) intervals.push({ startDate: run[0].date, endDate: run.at(-1)!.date, days: run.length });
    run = [];
  };
  for (const day of sorted) {
    if (day.capacityState !== "Baseline") {
      close();
      continue;
    }
    if (run.length && daysBetween(run.at(-1)!.date, day.date) !== 1) close();
    run.push(day);
  }
  close();
  return intervals;
}

export function buildSymptomLightIntervals(days: NormalizedTimelineDay[]): BaselineInterval[] {
  const hormoneFlags = ["headSwimming", "cravings", "increasedAppetite", "bloating", "sensitivity", "bodyTension", "skinChanges", "bleedingSpotting"] as const;
  const isExplicitlyLight = (day: NormalizedTimelineDay) => {
    const hormonalClear = day.hormonalSigns.includes("No noticeable signs") || day.familiarHormonalPattern === "No";
    const moodClear = day.underlyingMood === "Mostly okay / stable" && ["Yes", "Somewhat"].includes(day.interestAvailable);
    return day.capacityState === "Baseline" && hormonalClear && moodClear && !hormoneFlags.some((flag) => day.flags[flag]);
  };
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const intervals: BaselineInterval[] = [];
  let run: NormalizedTimelineDay[] = [];
  const close = () => {
    if (run.length >= 2) intervals.push({ startDate: run[0].date, endDate: run.at(-1)!.date, days: run.length });
    run = [];
  };
  for (const day of sorted) {
    if (!isExplicitlyLight(day)) {
      close();
      continue;
    }
    if (run.length && daysBetween(run.at(-1)!.date, day.date) !== 1) close();
    run.push(day);
  }
  close();
  return intervals;
}

function strongestFourteenDayWindow(days: NormalizedTimelineDay[]) {
  let strongest: DepressionPatternEvidence["strongestWindow"] = null;
  for (const start of days) {
    const endDate = addDays(start.date, 13);
    const windowDays = days.filter((day) => day.date >= start.date && day.date <= endDate);
    const recorded = windowDays.filter((day) => day.underlyingMood || ["Yes", "Somewhat", "No"].includes(day.interestAvailable));
    const core = windowDays.filter(isCoreMoodDay);
    if (!strongest || core.length > strongest.coreDays || (core.length === strongest.coreDays && recorded.length > strongest.recordedDays)) {
      strongest = { startDate: start.date, endDate, coreDays: core.length, recordedDays: recorded.length };
    }
  }
  return strongest;
}

export function analyseDepressivePattern(days: NormalizedTimelineDay[]): DepressionPatternEvidence {
  const sorted = [...days].filter((day) => day.date).sort((a, b) => a.date.localeCompare(b.date));
  const moodRecorded = sorted.filter((day) => day.underlyingMood && day.underlyingMood !== "Hard to tell");
  const interestRecorded = sorted.filter((day) => ["Yes", "Somewhat", "No"].includes(day.interestAvailable));
  const directLowMood = sorted.filter((day) => ["Low for most of the day", "Flat or numb"].includes(day.underlyingMood));
  const reducedInterest = sorted.filter((day) => day.interestAvailable === "No");
  const reduced = sorted.filter(isReduced);
  const reducedInterestAnswered = reduced.filter((day) => ["Yes", "Somewhat", "No"].includes(day.interestAvailable));
  const impacts = sorted.map((day) => rawString(day, "capacityImpact")).filter(Boolean);
  const strongestWindow = strongestFourteenDayWindow(sorted);
  const substantialImpactDays = impacts.filter((impact) => impactSubstantial.has(impact)).length;
  const longestCoreRun = longestConsecutiveRun(sorted, isCoreMoodDay);
  const span = sorted.length ? daysBetween(sorted[0].date, sorted.at(-1)!.date) + 1 : 0;

  let status: DepressionPatternEvidence["status"] = "Insufficient direct data";
  const coreCoverageDays = new Set([...moodRecorded, ...interestRecorded].map((day) => day.date)).size;
  if (span >= 14 && coreCoverageDays >= 10) status = "No sustained depressive pattern identified";
  if (directLowMood.length >= 2 || reducedInterest.length >= 2) status = "Some depressive features recorded";
  if (strongestWindow && strongestWindow.coreDays >= 12 && strongestWindow.recordedDays >= 12 && substantialImpactDays > 0) {
    status = "Sustained depressive pattern - consider clinical assessment";
  }

  const missingEvidence: string[] = [];
  if (moodRecorded.length < sorted.length) missingEvidence.push(`Underlying mood was not directly recorded or was marked hard to tell on ${sorted.length - moodRecorded.length} of ${sorted.length} tracked days.`);
  if (interestRecorded.length < sorted.length) missingEvidence.push(`Enjoyment or connection was not directly recorded on ${sorted.length - interestRecorded.length} of ${sorted.length} tracked days.`);
  if (impacts.length < reduced.length) missingEvidence.push(`Functional impact was not directly recorded on ${reduced.length - impacts.length} of ${reduced.length} reduced-capacity days.`);

  return {
    status,
    trackedDays: sorted.length,
    moodRecorded: moodRecorded.length,
    interestRecorded: interestRecorded.length,
    directLowMoodDays: directLowMood.length,
    reducedInterestDays: reducedInterest.length,
    longestCoreRun,
    strongestWindow,
    reducedCapacityDays: reduced.length,
    reducedCapacityInterestRecorded: reducedInterestAnswered.length,
    interestAvailableOnReducedDays: reducedInterestAnswered.filter((day) => day.interestAvailable === "Yes").length,
    interestPartlyAvailableOnReducedDays: reducedInterestAnswered.filter((day) => day.interestAvailable === "Somewhat").length,
    interestUnavailableOnReducedDays: reducedInterestAnswered.filter((day) => day.interestAvailable === "No").length,
    capacityImpactRecorded: impacts.length,
    substantialImpactDays,
    pushedThroughDays: impacts.filter((impact) => impact === "I managed it, but only by pushing or using much more effort").length,
    lowDemandUnclearDays: impacts.filter((impact) => impact === "Hard to tell because very little was required today").length,
    baselineIntervals: buildBaselineIntervals(sorted),
    missingEvidence
  };
}

function supportsPem(response: PostExertionalResponse): boolean {
  const delayed = ["Several hours later", "The following day"].includes(response.worseningTiming);
  const disproportionate = ["Possibly", "Yes"].includes(response.disproportionate);
  const prolonged = ["1 day", "2-3 days", "4+ days", "Not recovered yet"].includes(response.recoveryDuration);
  return delayed && disproportionate && prolonged;
}

export function analyseMeCfsPattern(days: NormalizedTimelineDay[], responses: PostExertionalResponse[]): MeCfsPatternEvidence {
  const sorted = [...days].filter((day) => day.date).sort((a, b) => a.date.localeCompare(b.date));
  const energyRecorded = sorted.filter((day) => day.energy !== null);
  const fatigueDays = energyRecorded.filter((day) => day.energy! <= 4 || ["Exhausted / pushed too far", "Low in the morning"].includes(rawString(day, "energyPattern")));
  const restorationRecorded = sorted.filter((day) => ["Yes", "Somewhat", "No"].includes(rawString(day, "feltRestored")));
  const unrefreshing = restorationRecorded.filter((day) => rawString(day, "feltRestored") === "No" && (day.sleepHours === null || day.sleepHours >= 6));
  const clarityRecorded = sorted.filter((day) => day.clarity !== null);
  const cognitive = clarityRecorded.filter((day) => day.clarity! <= 4 || day.flags.brainFog || day.flags.headSwimming);
  const impacts = sorted.map((day) => rawString(day, "capacityImpact")).filter(Boolean);
  const substantialImpactDays = impacts.filter((impact) => impactSubstantial.has(impact)).length;
  const supportingPem = responses.filter(supportsPem);
  const explicitNoPem = responses.filter((response) => response.worseningTiming === "No" || response.disproportionate === "No");
  const baselineIntervals = buildBaselineIntervals(sorted);

  let status: MeCfsPatternEvidence["status"] = "Insufficient evidence";
  const representedDomains = Number(fatigueDays.length > 0) + Number(unrefreshing.length > 0) + Number(cognitive.length > 0) + Number(substantialImpactDays > 0) + Number(supportingPem.length > 0);
  if (responses.length > 0 && representedDomains <= 2) status = "Little current evidence of an ME/CFS pattern";
  if (representedDomains >= 3) status = "Some ME/CFS-like features recorded";

  // A 6-week clock starts only after a dense 42-day window contains repeated direct
  // evidence across every essential domain. These are transparent tracker guardrails,
  // not diagnostic criteria.
  const qualifyingWindows = sorted.flatMap((start) => {
    const endDate = addDays(start.date, 41);
    if (!sorted.length || endDate > sorted.at(-1)!.date) return [];
    const within = sorted.filter((day) => day.date >= start.date && day.date <= endDate);
    const fatigueCount = within.filter((day) => fatigueDays.some((item) => item.date === day.date)).length;
    const cognitiveCount = within.filter((day) => cognitive.some((item) => item.date === day.date)).length;
    const restorationCount = within.filter((day) => restorationRecorded.some((item) => item.date === day.date)).length;
    const unrefreshingCount = within.filter((day) => unrefreshing.some((item) => item.date === day.date)).length;
    const impactCount = within.filter((day) => impactSubstantial.has(rawString(day, "capacityImpact"))).length;
    const pemCount = supportingPem.filter((response) => response.exposureDate >= start.date && response.exposureDate <= endDate).length;
    const baselineRecovery = baselineIntervals.some((interval) => interval.startDate <= endDate && interval.endDate >= start.date);
    const qualifies = within.length >= 28 && fatigueCount >= 21 && cognitiveCount >= 21 && restorationCount >= 21 && unrefreshingCount >= 14 && impactCount >= 7 && pemCount >= 1 && !baselineRecovery;
    return qualifies ? [{ startDate: start.date, endDate }] : [];
  });
  let continuousPatternDays = 0;
  if (qualifyingWindows.length) {
    const first = qualifyingWindows[0];
    const last = qualifyingWindows.at(-1)!;
    continuousPatternDays = daysBetween(first.startDate, last.endDate) + 1;
    status = "Persistent ME/CFS-type pattern - clinical assessment warranted";
  }

  const missingEvidence: string[] = [];
  if (!responses.length) missingEvidence.push("Post-exertional responses have not yet been directly assessed.");
  if (impacts.length < sorted.filter(isReduced).length) missingEvidence.push(`Functional impact was not directly recorded on ${sorted.filter(isReduced).length - impacts.length} of ${sorted.filter(isReduced).length} reduced-capacity days.`);
  if (restorationRecorded.length < sorted.length) missingEvidence.push(`Whether sleep felt restorative was not recorded on ${sorted.length - restorationRecorded.length} of ${sorted.length} tracked days.`);

  return {
    status,
    trackedDays: sorted.length,
    fatigueDays: fatigueDays.length,
    energyRecorded: energyRecorded.length,
    unrefreshingSleepDays: unrefreshing.length,
    restorationRecorded: restorationRecorded.length,
    cognitiveDifficultyDays: cognitive.length,
    clarityRecorded: clarityRecorded.length,
    substantialImpactDays,
    capacityImpactRecorded: impacts.length,
    pemSupportingResponses: supportingPem.length,
    pemExplicitNoResponses: explicitNoPem.length,
    pemResponsesRecorded: responses.length,
    continuousPatternDays,
    baselineIntervals,
    missingEvidence
  };
}

export function analyseTemporalPattern(days: NormalizedTimelineDay[], episodes: CapacityCluster[]): TemporalPatternEvidence {
  const sorted = [...days].filter((day) => day.date).sort((a, b) => a.date.localeCompare(b.date));
  const baselineIntervals = buildBaselineIntervals(sorted);
  const reduced = sorted.filter(isReduced);
  const baseline = sorted.filter((day) => day.capacityState === "Baseline");
  const calendarSpanDays = sorted.length ? daysBetween(sorted[0].date, sorted.at(-1)!.date) + 1 : 0;
  let state: TemporalPatternEvidence["state"] = "Insufficient data";
  if (calendarSpanDays >= 14 && episodes.length && baselineIntervals.length) state = "Predominantly episodic";
  else if (calendarSpanDays >= 14 && reduced.length >= 10 && baselineIntervals.length === 0) state = "Predominantly persistent";
  else if (calendarSpanDays >= 28 && reduced.length && baseline.length && !baselineIntervals.length) state = "Mixed";
  const description = state === "Predominantly episodic"
    ? `${episodes.length} capacity episode${episodes.length === 1 ? " was" : "s were"} separated from or followed by ${baselineIntervals.length} recorded baseline interval${baselineIntervals.length === 1 ? "" : "s"}.`
    : state === "Predominantly persistent"
      ? `${reduced.length} reduced-capacity days were recorded across ${calendarSpanDays} calendar days without a two-day recorded baseline interval.`
      : state === "Mixed"
        ? `${reduced.length} reduced-capacity days and ${baseline.length} individual baseline days were recorded, but no two-day baseline interval was identified.`
        : `${sorted.length} tracked days across ${calendarSpanDays} calendar days do not yet establish an episodic or persistent pattern.`;
  return { state, description, trackedDays: sorted.length, calendarSpanDays, reducedDays: reduced.length, baselineDays: baseline.length, episodes: episodes.length, baselineIntervals };
}

export function buildPostExertionalCandidates(days: NormalizedTimelineDay[], responses: PostExertionalResponse[]): PostExertionalCandidate[] {
  const answered = new Set(responses.map((response) => response.exposureDate));
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(sorted.map((day) => [day.date, day]));
  const candidates: PostExertionalCandidate[] = [];
  for (const day of sorted) {
    if (answered.has(day.date)) continue;
    const reasons: string[] = [];
    const movementEffect = rawString(day, "movementEffect");
    const intensity = rawString(day, "movementIntensity");
    const movement = rawArray(day, "movementTypes").filter((item) => item !== "Rest day");
    if (movementEffect === "Drained me") reasons.push("movement was recorded as draining");
    if (intensity === "Hard" && movement.length) reasons.push("hard physical activity was recorded");
    if (["High", "Very high"].includes(day.executiveDemandLevel)) reasons.push(`${day.executiveDemandLevel.toLowerCase()} executive demand was recorded`);
    for (const load of ["Heavy training", "Intense work day", "High cognitive demand", "Emotional conversations", "Social events"]) {
      if (day.load.includes(load)) reasons.push(load.toLowerCase());
    }
    if (!reasons.length) continue;
    const later = [addDays(day.date, 1), addDays(day.date, 2)].map((date) => byDate.get(date)).find((candidate) => candidate && isReduced(candidate));
    if (movementEffect !== "Drained me" && !later) continue;
    candidates.push({ exposureDate: day.date, reasons: [...new Set(reasons)], laterReductionDate: later?.date ?? null });
  }
  return candidates.slice(-8).reverse();
}

export function formatBaselineInterval(interval: BaselineInterval): string {
  return interval.startDate === interval.endDate ? interval.startDate : `${interval.startDate} to ${interval.endDate}`;
}
