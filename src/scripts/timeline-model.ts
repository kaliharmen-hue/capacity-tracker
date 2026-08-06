import type { DailyEntry } from "./schema";

export type RawDailyEntry = Partial<DailyEntry> & Record<string, unknown>;
export type CapacityState = "Baseline" | "Slightly reduced" | "Reduced" | "Significant reduction";
export type ClusterStatus = "provisional" | "confirmed" | "rejected";

export type SymptomKey =
  | "brainFog"
  | "headSwimming"
  | "lowMood"
  | "cravings"
  | "increasedAppetite"
  | "bloating"
  | "sensitivity"
  | "bodyTension"
  | "skinChanges"
  | "impulsiveSpending"
  | "reducedMedicationEffect"
  | "pmddMedication"
  | "activation"
  | "bleedingSpotting"
  | "libidoChanges";

export interface NormalizedTimelineDay {
  date: string;
  raw: RawDailyEntry;
  energy: number | null;
  clarity: number | null;
  sleepHours: number | null;
  sleepQuality: string;
  overallState: string;
  endOfDayEnergy: string;
  familiarHormonalPattern: string;
  hormonalSigns: string[];
  moodChanges: string[];
  activationSigns: string[];
  executiveFriction: string[];
  load: string[];
  recovery: string[];
  amfexaDose: number | null;
  amfexaEffect: string;
  pmddMedicationTaken: string;
  medicationSideEffects: string[];
  reflectionInfluencedToday: string;
  biggestEnergyDrain: string;
  capacityImprovedBy: string;
  notes: string[];
  flags: Record<SymptomKey, boolean>;
  fatigueLevel: string;
  capacityState: CapacityState | null;
  capacityReasons: string[];
}

export interface CapacityResult {
  state: CapacityState | null;
  reasons: string[];
}

export interface CapacityCluster {
  id: string;
  startDate: string;
  endDate: string;
  duration: number;
  lowestEnergy: number | null;
  lowestClarity: number | null;
  recurringSymptoms: SymptomKey[];
  pmddMedicationDates: string[];
  apparentReturnDate: string | null;
  status: ClusterStatus;
  sourceStartDate: string;
  sourceEndDate: string;
}

export interface ClusterDecision {
  id: string;
  status: "confirmed" | "rejected";
  startDate: string;
  endDate: string;
  updatedAt: string;
}

export interface BaselineProfile {
  count: number;
  energy: number | null;
  clarity: number | null;
  sleepHours: number | null;
  overallState: string;
  amfexaDose: number | null;
  hormonalSigns: string[];
}

export const symptomDefinitions: Array<{ key: SymptomKey; label: string; abbreviation: string; hormoneFocus: boolean }> = [
  { key: "brainFog", label: "Brain fog or muddy thinking", abbreviation: "BF", hormoneFocus: true },
  { key: "headSwimming", label: "Head swimming or intoxicated feeling", abbreviation: "HS", hormoneFocus: true },
  { key: "lowMood", label: "Low or flat mood", abbreviation: "LM", hormoneFocus: true },
  { key: "cravings", label: "Cravings", abbreviation: "Cr", hormoneFocus: true },
  { key: "increasedAppetite", label: "Increased appetite", abbreviation: "Ap", hormoneFocus: true },
  { key: "bloating", label: "Bloating", abbreviation: "Bl", hormoneFocus: true },
  { key: "sensitivity", label: "Increased sensitivity", abbreviation: "Se", hormoneFocus: true },
  { key: "bodyTension", label: "Body tension", abbreviation: "BT", hormoneFocus: true },
  { key: "skinChanges", label: "Skin changes or spots", abbreviation: "Sk", hormoneFocus: true },
  { key: "impulsiveSpending", label: "Impulsive spending", abbreviation: "IS", hormoneFocus: true },
  { key: "reducedMedicationEffect", label: "Reduced ADHD-medication effect", abbreviation: "Rx", hormoneFocus: false },
  { key: "pmddMedication", label: "PMDD medication taken", abbreviation: "PM", hormoneFocus: true },
  { key: "activation", label: "Activation", abbreviation: "Ac", hormoneFocus: false },
  { key: "bleedingSpotting", label: "Bleeding or spotting", abbreviation: "Bs", hormoneFocus: true },
  { key: "libidoChanges", label: "Libido changes", abbreviation: "Li", hormoneFocus: true }
];

