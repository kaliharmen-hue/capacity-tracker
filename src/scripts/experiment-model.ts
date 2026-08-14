export interface Experiment {
  preset: string;
  name: string;
  startDate: string;
  durationWeeks: number;
  plan: string;
  successMarker: string;
  notes: string;
  updatedAt: string;
}

export const experimentStorageKey = "personal-operating-system-active-experiment";

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function experimentName(experiment: Experiment): string {
  return experiment.preset === "Custom"
    ? experiment.name.trim() || "Custom experiment"
    : experiment.preset || experiment.name || "Untitled experiment";
}

export function experimentEndDate(experiment: Experiment): string {
  const durationDays = Math.max(1, Number(experiment.durationWeeks || 3) * 7);
  return addDays(experiment.startDate, durationDays - 1);
}

export function experimentIsActiveOn(experiment: Experiment, date: string): boolean {
  return date >= experiment.startDate && date <= experimentEndDate(experiment);
}

export function loadExperiment(): Experiment | undefined {
  const raw = localStorage.getItem(experimentStorageKey);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Experiment;
  } catch {
    return undefined;
  }
}

export function saveExperiment(experiment: Experiment): void {
  localStorage.setItem(experimentStorageKey, JSON.stringify(experiment));
}

export function clearExperiment(): void {
  localStorage.removeItem(experimentStorageKey);
}
