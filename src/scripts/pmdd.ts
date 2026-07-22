import { getAllEntries } from "./db";
import type { DailyEntry } from "./schema";

interface MedicationPeriod {
  startDate: string;
  stopDate: string | null;
  lastTakenDate: string;
  medicationDays: DailyEntry[];
}

interface ClusterItem {
  label: string;
  courseCount: number;
}

const summaryRoot = document.querySelector<HTMLDivElement>("#pmdd-summary");
const clusterRoot = document.querySelector<HTMLDivElement>("#pmdd-cluster");
const periodsRoot = document.querySelector<HTMLDivElement>("#pmdd-periods");
const copyButton = document.querySelector<HTMLButtonElement>("#copy-pmdd-summary");
const copyStatus = document.querySelector<HTMLParagraphElement>("#pmdd-copy-status");

const entries = (await getAllEntries()).sort((a, b) => a.date.localeCompare(b.date));

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function daysBetween(first: string, second: string): number {
  return Math.round((parseDate(second).getTime() - parseDate(first).getTime()) / 86_400_000);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parseDate(date));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildPeriods(data: DailyEntry[]): MedicationPeriod[] {
  const periods: MedicationPeriod[] = [];
  let active: MedicationPeriod | null = null;

  for (const entry of data) {
    if (entry.pmddMedicationTaken === "Yes") {
      if (!active) {
        active = {
          startDate: entry.date,
          stopDate: null,
          lastTakenDate: entry.date,
          medicationDays: []
        };
        periods.push(active);
      }
      active.medicationDays.push(entry);
      active.lastTakenDate = entry.date;
    } else if (entry.pmddMedicationTaken === "No" && active) {
      active.stopDate = entry.date;
      active = null;
    }
  }

  return periods;
}

function addItems(target: Set<string>, values: string[] | undefined, ignored: string[] = []): void {
  for (const value of values ?? []) {
    if (value && !ignored.includes(value)) target.add(value);
  }
}

function symptomsForEntry(entry: DailyEntry): Set<string> {
  const symptoms = new Set<string>();
  addItems(symptoms, entry.hormonalSigns, ["No noticeable signs"]);
  addItems(symptoms, entry.digestiveSymptoms, ["None"]);
  addItems(symptoms, entry.activationSigns, ["None"]);
  addItems(symptoms, entry.socialTolerance, ["Neutral", "Wanted connection"]);
  addItems(symptoms, entry.emotionalState, ["Stable", "Calm", "Motivated"]);
  addItems(symptoms, entry.nervousSystemState, ["Calm/regulated", "Motivated/engaged"]);

  if (entry.energyScore <= 4) symptoms.add("Low usable energy");
  if (entry.clarityScore <= 5) symptoms.add("Lower executive clarity");
  if (entry.fatigueLevel && entry.fatigueLevel !== "No") symptoms.add(`${entry.fatigueLevel} fatigue`);
  if (entry.sleepQuality === "Poor") symptoms.add("Poor sleep");
  if (entry.hotWaking === "Yes") symptoms.add("Woke hot");
  if (entry.sleepFragmentation === "Yes") symptoms.add("Fragmented sleep");
  if (entry.ruminationOnWaking === "Yes") symptoms.add("Rumination on waking");
  if (["Afternoon crash", "Evening crash", "Up and down", "Tired but functional", "Exhausted / pushed too far"].includes(entry.energyPattern)) {
    symptoms.add(entry.energyPattern);
  }
  if (["Activated", "Wired", "Drained", "Shutdown"].includes(entry.overallState)) symptoms.add(entry.overallState);
  if (entry.familiarHormonalPattern === "Yes" || entry.familiarHormonalPattern === "Slightly") {
    symptoms.add(`Familiar hormonal pattern: ${entry.familiarHormonalPattern.toLowerCase()}`);
  }
  return symptoms;
}

function clusterForStart(startDate: string): Set<string> {
  const cluster = new Set<string>();
  for (const entry of entries) {
    const distance = daysBetween(entry.date, startDate);
    if (distance >= 0 && distance <= 3) {
      for (const symptom of symptomsForEntry(entry)) cluster.add(symptom);
    }
  }
  return cluster;
}