const symptomKeys = symptomDefinitions.map((definition) => definition.key);
const cognitiveHormonalKeys: SymptomKey[] = [
  "brainFog",
  "headSwimming",
  "lowMood",
  "cravings",
  "increasedAppetite",
  "bloating",
  "sensitivity",
  "bodyTension",
  "skinChanges",
  "impulsiveSpending",
  "bleedingSpotting"
];

function firstValue(raw: RawDailyEntry, aliases: string[]): unknown {
  for (const alias of aliases) {
    const value = raw[alias];
    const isEmpty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (!isEmpty) return value;
  }
  return undefined;
}

function asString(raw: RawDailyEntry, aliases: string[]): string {
  const value = firstValue(raw, aliases);
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value === undefined ? "" : String(value).trim();
}

function asNumber(raw: RawDailyEntry, aliases: string[]): number | null {
  const value = firstValue(raw, aliases);
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asArray(raw: RawDailyEntry, aliases: string[]): string[] {
  const value = firstValue(raw, aliases);
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function includesAny(values: string[], patterns: string[]): boolean {
  return values.some((value) => patterns.some((pattern) => value.toLowerCase().includes(pattern)));
}

function textIncludes(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function compactNotes(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Historical mappings are intentionally read-only. Older brain-clarity names map to clarity,
 * fatigue contributes to capacity scoring, nervous-system fields map to overall state,
 * physiological activation maps to activation, and older Amfexa/medication notes are included
 * in their relevant note groups. Stored IndexedDB entries are never rewritten.
 */
export function normalizeTimelineEntry(raw: RawDailyEntry): NormalizedTimelineDay {
  const date = asString(raw, ["date", "entryDate", "logDate"]);
  const energy = asNumber(raw, ["energyScore", "usableEnergyScore", "usableEnergy", "energy"]);
  const clarity = asNumber(raw, ["clarityScore", "brainClarityScore", "brainClarity", "executiveCapacityScore", "mentalClarityScore"]);
  const sleepHours = asNumber(raw, ["sleepHours", "hoursSlept", "sleepDuration"]);
  const sleepQuality = asString(raw, ["sleepQuality", "qualityOfSleep"]);
  const endOfDayEnergy = asString(raw, ["endOfDayEnergy", "capacityAtEndOfDay", "reserveRemaining"]);
  const familiarHormonalPattern = asString(raw, ["familiarHormonalPattern", "familiarPattern", "hormonalPatternResponse"]);
  const hormonalSigns = asArray(raw, ["hormonalSigns", "cycleSigns", "hormonalSymptoms"]);
  const emotionalState = asArray(raw, ["emotionalState", "emotionalStates", "mood"]);
  const legacyNervousState = asArray(raw, ["nervousSystemState", "nervousState"]);
  const overallState = asString(raw, ["overallState"]) || legacyNervousState[0] || emotionalState[0] || "";
  const activationSigns = asArray(raw, ["activationSigns", "physiologicalActivationSigns", "physiologicalActivation"]);
  const executiveFriction = asArray(raw, ["executiveFriction", "cognitiveFriction"]);
  const load = asArray(raw, ["load", "loadFactors", "sourcesOfLoad"]);
  const recovery = asArray(raw, ["recovery", "recoveryFactors", "restorativeFactors"]);
  const amfexaDose = asNumber(raw, ["amfexaDose", "adhdMedicationDose", "medicationDose"]);
  const amfexaEffect = asString(raw, ["amfexaEffect", "adhdMedicationEffect", "medicationEffect"]);
  const pmddMedicationTaken = asString(raw, ["pmddMedicationTaken", "pmddMedication", "ssriTaken"]);
  const medicationSideEffects = asArray(raw, ["medicationSideEffects", "pmddMedicationSideEffects", "sideEffects"]);
  const fatigueLevel = asString(raw, ["fatigueLevel", "fatigueToday", "tirednessLevel"]);
  const reflectionInfluencedToday = asString(raw, ["reflectionInfluencedToday", "mostInfluencedToday", "dominantInfluence"]);
  const biggestEnergyDrain = asString(raw, ["biggestEnergyDrain", "energyDrain", "overloadIncreasedBy"]);
  const capacityImprovedBy = asString(raw, ["capacityImprovedBy", "unexpectedlyHelped", "whatHelped"]);
  const activationFirstNotice = asString(raw, ["activationFirstNotice", "activationTiming"]);
  const morningActivation = asNumber(raw, ["morningActivationScore", "physiologicalActivationScore"]);
  const laterActivation = asString(raw, ["laterActivation"]);
  const moodChanges = [...new Set([...emotionalState, ...legacyNervousState])];

  const notes = compactNotes([
    asString(raw, ["energyNotes"]),
    asString(raw, ["clarityNotes", "brainClarityNotes", "executiveCapacityNotes"]),
    asString(raw, ["emotionalNotes", "moodNotes"]),
    asString(raw, ["hormonalNotes", "cycleNotes"]),
    asString(raw, ["fatigueNotes", "tirednessNotes"]),
    asString(raw, ["nervousSystemNotes", "overallStateNotes"]),
    asString(raw, ["activationNotes", "physiologicalActivationNotes"]),
    asString(raw, ["adhdMedicationNotes", "amfexaNotes", "amfexaWearOffTime"]),
    asString(raw, ["medicationNotes", "pmddMedicationNotes"]),
    asString(raw, ["digestionNotes"]),
    asString(raw, ["loadNotes"]),
    reflectionInfluencedToday,
    biggestEnergyDrain,
    capacityImprovedBy,
    asString(raw, ["firstCapacityDropSign", "earlyWarningSigns", "easierOrHarder"])
  ]);
  const noteText = notes.join(" ").toLowerCase();
  const allSigns = [...hormonalSigns, ...asArray(raw, ["digestiveSymptoms", "digestiveSigns"]), ...moodChanges];

  const activation =
    activationSigns.some((sign) => sign.toLowerCase() !== "none") ||
    (activationFirstNotice !== "" && activationFirstNotice.toLowerCase() !== "not at all") ||
    (morningActivation !== null && morningActivation > 0) ||
    laterActivation.toLowerCase() === "higher";

  const flags: Record<SymptomKey, boolean> = {
    brainFog:
      textIncludes(noteText, [/brain[- ]?fog/, /foggy/, /muddy (thinking|brain|head)/, /treacle/, /word recall/, /cognitive fog/]) ||
      includesAny(executiveFriction, ["brain fog"]),
    headSwimming: textIncludes(noteText, [/head (was |felt )?swim/, /swimmy/, /mildly intoxicated/, /intoxicated feeling/, /felt drunk/]),
    lowMood:
      includesAny(moodChanges, ["low", "flat", "shutdown", "heavy"]) ||
      textIncludes(noteText, [/low mood/, /flat mood/, /felt flat/, /emotionally flat/]),
    cravings: includesAny(allSigns, ["craving"]) || textIncludes(noteText, [/\bcraving/]),
    increasedAppetite:
      includesAny(allSigns, ["increased appetite", "appetite changes"]) ||
      textIncludes(noteText, [/increased appetite/, /increased hunger/, /hungrier/, /more hungry/]),
    bloating: includesAny(allSigns, ["bloat"]) || textIncludes(noteText, [/\bbloat/]),
    sensitivity: includesAny(allSigns, ["increased sensitivity", "sensitive"]) || textIncludes(noteText, [/increased sensitivity/, /body sensitivity/]),
    bodyTension: includesAny(allSigns, ["body tension", "tightness"]) || textIncludes(noteText, [/body tension/, /physically tense/]),
    skinChanges: includesAny(allSigns, ["skin changes", "spots"]) || textIncludes(noteText, [/skin change/, /breakout/, /\bspots\b/]),
    impulsiveSpending: textIncludes(noteText, [/impulsive spend/, /impulse spend/, /overspend/, /spending impulsively/]),
    reducedMedicationEffect:
      amfexaEffect.toLowerCase() === "too weak" || textIncludes(noteText, [/amfexa.{0,30}(weak|less effective)/, /medication.{0,30}(weak|less effective)/]),
    pmddMedication: pmddMedicationTaken.toLowerCase() === "yes",
    activation,
    bleedingSpotting:
      asString(raw, ["possiblePeriodSign"]).toLowerCase() === "yes" ||
      textIncludes(noteText, [/\bspotting\b/, /\bbleeding\b/, /period sign/, /menstrual bleed/]),
    libidoChanges: textIncludes(noteText, [/libido/, /sex drive/, /sexual desire/])
  };

  const provisional: NormalizedTimelineDay = {
    date,
    raw,
    energy,
    clarity,
    sleepHours,
    sleepQuality,
    overallState,
    endOfDayEnergy,
    familiarHormonalPattern,
    hormonalSigns,
    moodChanges,
    activationSigns,
    executiveFriction,
    load,
    recovery,
    amfexaDose,
    amfexaEffect,
    pmddMedicationTaken,
    medicationSideEffects,
    reflectionInfluencedToday,
    biggestEnergyDrain,
    capacityImprovedBy,
    notes,
    flags,
    fatigueLevel,
    capacityState: null,
    capacityReasons: []
  };
  const result = scoreCapacityState(provisional);
  provisional.capacityState = result.state;
  provisional.capacityReasons = result.reasons;
  return provisional;
}

export function scoreCapacityState(day: Omit<NormalizedTimelineDay, "capacityState" | "capacityReasons">): CapacityResult {
  const reasons: string[] = [];
  const energy = day.energy;
  const clarity = day.clarity;
  const state = day.overallState.toLowerCase();
  const notes = day.notes.join(" ").toLowerCase();
  const symptomCount = cognitiveHormonalKeys.filter((key) => day.flags[key]).length;
  const hasLowMarker = (energy !== null && energy <= 5) || (clarity !== null && clarity <= 5) || symptomCount > 0;
  const severeText = textIncludes(notes, [
    /head (was |felt )?swim/,
    /mildly intoxicated/,
    /wading through treacle/,
    /treacle-like/,
    /unable to function/,
    /inability to function/,
    /couldn'?t function/,
    /cannot function/,
    /substantially unlike (my )?baseline/
  ]);

  if (energy !== null && energy <= 3) reasons.push(`Usable energy was ${energy}/10.`);
  if (clarity !== null && clarity <= 3) reasons.push(`Executive clarity was ${clarity}/10.`);
  if (energy !== null && clarity !== null && energy <= 4 && clarity <= 4) reasons.push("Energy and executive clarity were both 4/10 or below.");
  if (severeText) reasons.push("Notes described substantial cognitive impairment or functioning well outside baseline.");
  if ((state.includes("shutdown") || state.includes("severely drained")) && hasLowMarker) reasons.push("Shutdown or severe drain appeared with another low-capacity marker.");
  if (reasons.length) return { state: "Significant reduction", reasons };

  if (energy === 4) reasons.push("Usable energy was 4/10.");
  if (clarity === 4) reasons.push("Executive clarity was 4/10.");
  if (energy !== null && clarity !== null && energy <= 5 && clarity <= 5) reasons.push("Energy and executive clarity were both 5/10 or below.");
  if (["drained", "wired but tired", "shutdown/heavy", "low", "flat"].some((label) => state.includes(label))) reasons.push(`Overall state was recorded as ${day.overallState}.`);
  if (symptomCount >= 3) reasons.push(`${symptomCount} cognitive or hormonal indicators appeared together.`);
  if (["yes", "slightly"].includes(day.familiarHormonalPattern.toLowerCase()) && symptomCount >= 2) reasons.push("A familiar hormonal pattern appeared with multiple indicators.");
  if (day.flags.reducedMedicationEffect && ((energy !== null && energy <= 6) || (clarity !== null && clarity <= 6))) reasons.push("Amfexa felt weak alongside lower energy or cognition.");
  if (day.fatigueLevel.toLowerCase() === "significant" && hasLowMarker) reasons.push("Significant fatigue appeared with another low-capacity marker.");
  if (reasons.length) return { state: "Reduced", reasons };

  if (energy !== null && energy >= 5 && energy <= 6) reasons.push(`Usable energy was ${energy}/10.`);
  if (clarity !== null && clarity >= 5 && clarity <= 6) reasons.push(`Executive clarity was ${clarity}/10.`);
  if (day.fatigueLevel && day.fatigueLevel.toLowerCase() !== "no") reasons.push(`${day.fatigueLevel} fatigue was recorded.`);
  if (day.executiveFriction.some((item) => ["fatigue", "poor sleep", "physical symptoms"].includes(item.toLowerCase()))) reasons.push("Capacity-related executive friction was recorded.");
  if (symptomCount > 0) reasons.push(`${symptomCount} relevant symptom indicator${symptomCount === 1 ? " was" : "s were"} present.`);
  if (state === "wired") reasons.push("Overall state was wired.");
  if (reasons.length) return { state: "Slightly reduced", reasons };

  const positiveState = !state || ["baseline", "balanced", "calm", "calm/regulated", "engaged", "motivated/engaged"].some((label) => state.includes(label));
  const hormonalCluster = ["yes", "slightly"].includes(day.familiarHormonalPattern.toLowerCase());
  if (energy !== null && clarity !== null && energy >= 7 && clarity >= 7 && positiveState && !hormonalCluster && symptomCount === 0) {
    return { state: "Baseline", reasons: ["Energy and executive clarity were both at least 7/10 without a recorded cluster or impaired overall state."] };
  }

  return { state: null, reasons: ["There was not enough consistent information to assign a Capacity State."] };
}

export function capacityRank(state: CapacityState | null): number {
  return state === "Significant reduction" ? 3 : state === "Reduced" ? 2 : state === "Slightly reduced" ? 1 : state === "Baseline" ? 0 : -1;
}

function isoDayNumber(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);
}

export function daysBetween(startDate: string, endDate: string): number {
  return isoDayNumber(endDate) - isoDayNumber(startDate);
}

function minNumber(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length ? Math.min(...numbers) : null;
}

function buildCluster(days: NormalizedTimelineDay[], markedIndexes: number[], allDays: NormalizedTimelineDay[]): CapacityCluster {
  const clusterDays = markedIndexes.map((index) => days[index]);
  const startDate = clusterDays[0].date;
  const endDate = clusterDays.at(-1)?.date ?? startDate;
  const counts = new Map<SymptomKey, number>();
  for (const day of clusterDays) {
    for (const key of cognitiveHormonalKeys) if (day.flags[key]) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const recurringSymptoms = [...counts.entries()].filter(([, count]) => count >= 2).map(([key]) => key);
  const recoveryWindow = allDays.filter((day) => day.date > endDate && daysBetween(endDate, day.date) <= 10);
  const returnDay = recoveryWindow.find((day) => day.capacityState === "Baseline") ?? recoveryWindow.find((day) => day.capacityState === "Slightly reduced");
  return {
    id: `auto:${startDate}:${endDate}`,
    startDate,
    endDate,
    duration: daysBetween(startDate, endDate) + 1,
    lowestEnergy: minNumber(clusterDays.map((day) => day.energy)),
    lowestClarity: minNumber(clusterDays.map((day) => day.clarity)),
    recurringSymptoms,
    pmddMedicationDates: clusterDays.filter((day) => day.flags.pmddMedication).map((day) => day.date),
    apparentReturnDate: returnDay?.date ?? null,
    status: "provisional",
    sourceStartDate: startDate,
    sourceEndDate: endDate
  };
}

export function detectCapacityClusters(days: NormalizedTimelineDay[]): CapacityCluster[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const marked = new Set<number>();

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const next = sorted[index + 1];
    if (daysBetween(sorted[index].date, next.date) === 1 && capacityRank(sorted[index].capacityState) >= 2 && capacityRank(next.capacityState) >= 2) {
      marked.add(index);
      marked.add(index + 1);
    }
  }

  for (let index = 0; index < sorted.length - 2; index += 1) {
    const window = sorted.slice(index, index + 3);
    if (daysBetween(window[0].date, window[1].date) !== 1 || daysBetween(window[1].date, window[2].date) !== 1) continue;
    const counts = new Map<SymptomKey, number>();
    window.forEach((day) => cognitiveHormonalKeys.forEach((key) => day.flags[key] && counts.set(key, (counts.get(key) ?? 0) + 1)));
    if (window.every((day) => cognitiveHormonalKeys.some((key) => day.flags[key])) && [...counts.values()].some((count) => count >= 2)) {
      marked.add(index);
      marked.add(index + 1);
      marked.add(index + 2);
    }
  }

  const groups: number[][] = [];
  for (const index of [...marked].sort((a, b) => a - b)) {
    const group = groups.at(-1);
    if (group && index === group.at(-1)! + 1 && daysBetween(sorted[group.at(-1)!].date, sorted[index].date) === 1) group.push(index);
    else groups.push([index]);
  }
  return groups.map((group) => buildCluster(sorted, group, sorted));
}

export function applyClusterDecision(cluster: CapacityCluster, decision?: ClusterDecision): CapacityCluster {
  if (!decision) return cluster;
  const startDate = decision.startDate || cluster.startDate;
  const endDate = decision.endDate || cluster.endDate;
  return {
    ...cluster,
    startDate,
    endDate,
    duration: Math.max(1, daysBetween(startDate, endDate) + 1),
    status: decision.status
  };
}

function median(values: Array<number | null>): number | null {
  const numbers = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2 ? numbers[middle] : (numbers[middle - 1] + numbers[middle]) / 2;
}

function mode(values: string[]): string {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
}

export function buildBaselineProfile(days: NormalizedTimelineDay[], minimumDays = 5): BaselineProfile | null {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = sorted.at(-1)?.date;
  const recent = latestDate ? sorted.filter((day) => daysBetween(day.date, latestDate) <= 90) : [];
  const baselineDays = recent.filter((day) => day.capacityState === "Baseline");
  if (baselineDays.length < minimumDays) return null;
  const signs = baselineDays.flatMap((day) => day.hormonalSigns).filter((sign) => sign && sign !== "No noticeable signs");
  const signCounts = new Map<string, number>();
  signs.forEach((sign) => signCounts.set(sign, (signCounts.get(sign) ?? 0) + 1));
  return {
    count: baselineDays.length,
    energy: median(baselineDays.map((day) => day.energy)),
    clarity: median(baselineDays.map((day) => day.clarity)),
    sleepHours: median(baselineDays.map((day) => day.sleepHours)),
    overallState: mode(baselineDays.map((day) => day.overallState)),
    amfexaDose: median(baselineDays.map((day) => day.amfexaDose)),
    hormonalSigns: [...signCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([sign]) => sign)
  };
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function latestMonthWithData(days: NormalizedTimelineDay[], fallbackDate: string): string {
  return days.length ? monthKey([...days].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.date) : monthKey(fallbackDate);
}

export function monthDates(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const total = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: total }, (_, index) => `${year}-${String(monthNumber).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildTimelineCsv(days: NormalizedTimelineDay[], clusters: CapacityCluster[]): string {
  const headers = [
    "date",
    "capacity_state",
    "energy",
    "executive_clarity",
    "sleep_hours",
    "overall_state",
    "hormonal_signs",
    "brain_fog",
    "head_swimming",
    "appetite_or_cravings",
    "activation",
    "amfexa_dose_mg",
    "amfexa_effect",
    "pmdd_medication",
    "possible_cluster_id",
    "short_notes"
  ];
  const rows = days.map((day) => {
    const cluster = clusters.find((candidate) => candidate.status !== "rejected" && day.date >= candidate.startDate && day.date <= candidate.endDate);
    return [
      day.date,
      day.capacityState ?? "Not enough data",
      day.energy,
      day.clarity,
      day.sleepHours,
      day.overallState,
      day.hormonalSigns.join(" | "),
      day.flags.brainFog ? "Yes" : "",
      day.flags.headSwimming ? "Yes" : "",
      day.flags.cravings || day.flags.increasedAppetite ? "Yes" : "",
      day.flags.activation ? "Yes" : "",
      day.amfexaDose,
      day.amfexaEffect,
      day.pmddMedicationTaken,
      cluster?.id ?? "",
      day.notes.join(" | ").slice(0, 300)
    ];
  });
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

export function activeSymptomKeys(day: NormalizedTimelineDay): SymptomKey[] {
  return symptomKeys.filter((key) => day.flags[key]);
}
