import { getAllEntries } from "./db";
import {
  addDays,
  clearExperiment,
  experimentEndDate,
  experimentName,
  loadExperiment,
  saveExperiment,
  type Experiment
} from "./experiment-model";
import type { DailyEntry } from "./schema";
const form = document.querySelector<HTMLFormElement>("#experiment-form");
const statusRoot = document.querySelector<HTMLDivElement>("#experiment-status");
const readoutRoot = document.querySelector<HTMLDivElement>("#experiment-readout");
const clearButton = document.querySelector<HTMLButtonElement>("#clear-experiment");
const copyButton = document.querySelector<HTMLButtonElement>("#copy-experiment");
const copyStatus = document.querySelector<HTMLParagraphElement>("#experiment-copy-status");
let latestExperimentText = "";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function average(values: number[]): string {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return "Not enough yet";
  return (filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(1);
}

function averageNumber(values: number[]): number | undefined {
  const filtered = values.filter((value) => Number.isFinite(value));
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : undefined;
}

function comparisonLine(label: string, before: number[], during: number[]): string {
  const beforeAverage = averageNumber(before);
  const duringAverage = averageNumber(during);
  if (beforeAverage === undefined || duringAverage === undefined) return `${label}: not enough data yet`;
  const difference = duringAverage - beforeAverage;
  const direction = Math.abs(difference) < 0.05 ? "no measurable difference" : `${Math.abs(difference).toFixed(1)} ${difference > 0 ? "higher" : "lower"}`;
  return `${label}: ${direction} (${beforeAverage.toFixed(1)} before, ${duringAverage.toFixed(1)} during)`;
}

function answeredCapacity(entry: DailyEntry): number | undefined {
  return typeof entry.capacityRemainingScore === "number" ? entry.capacityRemainingScore : undefined;
}

function fillForm(experiment?: Experiment): void {
  if (!form) return;
  const data = experiment ?? {
    preset: "",
    name: "",
    startDate: todayIso(),
    durationWeeks: 3,
    plan: "",
    successMarker: "",
    notes: "",
    updatedAt: ""
  };

  (form.elements.namedItem("preset") as HTMLSelectElement).value = data.preset;
  (form.elements.namedItem("name") as HTMLInputElement).value = data.name;
  (form.elements.namedItem("startDate") as HTMLInputElement).value = data.startDate;
  (form.elements.namedItem("durationWeeks") as HTMLInputElement).value = String(data.durationWeeks || 3);
  (form.elements.namedItem("plan") as HTMLTextAreaElement).value = data.plan;
  (form.elements.namedItem("successMarker") as HTMLTextAreaElement).value = data.successMarker;
  (form.elements.namedItem("notes") as HTMLTextAreaElement).value = data.notes;
}

function stat(label: string, value: string | number): string {
  return `<article class="stat-card"><span>${label}</span><strong>${value}</strong></article>`;
}

function rangeEntries(entries: DailyEntry[], start: string, end: string): DailyEntry[] {
  return entries.filter((entry) => entry.date >= start && entry.date <= end);
}

function experimentMarkdown(experiment: Experiment, before: DailyEntry[], during: DailyEntry[], endDate: string): string {
  return [
    `# Personal Operating System Experiment - ${experimentName(experiment)}`,
    "",
    `- Start date: ${experiment.startDate}`,
    `- End date: ${endDate}`,
    `- Duration: ${experiment.durationWeeks} week${experiment.durationWeeks === 1 ? "" : "s"}`,
    "",
    "## What I am trying",
    experiment.plan || "Not noted",
    "",
    "## What would count as helping",
    experiment.successMarker || "Not noted",
    "",
    "## Notes while running",
    experiment.notes || "Not noted",
    "",
    "## Before vs during",
    `- Logged days before: ${before.length}`,
    `- Logged days during: ${during.length}`,
    `- Average energy before: ${average(before.map((entry) => entry.energyScore))}`,
    `- Average energy during: ${average(during.map((entry) => entry.energyScore))}`,
    `- Average clarity before: ${average(before.map((entry) => entry.clarityScore))}`,
    `- Average clarity during: ${average(during.map((entry) => entry.clarityScore))}`,
    `- Average capacity before: ${average(before.map(answeredCapacity).filter((value): value is number => value !== undefined))}`,
    `- Average capacity during: ${average(during.map(answeredCapacity).filter((value): value is number => value !== undefined))}`
  ].join("\n");
}

async function render(): Promise<void> {
  const experiment = loadExperiment();
  fillForm(experiment);

  if (!experiment) {
    if (statusRoot) {
      statusRoot.innerHTML = `
        <div class="notice-card warm">
          <strong>No active experiment</strong>
          <p>Choose one thing to test, give it a clear window, and keep using the Daily Log as usual.</p>
        </div>
      `;
    }
    if (readoutRoot) {
      readoutRoot.innerHTML = `<p class="empty-state">Save an experiment and this will compare the experiment window with the same length of time before it.</p>`;
    }
    latestExperimentText = "";
    return;
  }

  const durationDays = Math.max(1, Number(experiment.durationWeeks || 3) * 7);
  const endDate = experimentEndDate(experiment);
  const beforeStart = addDays(experiment.startDate, -durationDays);
  const beforeEnd = addDays(experiment.startDate, -1);
  const entries = await getAllEntries();
  const during = rangeEntries(entries, experiment.startDate, endDate);
  const name = experimentName(experiment);
  const followed = during.filter((entry) => entry.experimentName === name && ["Yes", "Partly"].includes(entry.experimentAdherence));
  const comparisonDays = followed.length ? followed : during;
  const before = rangeEntries(entries, beforeStart, beforeEnd);
  const today = todayIso();
  const daysRemaining = Math.max(0, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000));
  const complete = today > endDate;
  latestExperimentText = experimentMarkdown(experiment, before, comparisonDays, endDate);

  if (statusRoot) {
    statusRoot.innerHTML = `
      <div class="notice-card ${complete ? "calm" : "warm"}">
        <strong>${escapeHtml(name)}</strong>
        <p>${experiment.startDate} to ${endDate}. ${complete ? "The test window is complete." : `${daysRemaining + 1} day${daysRemaining === 0 ? "" : "s"} left including today.`}</p>
      </div>
    `;
  }

  if (readoutRoot) {
    readoutRoot.innerHTML = `
      <div class="summary-grid">
        ${stat("Logged days during", during.length)}
        ${stat("Days followed", followed.length)}
        ${stat("Avg energy before", average(before.map((entry) => entry.energyScore)))}
        ${stat("Avg energy during", average(comparisonDays.map((entry) => entry.energyScore)))}
        ${stat("Avg clarity before", average(before.map((entry) => entry.clarityScore)))}
        ${stat("Avg clarity during", average(comparisonDays.map((entry) => entry.clarityScore)))}
        ${stat("Avg capacity before", average(before.map(answeredCapacity).filter((value): value is number => value !== undefined)))}
        ${stat("Avg capacity during", average(comparisonDays.map(answeredCapacity).filter((value): value is number => value !== undefined)))}
      </div>
      <p class="frequency-note">Once followed days are recorded in the Daily Log, the during averages use those days. Until then they use all logged days in the experiment window. Differences are observed associations and do not establish that the experiment caused them.</p>
      <div class="notice-card calm">
        <strong>Observed comparison</strong>
        <p>${comparisonLine("Energy", before.map((entry) => entry.energyScore), comparisonDays.map((entry) => entry.energyScore))}<br>${comparisonLine("Executive clarity", before.map((entry) => entry.clarityScore), comparisonDays.map((entry) => entry.clarityScore))}<br>${comparisonLine("Capacity remaining", before.map(answeredCapacity).filter((value): value is number => value !== undefined), comparisonDays.map(answeredCapacity).filter((value): value is number => value !== undefined))}</p>
      </div>
      <div class="notice-card calm">
        <strong>What would count as helping?</strong>
        <p>${escapeHtml(experiment.successMarker || "Add a success marker so the review has something human to compare against.")}</p>
      </div>
    `;
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  saveExperiment({
    preset: String(data.get("preset") || ""),
    name: String(data.get("name") || ""),
    startDate: String(data.get("startDate") || todayIso()),
    durationWeeks: Number(data.get("durationWeeks") || 3),
    plan: String(data.get("plan") || ""),
    successMarker: String(data.get("successMarker") || ""),
    notes: String(data.get("notes") || ""),
    updatedAt: new Date().toISOString()
  });
  void render();
});

clearButton?.addEventListener("click", () => {
  clearExperiment();
  void render();
});

copyButton?.addEventListener("click", async () => {
  if (!latestExperimentText.trim()) {
    if (copyStatus) copyStatus.textContent = "Save an experiment first, then I can copy it.";
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: "Personal Operating System experiment", text: latestExperimentText });
      if (copyStatus) copyStatus.textContent = "Shared. I can paste it into ChatGPT from there.";
      return;
    } catch {
      // Fall through to clipboard.
    }
  }
  try {
    await navigator.clipboard.writeText(latestExperimentText);
    if (copyStatus) copyStatus.textContent = "Copied. I can paste this into ChatGPT now.";
  } catch {
    if (copyStatus) copyStatus.textContent = "Copy did not complete automatically. I can select the text from Export if needed.";
  }
});

void render();
