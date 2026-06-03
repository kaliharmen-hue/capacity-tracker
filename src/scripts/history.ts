import { buildSummary, filterRecent, relationalStressLevel, relationalStressScore } from "./analytics";
import { getAllEntries } from "./db";
import type { DailyEntry } from "./schema";

const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const summaryRoot = document.querySelector<HTMLDivElement>("#summary-grid");
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

function render(): void {
  const recent = filterRecent(entries, range);
  const summary = buildSummary(recent);

  if (summaryRoot) {
    summaryRoot.innerHTML = [
      stat("Average energy", summary.averageEnergy.toFixed(1)),
      stat("Average clarity", summary.averageClarity.toFixed(1)),
      stat("Average sleep", `${summary.averageSleep.toFixed(1)}h`),
      stat("Low-energy days", summary.lowEnergyDays),
      stat("High-energy days", summary.highEnergyDays),
      stat("Poor sleep days", summary.poorSleepDays),
      stat("Relational stress days", summary.relationalStressDays),
      stat("Hormonal sign days", summary.hormonalDays),
      stat("Weak Amfexa days", summary.weakAmfexaDays),
      stat("3+ coffee days", summary.threeCoffeeDays),
      stat("Current fatigue streak", summary.fatigueCurrentStreak),
      stat("Longest fatigue streak this month", summary.fatigueLongestThisMonth),
      stat("Fatigue days, last 30", summary.fatigueDaysLast30),
      stat("Fatigue + bloating", summary.fatigueBloatingDays),
      stat("Fatigue + poor sleep", summary.fatiguePoorSleepDays),
      stat("Fatigue + luteal", summary.fatigueLutealDays),
      stat("Training readout", summary.trainingReadout)
    ].join("");
  }

  if (chartsRoot) {
    chartsRoot.innerHTML = recent.length
      ? [
          chart("Energy", recent, "energyScore"),
          chart("Brain clarity", recent, "clarityScore"),
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
            <p>Energy ${entry.energyScore}/10 · Clarity ${entry.clarityScore}/10 · ${relationalStressLevel(relationalStressScore(entry))} relational stress</p>
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
