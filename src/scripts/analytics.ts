import type { DailyEntry } from "./schema";

export const relationalWeights: Record<string, number> = {
  "Relationship stress": 3,
  "Feeling trapped": 3,
  "Feeling unsupported/carrying too much": 3,
  Conflict: 2,
  "Self-silencing/keeping things in": 2,
  "Emotional conversations": 1
};

export function relationalStressScore(entry: DailyEntry): number {
  return entry.load.reduce((total, item) => total + (relationalWeights[item] ?? 0), 0);
}

export function relationalStressLevel(score: number): "Low" | "Moderate" | "High" {
  if (score >= 6) return "High";
  if (score >= 3) return "Moderate";
  return "Low";
}

export function filterRecent(entries: DailyEntry[], days: number): DailyEntry[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.slice(Math.max(0, sorted.length - days));
}

export function average(values: number[]): number {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return 0;
  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

export function countWhere(entries: DailyEntry[], predicate: (entry: DailyEntry) => boolean): number {
  return entries.filter(predicate).length;
}

export function hasFatigue(entry: DailyEntry): boolean {
  return entry.fatigueLevel === "Mild" || entry.fatigueLevel === "Moderate" || entry.fatigueLevel === "Significant";
}

function hasTiredEnergyPattern(entry: DailyEntry): boolean {
  return (
    entry.energyPattern === "Tired but functional" ||
    entry.energyPattern === "Exhausted / pushed too far" ||
    entry.endOfDayEnergy === "Exhausted / did too much" ||
    entry.endOfDayEnergy === "Running on fumes"
  );
}

function hasExecutiveDemand(entry: DailyEntry): boolean {
  return (
    entry.executiveDemandLevel === "High" ||
    entry.executiveDemandLevel === "Very high" ||
    entry.load.includes("High cognitive demand") ||
    entry.load.includes("Too many decisions") ||
    entry.load.includes("Too many task switches") ||
    entry.load.includes("Constant interruptions") ||
    entry.executiveFriction.includes("Too many decisions") ||
    entry.executiveFriction.includes("Task switching") ||
    entry.executiveFriction.includes("Interruptions")
  );
}

export interface CrashDriver {
  label: string;
  crashRate: number;
  comparisonRate: number;
  difference: number;
  crashDays: number;
}

export interface CrashDriverAnalysis {
  crashDays: number;
  comparisonDays: number;
  drivers: CrashDriver[];
  coffeeDetail: string;
}

export interface SleepTimingAnalysis {
  recordedDays: number;
  typicalSleepTime: string;
  typicalWakeTime: string;
  sleepTimeVariationMinutes: number | null;
  wakeTimeVariationMinutes: number | null;
  status: string;
  lateCoffeeDetail: string;
}

export interface WhoopCapacityComparison {
  pairedDays: number;
  sameBandDays: number;
  differentBandDays: number;
  highWhoopReducedCapacityDays: number;
  lowWhoopBaselineDays: number;
  status: string;
}

export function buildWhoopCapacityComparison(entries: DailyEntry[]): WhoopCapacityComparison {
  const paired = entries.filter((entry) => typeof entry.whoopRecoveryScore === "number" && Number.isFinite(entry.whoopRecoveryScore));
  const whoopBand = (score: number) => score >= 67 ? 2 : score >= 34 ? 1 : 0;
  const capacityBand = (entry: DailyEntry) => {
    if (entry.energyScore >= 7 && entry.clarityScore >= 7) return 2;
    if (entry.energyScore <= 4 || entry.clarityScore <= 4) return 0;
    return 1;
  };
  const sameBandDays = paired.filter((entry) => whoopBand(Number(entry.whoopRecoveryScore)) === capacityBand(entry)).length;
  const highWhoopReducedCapacityDays = paired.filter((entry) => whoopBand(Number(entry.whoopRecoveryScore)) === 2 && capacityBand(entry) === 0).length;
  const lowWhoopBaselineDays = paired.filter((entry) => whoopBand(Number(entry.whoopRecoveryScore)) === 0 && capacityBand(entry) === 2).length;
  const status = paired.length < 10
    ? "At least 10 paired days are needed before comparing WHOOP Recovery with subjective capacity."
    : sameBandDays / paired.length >= 0.7
      ? `WHOOP Recovery and subjective capacity were in the same broad band on ${sameBandDays} of ${paired.length} paired days.`
      : sameBandDays / paired.length <= 0.5
        ? `WHOOP Recovery and subjective capacity were in different broad bands on ${paired.length - sameBandDays} of ${paired.length} paired days.`
        : `WHOOP Recovery and subjective capacity showed a mixed relationship: the broad bands matched on ${sameBandDays} of ${paired.length} paired days.`;
  return {
    pairedDays: paired.length,
    sameBandDays,
    differentBandDays: paired.length - sameBandDays,
    highWhoopReducedCapacityDays,
    lowWhoopBaselineDays,
    status
  };
}

function isCrashPattern(entry: DailyEntry): boolean {
  return ["Afternoon crash", "Evening crash", "Up and down", "Exhausted / pushed too far"].includes(entry.energyPattern);
}

function timeInMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function sleepTimeInMinutes(value: string): number | null {
  const minutes = timeInMinutes(value);
  return minutes !== null && minutes < 12 * 60 ? minutes + 24 * 60 : minutes;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function medianDeviation(values: number[], centre: number | null): number | null {
  return centre === null ? null : median(values.map((value) => Math.abs(value - centre)));
}

function formatMinutes(value: number | null): string {
  if (value === null) return "Not enough data";
  const withinDay = Math.round(value) % (24 * 60);
  return `${String(Math.floor(withinDay / 60)).padStart(2, "0")}:${String(withinDay % 60).padStart(2, "0")}`;
}

export function buildSleepTimingAnalysis(entries: DailyEntry[]): SleepTimingAnalysis {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const sleepTimes = sorted.map((entry) => sleepTimeInMinutes(entry.sleepOnsetTime)).filter((value): value is number => value !== null);
  const wakeTimes = sorted.map((entry) => timeInMinutes(entry.wakingTime)).filter((value): value is number => value !== null);
  const sleepMedian = median(sleepTimes);
  const wakeMedian = median(wakeTimes);
  const sleepVariation = medianDeviation(sleepTimes, sleepMedian);
  const wakeVariation = medianDeviation(wakeTimes, wakeMedian);
  const recordedDays = Math.min(sleepTimes.length, wakeTimes.length);
  const hasVariation = (sleepVariation !== null && sleepVariation >= 60) || (wakeVariation !== null && wakeVariation >= 60);
  const status = recordedDays < 7
    ? "Not enough sleep-timing data yet"
    : hasVariation
      ? "Sleep timing has varied by an hour or more from its typical pattern"
      : "No clear schedule-irregularity signal in the recorded sleep timing";
  let lateCoffeeDays = 0;
  let followedByCrash = 0;
  const byDate = new Map(sorted.map((entry) => [entry.date, entry]));
  for (const entry of sorted) {
    const coffee = timeInMinutes(entry.lastCoffeeTime);
    if (coffee === null || coffee < 14 * 60) continue;
    lateCoffeeDays += 1;
    const next = byDate.get(new Date(new Date(`${entry.date}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10));
    if (next && isCrashPattern(next)) followedByCrash += 1;
  }
  const lateCoffeeDetail = lateCoffeeDays
    ? `Coffee after 14:00 was recorded on ${lateCoffeeDays} day${lateCoffeeDays === 1 ? "" : "s"}; a next-day crash pattern followed ${followedByCrash} time${followedByCrash === 1 ? "" : "s"}.`
    : "No coffee after 14:00 has been recorded yet.";
  return {
    recordedDays,
    typicalSleepTime: formatMinutes(sleepMedian),
    typicalWakeTime: formatMinutes(wakeMedian),
    sleepTimeVariationMinutes: sleepVariation,
    wakeTimeVariationMinutes: wakeVariation,
    status,
    lateCoffeeDetail
  };
}

export function buildCrashDriverAnalysis(entries: DailyEntry[]): CrashDriverAnalysis {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const answered = sorted.filter((entry) => Boolean(entry.energyPattern));
  const crashes = answered.filter(isCrashPattern);
  const comparison = answered.filter((entry) => !isCrashPattern(entry));
  const wakingMedian = median(answered.map((entry) => timeInMinutes(entry.wakingTime)).filter((value): value is number => value !== null));
  const sleepMedian = median(answered.map((entry) => sleepTimeInMinutes(entry.sleepOnsetTime)).filter((value): value is number => value !== null));
  const previousByDate = new Map(sorted.map((entry) => [entry.date, entry]));
  const previousDay = (entry: DailyEntry) => previousByDate.get(previousDate(entry.date));
  const factors: Array<{ label: string; test: (entry: DailyEntry) => boolean }> = [
    { label: "Poor or disrupted sleep", test: (entry) => entry.sleepQuality === "Poor" || entry.sleepFragmentation === "Yes" || entry.feltRestored === "No" },
    { label: "Hormonal signs / familiar pattern", test: (entry) => entry.familiarHormonalPattern === "Slightly" || entry.familiarHormonalPattern === "Yes" || entry.hormonalSigns.some((sign) => sign !== "No noticeable signs") },
    { label: "High cognitive demand", test: hasExecutiveDemand },
    { label: "Relational load", test: (entry) => relationalStressScore(entry) >= 3 },
    {
      label: "Activation",
      test: (entry) =>
        (Boolean(entry.activationFirstNotice) && !["Not at all", "I did not experience activation today"].includes(entry.activationFirstNotice)) ||
        entry.activationSigns.some((sign) => sign !== "None")
    },
    { label: "ADHD medication felt too weak", test: (entry) => entry.amfexaEffect === "Too weak" },
    { label: "Pain, heat or physical discomfort", test: (entry) => entry.load.some((item) => ["Pain / physical discomfort", "Heat"].includes(item)) },
    { label: "Heavy previous-day mental or physical load", test: (entry) => Boolean(previousDay(entry)?.load.some((item) => ["High cognitive demand", "Intense work day", "Heavy training"].includes(item))) },
    { label: "Earlier waking than my usual", test: (entry) => { const waking = timeInMinutes(entry.wakingTime); return waking !== null && wakingMedian !== null && waking <= wakingMedian - 30; } },
    { label: "Sleep timing differed from my usual", test: (entry) => { const sleep = sleepTimeInMinutes(entry.sleepOnsetTime); const waking = timeInMinutes(entry.wakingTime); return (sleep !== null && sleepMedian !== null && Math.abs(sleep - sleepMedian) >= 60) || (waking !== null && wakingMedian !== null && Math.abs(waking - wakingMedian) >= 60); } },
    { label: "Feeling unwell / illness", test: (entry) => entry.load.includes("Feeling unwell / illness") },
    { label: "Long gap without food", test: (entry) => entry.load.includes("Long gap without food") },
    { label: "Not enough fluids", test: (entry) => entry.load.includes("Not enough fluids") }
  ];
  const drivers = crashes.length >= 3 && comparison.length >= 3
    ? factors.map((factor) => {
        const crashCount = crashes.filter(factor.test).length;
        const comparisonCount = comparison.filter(factor.test).length;
        const crashRate = crashCount / crashes.length;
        const comparisonRate = comparisonCount / comparison.length;
        return { label: factor.label, crashRate, comparisonRate, difference: crashRate - comparisonRate, crashDays: crashCount };
      }).filter((driver) => driver.crashDays >= 2 && driver.difference >= 0.15)
        .sort((left, right) => right.difference - left.difference || right.crashDays - left.crashDays)
        .slice(0, 5)
    : [];
  const coffeeEligible = answered.filter((entry) => entry.date >= "2026-08-07" || entry.coffees > 0);
  const coffeeCrash = coffeeEligible.filter(isCrashPattern).map((entry) => entry.coffees);
  const coffeeComparison = coffeeEligible.filter((entry) => !isCrashPattern(entry)).map((entry) => entry.coffees);
  const coffeeDetail = coffeeCrash.length >= 3 && coffeeComparison.length >= 3
    ? `Crash-pattern days averaged ${average(coffeeCrash).toFixed(1)} coffees versus ${average(coffeeComparison).toFixed(1)} on other days.`
    : "Not enough coffee and crash-pattern data yet.";
  return { crashDays: crashes.length, comparisonDays: comparison.length, drivers, coffeeDetail };
}

function answeredNumber(value: number | ""): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function currentFatigueStreak(entries: DailyEntry[]): number {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(sorted.map((entry) => [entry.date, entry]));
  let latest = sorted.at(-1);
  if (!latest || !hasFatigue(latest)) return 0;

  let streak = 0;
  while (latest && hasFatigue(latest)) {
    streak += 1;
    latest = byDate.get(previousDate(latest.date));
  }
  return streak;
}

export function longestFatigueStreakThisMonth(entries: DailyEntry[]): number {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest) return 0;
  const month = latest.date.slice(0, 7);
  const monthEntries = sorted.filter((entry) => entry.date.startsWith(month));
  let longest = 0;
  let current = 0;
  let lastDate = "";

  for (const entry of monthEntries) {
    const isConsecutive = lastDate ? previousDate(entry.date) === lastDate : false;
    current = hasFatigue(entry) ? (isConsecutive ? current + 1 : 1) : 0;
    longest = Math.max(longest, current);
    lastDate = entry.date;
  }

  return longest;
}

export function fatigueStats(entries: DailyEntry[]) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  const start = latest ? new Date(`${latest.date}T00:00:00`) : undefined;
  if (start) start.setDate(start.getDate() - 29);
  const startIso = start?.toISOString().slice(0, 10) ?? "";
  const recent30 = startIso ? sorted.filter((entry) => entry.date >= startIso) : [];
  const fatigueDays = recent30.filter(hasFatigue);

  return {
    currentStreak: currentFatigueStreak(sorted),
    longestThisMonth: longestFatigueStreakThisMonth(sorted),
    daysLast30: fatigueDays.length,
    withBloating: countWhere(
      fatigueDays,
      (entry) => entry.hormonalSigns.includes("Bloating") || entry.digestiveSymptoms.includes("Bloating")
    ),
    withPoorSleep: countWhere(fatigueDays, (entry) => entry.sleepQuality === "Poor"),
    withHormonalPattern: countWhere(
      fatigueDays,
      (entry) => entry.familiarHormonalPattern === "Slightly" || entry.familiarHormonalPattern === "Yes"
    )
  };
}

export function nextDayEnergyAfterTraining(entries: DailyEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const changes: number[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (current.movedToday === "Yes" || current.movementTypes.length > 0) {
      changes.push(next.energyScore - current.energyScore);
    }
  }

  if (!changes.length) return "Not enough data yet";
  const avg = average(changes);
  if (avg >= 0.5) return `Next-day energy rose by ${avg.toFixed(1)} on average after training/movement.`;
  if (avg <= -0.5) return `Next-day energy dipped by ${Math.abs(avg).toFixed(1)} on average after training/movement.`;
  return "Training did not appear to worsen next-day energy in this range.";
}

export function buildSummary(entries: DailyEntry[]) {
  return {
    averageEnergy: average(entries.map((entry) => entry.energyScore)),
    averageClarity: average(entries.map((entry) => entry.clarityScore)),
    averageCapacityRemaining: average(entries.map((entry) => entry.capacityRemainingScore).filter(answeredNumber)),
    averageSleep: average(entries.map((entry) => entry.sleepHours)),
    lowEnergyDays: countWhere(entries, (entry) => entry.energyScore <= 4),
    highEnergyDays: countWhere(entries, (entry) => entry.energyScore >= 8),
    crashDays: countWhere(entries, (entry) => ["Afternoon crash", "Evening crash", "Up and down"].includes(entry.energyPattern)),
    highExecutiveDemandDays: countWhere(entries, hasExecutiveDemand),
    poorSleepDays: countWhere(entries, (entry) => entry.sleepQuality === "Poor"),
    relationalStressDays: countWhere(entries, (entry) => relationalStressScore(entry) >= 3),
    hormonalDays: countWhere(
      entries,
      (entry) =>
        (entry.hormonalSigns.length > 0 && !entry.hormonalSigns.includes("No noticeable signs")) ||
        entry.familiarHormonalPattern === "Slightly" ||
        entry.familiarHormonalPattern === "Yes"
    ),
    weakMedicationDays: countWhere(entries, (entry) => entry.amfexaEffect === "Too weak"),
    activatedOnWakingDays: countWhere(entries, (entry) => entry.activationFirstNotice === "Immediately on waking"),
    trainingReadout: nextDayEnergyAfterTraining(entries)
  };
}

export function buildInsights(entries: DailyEntry[]): string[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const insights: string[] = [];

  if (sorted.length < 4) {
    insights.push("Not enough data yet for strong pattern notes. A few more entries will make this kinder and more useful.");
  }

  const poorSleepRelStress = sorted.filter(
    (entry) => entry.sleepQuality === "Poor" && relationalStressScore(entry) >= 3 && entry.energyScore <= 4
  );
  if (poorSleepRelStress.length) {
    insights.push("Lower energy appeared alongside poor sleep and moderate/high relational stress. This may be worth watching.");
  }

  const flowHighEnergy = sorted.filter(
    (entry) => entry.energyScore >= 8 && (entry.recovery.includes("Creativity") || entry.recovery.includes("Flow state"))
  );
  if (flowHighEnergy.length >= 2) {
    insights.push("High energy days often included creativity or flow. That may be a regulating signal, not just output.");
  }

  const connectionRegulated = sorted.filter(
    (entry) => entry.recovery.includes("Meaningful connection") && (entry.overallState === "Calm" || entry.overallState === "Balanced" || entry.recovery.includes("Being heard/seen"))
  );
  if (connectionRegulated.length >= 2) {
    insights.push("Meaningful connection appeared alongside better regulation or feeling heard/seen.");
  }

  const weakMedicationLowClarity = sorted.filter((entry) => entry.amfexaEffect === "Too weak" && entry.clarityScore <= 5);
  if (weakMedicationLowClarity.length) {
    insights.push("Medication feeling too weak appeared alongside lower clarity at least once. This may be worth watching gently.");
  }

  const tiredPatternBloating = sorted.filter(
    (entry) => hasTiredEnergyPattern(entry) && (entry.hormonalSigns.includes("Bloating") || entry.digestiveSymptoms.includes("Bloating"))
  );
  if (tiredPatternBloating.length >= 2) {
    insights.push("Tired/exhausted energy patterns and bloating have appeared together more than once. This may be worth watching gently.");
  }
  const tiredPatternPoorSleep = sorted.filter((entry) => hasTiredEnergyPattern(entry) && entry.sleepQuality === "Poor");
  if (tiredPatternPoorSleep.length >= 2) {
    insights.push("Tired/exhausted energy patterns and poor sleep have appeared together more than once.");
  }
  const tiredPatternHormonal = sorted.filter(
    (entry) => hasTiredEnergyPattern(entry) && (entry.familiarHormonalPattern === "Slightly" || entry.familiarHormonalPattern === "Yes")
  );
  if (tiredPatternHormonal.length >= 2) {
    insights.push("Tired/exhausted energy patterns have appeared alongside familiar hormonal-pattern days more than once.");
  }

  const executiveDemandLowReserve = sorted.filter(
    (entry) => hasExecutiveDemand(entry) && answeredNumber(entry.capacityRemainingScore) && entry.capacityRemainingScore <= 3
  );
  if (executiveDemandLowReserve.length >= 2) {
    insights.push("High executive demand appeared alongside low capacity more than once. This may help explain capacity dips even when energy is not the whole story.");
  }

  const wakingActivation = sorted.filter((entry) => entry.activationFirstNotice === "Immediately on waking");
  if (wakingActivation.length >= 2) {
    insights.push("Activation was noticed immediately on waking more than once. This may be a useful baseline signal to watch.");
  }

  const defensiveLowCapacity = sorted.filter(
    (entry) => entry.activationSigns.includes("Defensive / reactive") && entry.capacityRemainingScore !== "" && entry.capacityRemainingScore <= 4
  );
  if (defensiveLowCapacity.length >= 2) {
    insights.push("Defensive/reactive activation signs appeared alongside lower remaining capacity more than once.");
  }

  const crashAnalysis = buildCrashDriverAnalysis(sorted);
  if (crashAnalysis.drivers.length) {
    insights.push(`Possible crash contributors: ${crashAnalysis.drivers.slice(0, 3).map((driver) => `${driver.label} (${Math.round(driver.crashRate * 100)}% of crash-pattern days vs ${Math.round(driver.comparisonRate * 100)}% of other days)`).join("; ")}. These are associations, not confirmed causes.`);
  }

  const familiarHormonalCluster = sorted.filter(
    (entry) =>
      (entry.familiarHormonalPattern === "Slightly" || entry.familiarHormonalPattern === "Yes") &&
      (hasTiredEnergyPattern(entry) ||
        entry.hotWaking === "Yes" ||
        entry.hormonalSigns.includes("Increased sensitivity") ||
        entry.hormonalSigns.includes("Bloating"))
  );
  if (familiarHormonalCluster.length >= 2) {
    insights.push("Days that felt like the familiar hormonal pattern also carried other hormonal markers. This may become a useful shorthand with more entries.");
  }

  const bloatingEarlyWaking = sorted.filter((entry) => entry.hormonalSigns.includes("Bloating") && entry.wakingTime);
  if (bloatingEarlyWaking.length >= 2) {
    insights.push("Bloating and early waking have appeared together more than once.");
  }

  const bloatingReducedBowel = sorted.filter(
    (entry) =>
      (entry.hormonalSigns.includes("Bloating") || entry.digestiveSymptoms.includes("Bloating")) &&
      (entry.bowelMovementToday === "No" ||
        entry.digestiveSymptoms.includes("Fewer bowel movements than usual") ||
        entry.digestiveSymptoms.includes("Constipation feeling") ||
        entry.bowelMovementDescription === "Smaller/less complete than usual")
  );
  if (bloatingReducedBowel.length >= 2) {
    insights.push("Bloating and reduced bowel movement frequency appeared together. This may be worth watching as a possible hormonal transition marker.");
  }

  const completeAfterReduced = sorted.filter((entry, index) => {
    const previous = sorted[index - 1];
    if (!previous) return false;
    const previousReduced =
      previous.bowelMovementToday === "No" ||
      previous.digestiveSymptoms.includes("Fewer bowel movements than usual") ||
      previous.bowelMovementDescription === "Smaller/less complete than usual";
    return previousReduced && entry.bowelMovementDescription === "More complete than usual";
  });
  if (completeAfterReduced.length) {
    insights.push(`A more complete bowel movement appeared after reduced bowel movement signs ${completeAfterReduced.length} time${completeAfterReduced.length === 1 ? "" : "s"}.`);
  }

  const digestionHormonalCluster = sorted.filter((entry) => {
    const digestionChange =
      entry.bowelMovementToday === "No" ||
      entry.bowelMovementDescription === "Hard/difficult" ||
      entry.bowelMovementDescription === "Loose" ||
      entry.bowelMovementDescription === "More complete than usual" ||
      entry.bowelMovementDescription === "Smaller/less complete than usual" ||
      entry.digestiveSymptoms.some((symptom) => symptom !== "None");
    const hormonalSignal =
      entry.familiarHormonalPattern === "Slightly" ||
      entry.familiarHormonalPattern === "Yes" ||
      hasTiredEnergyPattern(entry) ||
      entry.hotWaking === "Yes" ||
      entry.hormonalSigns.some((sign) =>
        ["Unusual body aches or pains", "Increased sensitivity", "Head pressure/tension", "Bloating"].includes(sign)
      );
    return digestionChange && hormonalSignal;
  });
  if (digestionHormonalCluster.length >= 2) {
    insights.push("Digestive changes appeared alongside other possible hormonal signs. This is a supporting marker, not the main signal.");
  }

  insights.push(nextDayEnergyAfterTraining(sorted));

  const relationalBeforeLowerEnergy = sorted.filter((entry, index) => {
    const next = sorted[index + 1];
    return next && relationalStressScore(entry) >= 3 && next.energyScore <= 4;
  });
  if (relationalBeforeLowerEnergy.length) {
    insights.push("Moderate/high relational stress appeared before lower next-day energy at least once.");
  }

  const trappedLowEnergy = sorted.filter(
    (entry) =>
      entry.energyScore <= 4 &&
      (entry.load.includes("Feeling trapped") || entry.load.includes("Self-silencing/keeping things in"))
  );
  if (trappedLowEnergy.length) {
    insights.push("Feeling trapped or self-silencing appeared on lower-energy days. This may be one of the clearer capacity signals.");
  }

  return [...new Set(insights)];
}

export function describeNextDayEnergyChange(entries: DailyEntry[]) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const rows = sorted
    .map((entry, index) => {
      const next = sorted[index + 1];
      if (!next) return undefined;
      const score = relationalStressScore(entry);
      return {
        date: entry.date,
        score,
        level: relationalStressLevel(score),
        energy: entry.energyScore,
        nextEnergy: next.energyScore,
        change: next.energyScore - entry.energyScore
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const stressed = rows.filter((row) => row.score >= 3);
  if (!stressed.length) {
    return {
      label: "Not enough relational-stress data yet",
      detail: "Once a few days include relational load, this will show how next-day energy tended to feel afterwards.",
      tone: "neutral",
      rows
    };
  }

  const avgChange = average(stressed.map((row) => row.change));
  if (avgChange <= -1) {
    return {
      label: "Energy often softened the next day",
      detail: `After moderate/high relational stress, next-day energy has shifted by ${avgChange.toFixed(1)} on average.`,
      tone: "warm",
      rows
    };
  }
  if (avgChange >= 1) {
    return {
      label: "Energy often held or lifted the next day",
      detail: `After moderate/high relational stress, next-day energy has shifted by +${avgChange.toFixed(1)} on average.`,
      tone: "calm",
      rows
    };
  }
  return {
    label: "Next-day energy looks fairly steady so far",
    detail: "Relational stress has not clearly pulled next-day energy in one direction yet.",
    tone: "neutral",
    rows
  };
}
