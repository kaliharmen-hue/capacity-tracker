import { getAllEntries } from "./db";
import type { DailyEntry } from "./schema";

interface Experiment {
  preset: string;
  name: string;
  startDate: string;
  durationWeeks: number;
  plan: string;
  successMarker: string;
  notes: string;
  updatedAt: string;
}

const storageKey = "personal-operating-system-active-experiment";
const form = document.querySelector<HTMLFormElement>("#experiment-form");
const statusRoot = document.querySelector<HTMLDivElement>("#experiment-status");
const readoutRoot = document.querySelector<HTMLDivElement>("#experiment-readout");
const clearButton = document.querySelector<HTMLButtonElement>("#clear-experiment");

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function average(values: number[]): string {
  const filtered = values.filter((value) => Number.isFinite(value));
  if (!filtered.length) return "Not enough yet";
  return (filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(1);
}

function answeredCapacity(entry: DailyEntry): number | undefined {
  return typeof entry.capacityRemainingScore === "number" ? entry.capacityRemainingScore : undefined;
}

function getExperimentName(experiment: Experiment): string {
  return experiment.preset === "Custom" ? experiment.name.trim() || "Custom experiment" : experiment.preset || experiment.name || "Untitled experiment";
}

function loadExperiment(): Experiment | undefined {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Experiment;
  } catch {
    return undefined;
  }
}

function saveExperiment(experiment: Experiment): void {
  localStorage.setItem(storageKey, JSON.stringify(experiment));
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
    return;
  }

  const durationDays = Math.max(1, Number(experiment.durationWeeks || 3) * 7);
  const endDate = addDays(experiment.startDate, durationDays - 1);
  const beforeStart = addDays(experiment.startDate, -durationDays);
  const beforeEnd = addDays(experiment.startDate, -1);
  const entries = await getAllEntries();
  const during = rangeEntries(entries, experiment.startDate, endDate);
  const before = rangeEntries(entries, beforeStart, beforeEnd);
  const today = todayIso();
  const daysRemaining = Math.max(0, Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000));
  const complete = today > endDate;

  if (statusRoot) {
    statusRoot.innerHTML = `
      <div class="notice-card ${complete ? "calm" : "warm"}">
        <strong>${getExperimentName(experiment)}</strong>
        <p>${experiment.startDate} to ${endDate}. ${complete ? "The test window is complete." : `${daysRemaining + 1} day${daysRemaining === 0 ? "" : "s"} left including today.`}</p>
      </div>
    `;
  }

  if (readoutRoot) {
    readoutRoot.innerHTML = `
      <div class="summary-grid">
        ${stat("Logged days during", during.length)}
        ${stat("Avg energy before", average(before.map((entry) => entry.energyScore)))}
        ${stat("Avg energy during", average(during.map((entry) => entry.energyScore)))}
        ${stat("Avg clarity before", average(before.map((entry) => entry.clarityScore)))}
        ${stat("Avg clarity during", average(during.map((entry) => entry.clarityScore)))}
        ${stat("Avg capacity before", average(before.map(answeredCapacity).filter((value): value is number => value !== undefined)))}
        ${stat("Avg capacity during", average(during.map(answeredCapacity).filter((value): value is number => value !== undefined)))}
      </div>
      <div class="notice-card calm">
        <strong>What would count as helping?</strong>
        <p>${experiment.successMarker || "Add a success marker so the review has something human to compare against."}</p>
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
  localStorage.removeItem(storageKey);
  void render();
});

void render();
