import { buildSummary, filterRecent, relationalStressLevel, relationalStressScore } from "./analytics";
import { getAllEntries } from "./db";
import type { DailyEntry } from "./schema";

const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const summaryRoot = document.querySelector<HTMLDivElement>("#summary-grid");
const weeklyInsightsRoot = document.querySelector<HTMLDivElement>("#weekly-insights");
const chartsRoot = document.querySelector<HTMLDivElement>("#charts");
const calendarRoot = document.querySelector<HTMLDivElement>("#calendar");
const entryList = document.querySelector<HTMLDivElement>("#entry-list");
const rangeButtons = document.querySelectorAll<HTMLButtonElement>("[data-range]");

let range = 7;
let entries: DailyEntry[] = [];

function stat(label: string, value: string | number): string {
  return `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`;
}

function chart(title: string, data: DailyEntry[], key: keyof DailyEntry, max = 10): string {
  if (!data.length) {
    return `
      <article class="chart-card">
        <h3>${title}</h3>
        <p class="empty-state">Not enough data yet.</p>
      </article>
    `;
  }
  const points = data.map((entry) => Number(entry[key]) || 0);
  const polyline = points
    .map((value, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 100 - Math.min(100, (value / max) * 100);
      return `${x},${y}`;
    })
    .join(" ");
  return `
    <article class="chart-card">
      <h3>${title}</h3>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${title}">
        <path d="M0 100 H100" />
        <polyline points="${polyline}" />
      </svg>
      <div class="chart-labels">${data.map((entry) => `<span>${entry.date.slice(5)}</span>`).join("")}</div>
    </article>
  `;
}

function hasNumber(entry: DailyEntry, key: "capacityRemainingScore"): boolean {
  return typeof entry[key] === "number";
}

function displayScore(value: number | ""): string {
  return typeof value === "number" ? String(value) : "not noted";
}

function topCapacityDays(data: DailyEntry[], highest: boolean): DailyEntry[] {
  return data
    .filter((entry) => typeof entry.capacityRemainingScore === "number")
    .sort((a, b) =>
      highest
        ? Number(b.capacityRemainingScore) - Number(a.capacityRemainingScore)
        : Number(a.capacityRemainingScore) - Number(b.capacityRemainingScore)
    )
    .slice(0, 2);
}

function activityRows(entry: DailyEntry): Array<{ type: string; meaning: number | ""; time: string; executiveDemand: number | ""; capacityEffect: string }> {
  return [
    {
      type: entry.activity1Type,
      meaning: entry.activity1MeaningScore,
      time: entry.activity1Time,
      executiveDemand: entry.activity1ExecutiveDemandScore,
      capacityEffect: entry.activity1CapacityEffect
    },
    {
      type: entry.activity2Type,
      meaning: entry.activity2MeaningScore,
      time: entry.activity2Time,
      executiveDemand: entry.activity2ExecutiveDemandScore,
      capacityEffect: entry.activity2CapacityEffect
    },
    {
      type: entry.activity3Type,
      meaning: entry.activity3MeaningScore,
      time: entry.activity3Time,
      executiveDemand: entry.activity3ExecutiveDemandScore,
      capacityEffect: entry.activity3CapacityEffect
    },
    {
      type: entry.activity4Type,
      meaning: entry.activity4MeaningScore,
      time: entry.activity4Time,
      executiveDemand: entry.activity4ExecutiveDemandScore,
      capacityEffect: entry.activity4CapacityEffect
    }
  ].filter((activity) => activity.type);
}