function typicalCluster(periods: MedicationPeriod[]): ClusterItem[] {
  const counts = new Map<string, number>();
  for (const period of periods) {
    for (const symptom of clusterForStart(period.startDate)) {
      counts.set(symptom, (counts.get(symptom) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, courseCount]) => ({ label, courseCount }))
    .sort((a, b) => b.courseCount - a.courseCount || a.label.localeCompare(b.label));
}

function sideEffectsForPeriod(period: MedicationPeriod): string[] {
  const effects = new Set<string>();
  for (const entry of period.medicationDays) addItems(effects, entry.medicationSideEffects, ["None"]);
  return [...effects];
}

function stat(label: string, value: string | number): string {
  return `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`;
}

function average(values: number[]): string {
  if (!values.length) return "Not enough yet";
  return `${(values.reduce((total, value) => total + value, 0) / values.length).toFixed(1)} days`;
}

function render(periods: MedicationPeriod[]): void {
  const intervals = periods.slice(1).map((period, index) => daysBetween(periods[index].startDate, period.startDate));
  const latest = periods.at(-1);

  if (summaryRoot) {
    summaryRoot.innerHTML = [
      stat("Medication periods", periods.length),
      stat("Latest start", latest ? formatDate(latest.startDate) : "Not recorded yet"),
      stat("Average time between starts", average(intervals)),
      stat("Current status", latest && !latest.stopDate ? "Taking medication" : "Not currently recorded as taking")
    ].join("");
  }

  const cluster = typicalCluster(periods);
  if (clusterRoot) {
    clusterRoot.innerHTML = cluster.length
      ? `<div class="pmdd-cluster-list">${cluster
          .map(
            (item) =>
              `<span class="pmdd-symptom"><strong>${escapeHtml(item.label)}</strong><small>${item.courseCount} of ${periods.length} start${periods.length === 1 ? "" : "s"}</small></span>`
          )
          .join("")}</div>`
      : `<p class="empty-state">There is not enough medication and symptom data yet. This will build as starts are recorded.</p>`;
  }

  if (periodsRoot) {
    periodsRoot.innerHTML = periods.length
      ? [...periods]
          .reverse()
          .map((period, reverseIndex) => {
            const originalIndex = periods.length - 1 - reverseIndex;
            const previous = periods[originalIndex - 1];
            const interval = previous ? daysBetween(previous.startDate, period.startDate) : null;
            const symptoms = [...clusterForStart(period.startDate)];
            const sideEffects = sideEffectsForPeriod(period);
            const notes = period.medicationDays.map((entry) => entry.medicationNotes).filter(Boolean);
            return `
              <article class="pmdd-period-card">
                <div class="pmdd-period-heading">
                  <div>
                    <span class="pattern-kicker">Period ${originalIndex + 1}</span>
                    <h3>${formatDate(period.startDate)}</h3>
                  </div>
                  <span class="pmdd-status ${period.stopDate ? "complete" : "current"}">${period.stopDate ? "Completed" : "Current"}</span>
                </div>
                <div class="pmdd-date-line" aria-label="Medication period dates">
                  <div><small>Started</small><strong>${formatDate(period.startDate)}</strong></div>
                  <span aria-hidden="true">→</span>
                  <div><small>Stopped</small><strong>${period.stopDate ? formatDate(period.stopDate) : "Still taking"}</strong></div>
                </div>
                <div class="pmdd-period-facts">
                  <span><strong>${period.medicationDays.length}</strong> recorded medication day${period.medicationDays.length === 1 ? "" : "s"}</span>
                  <span><strong>${interval ?? "–"}</strong> ${interval === null ? "No earlier start" : "days since previous start"}</span>
                </div>
                <div>
                  <h4>Signs around this start</h4>
                  <div class="pmdd-inline-tags">${symptoms.length ? symptoms.map((symptom) => `<span>${escapeHtml(symptom)}</span>`).join("") : "<small>Nothing specific was recorded in this window.</small>"}</div>
                </div>
                <div>
                  <h4>Side effects while taking it</h4>
                  <div class="pmdd-inline-tags">${sideEffects.length ? sideEffects.map((effect) => `<span>${escapeHtml(effect)}</span>`).join("") : "<small>No side effects were recorded.</small>"}</div>
                </div>
                ${notes.length ? `<p class="pmdd-period-notes"><strong>Medication notes:</strong> ${escapeHtml(notes.join(" | "))}</p>` : ""}
              </article>
            `;
          })
          .join("")
      : `<section class="plain-panel"><p class="empty-state">No PMDD medication starts are recorded yet. Select “Yes” in the Daily Log on a day medication is taken, and the first period will appear here.</p></section>`;
  }
}

function buildCopyText(periods: MedicationPeriod[]): string {
  const cluster = typicalCluster(periods);
  const intervals = periods.slice(1).map((period, index) => daysBetween(periods[index].startDate, period.startDate));
  const lines = [
    "PMDD medication tracking summary",
    `Generated: ${formatDate(new Date().toISOString().slice(0, 10))}`,
    "",
    `Medication periods recorded: ${periods.length}`,
    `Average days between starts: ${intervals.length ? average(intervals) : "Not enough data yet"}`,
    "",
    "Medication periods"
  ];

  periods.forEach((period, index) => {
    const previous = periods[index - 1];
    lines.push(
      `${index + 1}. Started ${formatDate(period.startDate)}; stopped ${period.stopDate ? formatDate(period.stopDate) : "ongoing"}; ${period.medicationDays.length} recorded medication days${previous ? `; ${daysBetween(previous.startDate, period.startDate)} days since previous start` : ""}.`,
      `   Signs around start: ${[...clusterForStart(period.startDate)].join(", ") || "none specifically recorded"}.`,
      `   Side effects recorded: ${sideEffectsForPeriod(period).join(", ") || "none"}.`
    );
  });

  lines.push("", "Most repeated signs around starts");
  lines.push(...(cluster.length ? cluster.map((item) => `- ${item.label}: ${item.courseCount} of ${periods.length} starts`) : ["- Not enough data yet"]));
  lines.push("", "This is a personal tracking summary and does not establish a diagnosis.");
  return lines.join("\n");
}

const periods = buildPeriods(entries);
render(periods);

copyButton?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildCopyText(periods));
    if (copyStatus) copyStatus.textContent = "PMDD summary copied.";
  } catch {
    if (copyStatus) copyStatus.textContent = "Copy did not complete. Please try again from the installed app or browser.";
  }
});
