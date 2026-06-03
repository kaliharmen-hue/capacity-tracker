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
    withLuteal: countWhere(fatigueDays, (entry) => entry.possibleLutealPhase === "Yes")
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
  const fatigue = fatigueStats(entries);
  return {
    averageEnergy: average(entries.map((entry) => entry.energyScore)),
    averageClarity: average(entries.map((entry) => entry.clarityScore)),
    averageSleep: average(entries.map((entry) => entry.sleepHours)),
    lowEnergyDays: countWhere(entries, (entry) => entry.energyScore <= 4),
    highEnergyDays: countWhere(entries, (entry) => entry.energyScore >= 8),
    poorSleepDays: countWhere(entries, (entry) => entry.sleepQuality === "Poor"),
    relationalStressDays: countWhere(entries, (entry) => relationalStressScore(entry) >= 3),
    hormonalDays: countWhere(
      entries,
      (entry) => entry.hormonalSigns.length > 0 && !entry.hormonalSigns.includes("No noticeable signs")
    ),
    weakAmfexaDays: countWhere(entries, (entry) => entry.activationSigns.includes("Amfexa felt weak/not noticeable")),
    threeCoffeeDays: countWhere(entries, (entry) => entry.coffees >= 3),
    fatigueCurrentStreak: fatigue.currentStreak,
    fatigueLongestThisMonth: fatigue.longestThisMonth,
    fatigueDaysLast30: fatigue.daysLast30,
    fatigueBloatingDays: fatigue.withBloating,
    fatiguePoorSleepDays: fatigue.withPoorSleep,
    fatigueLutealDays: fatigue.withLuteal,
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
    (entry) =>
      entry.recovery.includes("Meaningful connection") &&
      (entry.nervousSystemState.includes("Calm/regulated") || entry.recovery.includes("Being heard/seen"))
  );
  if (connectionRegulated.length >= 2) {
    insights.push("Meaningful connection appeared alongside better regulation or feeling heard/seen.");
  }

  const coffeeWeakAmfexa = sorted.filter(
    (entry) => entry.coffees >= 3 && entry.activationSigns.includes("Amfexa felt weak/not noticeable")
  );
  if (coffeeWeakAmfexa.length) {
    insights.push("3+ coffees appeared on days where Amfexa felt weak/not noticeable. This is worth watching gently.");
  }

  const fatigue = fatigueStats(sorted);
  if (fatigue.currentStreak > 0) {
    insights.push(`Current fatigue streak is ${fatigue.currentStreak} day${fatigue.currentStreak === 1 ? "" : "s"}. The app is calculating this automatically.`);
  }
  if (fatigue.withBloating >= 2) {
    insights.push("Fatigue and bloating have appeared together more than once. This may be worth watching gently.");
  }
  if (fatigue.withPoorSleep >= 2) {
    insights.push("Fatigue and poor sleep have appeared together more than once.");
  }
  if (fatigue.withLuteal >= 2) {
    insights.push("Fatigue has appeared alongside possible luteal phase days more than once.");
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
      entry.possiblePeriodSign === "Yes" ||
      hasFatigue(entry) ||
      entry.hotWaking === "Yes" ||
      entry.hormonalSigns.some((sign) =>
        ["Back pain", "Increased sensitivity", "Head pressure/tension", "Bloating"].includes(sign)
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