function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]} (${top[1]})` : "Not enough data yet";
}

function renderWeeklyInsights(data: DailyEntry[]): void {
  if (!weeklyInsightsRoot) return;
  const bestCapacity = topCapacityDays(data, true);
  const worstCapacity = topCapacityDays(data, false);
  const activities = data.flatMap(activityRows);
  const highestMeaning = activities
    .filter((activity) => typeof activity.meaning === "number")
    .sort((a, b) => Number(b.meaning) - Number(a.meaning))[0];
  const highestActivityExecutiveDemand = activities
    .filter((activity) => typeof activity.executiveDemand === "number")
    .sort((a, b) => Number(b.executiveDemand) - Number(a.executiveDemand))[0];
  const energisingActivities = activities.filter((activity) =>
    ["Much more energised", "Slightly more energised"].includes(activity.capacityEffect)
  );
  const drainingActivities = activities.filter((activity) => ["Slightly drained", "Very drained"].includes(activity.capacityEffect));
  const computerCrashDays = data.filter(
    (entry) =>
      (entry.executiveDemandTypes.includes("Computer work") || entry.load.includes("Computer work")) &&
      ["Afternoon crash", "Evening crash", "Up and down", "Exhausted / pushed too far"].includes(entry.energyPattern)
  );
  const hormonalExecutiveDays = data.filter(
    (entry) =>
      (entry.familiarHormonalPattern === "Slightly" ||
        entry.familiarHormonalPattern === "Yes" ||
        (entry.hormonalSigns.length > 0 && !entry.hormonalSigns.includes("No noticeable signs"))) &&
      entry.clarityScore <= 5
  );
  const weakMedicationDays = data.filter((entry) => entry.amfexaEffect === "Too weak");
  const highCapacityRecovery = data
    .filter((entry) => typeof entry.capacityRemainingScore === "number" && entry.capacityRemainingScore >= 7)
    .flatMap((entry) => entry.recovery);
  const sleepNextCapacity = data
    .slice(0, -1)
    .filter((entry, index) => entry.sleepQuality === "Poor" && typeof data[index + 1]?.capacityRemainingScore === "number")
    .map((entry, index) => `${entry.date} -> ${data[index + 1].capacityRemainingScore}/10 next day`);

  const items = [
    `Best capacity days: ${bestCapacity.length ? bestCapacity.map((entry) => `${entry.date} (${entry.capacityRemainingScore}/10)`).join(", ") : "Not enough data yet"}`,
    `Worst capacity days: ${worstCapacity.length ? worstCapacity.map((entry) => `${entry.date} (${entry.capacityRemainingScore}/10)`).join(", ") : "Not enough data yet"}`,
    `Biggest energy drains: ${mostCommon(data.map((entry) => entry.biggestEnergyDrain))}`,
    `Most common executive friction: ${mostCommon(data.flatMap((entry) => entry.executiveFriction))}`,
    `Activities with highest meaning/contentment: ${highestMeaning ? `${highestMeaning.type} (${highestMeaning.meaning}/10)` : "Not enough data yet"}`,
    `Highest activity executive demand: ${highestActivityExecutiveDemand ? `${highestActivityExecutiveDemand.type} (${highestActivityExecutiveDemand.executiveDemand}/10)` : "Not enough data yet"}`,
    `Activities that tended to energise me: ${mostCommon(energisingActivities.map((activity) => activity.type))}`,
    `Activities that tended to drain me: ${mostCommon(drainingActivities.map((activity) => activity.type))}`,
    `Computer work and crashes: ${computerCrashDays.length ? `${computerCrashDays.length} day${computerCrashDays.length === 1 ? "" : "s"} matched.` : "No clear link yet."}`,
    `Hormonal signs and executive capacity: ${hormonalExecutiveDays.length ? `${hormonalExecutiveDays.length} lower-clarity hormonal day${hormonalExecutiveDays.length === 1 ? "" : "s"}.` : "No clear link yet."}`,
    `Amfexa dose/effect patterns: ${weakMedicationDays.length ? `${weakMedicationDays.length} day${weakMedicationDays.length === 1 ? "" : "s"} felt too weak.` : "No clear pattern yet."}`,
    `Recovery strategies that actually helped: ${mostCommon(highCapacityRecovery)}`,
    `Sleep and next-day capacity: ${sleepNextCapacity[0] ?? "Not enough linked days yet."}`,
    `Repeated early warning signs: ${mostCommon(data.map((entry) => entry.earlyWarningSigns))}`
  ];

  weeklyInsightsRoot.innerHTML = items.map((item) => `<article class="insight-card"><p>${item}</p></article>`).join("");
}

function render(): void {
  const recent = filterRecent(entries, range);
  const summary = buildSummary(recent);

  if (summaryRoot) {
    summaryRoot.innerHTML = [
      stat("Average energy", summary.averageEnergy.toFixed(1)),
      stat("Average clarity", summary.averageClarity.toFixed(1)),
      stat("Average capability", summary.averageCapacityRemaining ? summary.averageCapacityRemaining.toFixed(1) : "Not enough yet"),
      stat(
        "Average activity executive demand",
        summary.averageActivityExecutiveDemand ? summary.averageActivityExecutiveDemand.toFixed(1) : "Not enough yet"
      ),
      stat("Average activity meaning", summary.averageMeaningContentment ? summary.averageMeaningContentment.toFixed(1) : "Not enough yet"),
      stat("Average sleep", `${summary.averageSleep.toFixed(1)}h`),
      stat("Low-energy days", summary.lowEnergyDays),
      stat("High-energy days", summary.highEnergyDays),
      stat("Crash / up-down days", summary.crashDays),
      stat("Exhausted end-of-day", summary.exhaustedEndDays),
      stat("High executive demand days", summary.highExecutiveDemandDays),
      stat("Loud inner critic days", summary.highInnerCriticDays),
      stat("Poor sleep days", summary.poorSleepDays),
      stat("Relational stress days", summary.relationalStressDays),
      stat("Hormonal sign days", summary.hormonalDays),
      stat("Medication felt weak days", summary.weakMedicationDays),
      stat("Activated on waking", summary.activatedOnWakingDays),
      stat("Training readout", summary.trainingReadout)
    ].join("");
  }

  renderWeeklyInsights(recent);

  if (chartsRoot) {
    chartsRoot.innerHTML = recent.length
      ? [
          chart("Energy", recent, "energyScore"),
          chart("Executive clarity", recent, "clarityScore"),
          chart("Capability", recent.filter((entry) => hasNumber(entry, "capacityRemainingScore")), "capacityRemainingScore"),
          chart("Sleep hours", recent, "sleepHours", 12),
          chart("Relational stress score", recent.map((entry) => ({ ...entry, score: relationalStressScore(entry) })) as DailyEntry[], "score" as keyof DailyEntry, 9)
        ].join("")
      : `<p class="empty-state">No entries yet. Once a day is saved, patterns can start forming here.</p>`;
  }

  if (calendarRoot) {
    calendarRoot.innerHTML = recent
      .map(
        (entry) => `
          <a class="day-tile" href="${base}?date=${entry.date}">
            <span>${entry.date.slice(5)}</span>
            <strong>${entry.energyScore}</strong>
          </a>
        `
      )
      .join("");
  }

  if (entryList) {
    entryList.innerHTML = [...recent]
      .reverse()
      .map(
        (entry) => `
        <article class="entry-row">
          <div>
            <h3>${entry.date}</h3>
            <p>Energy ${entry.energyScore}/10 - Clarity ${entry.clarityScore}/10 - Capability ${displayScore(entry.capacityRemainingScore)}/10 - ${relationalStressLevel(relationalStressScore(entry))} relational stress</p>
          </div>
          <a class="secondary-button" href="${base}?date=${entry.date}">Edit</a>
        </article>
      `
      )
      .join("");
  }
}

rangeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    range = Number(button.dataset.range || 7);
    rangeButtons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    render();
  });
});

entries = await getAllEntries();
render();
