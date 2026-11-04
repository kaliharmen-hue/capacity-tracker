import { getV2Entry, saveV2Entry } from "./db";
import { createEmptyV2Entry, normaliseV2Entry, type V2DailyEntry } from "./v2-schema";

const form = document.querySelector<HTMLFormElement>("#v2-entry-form");
const dateInput = document.querySelector<HTMLInputElement>("#v2-entry-date");
const status = document.querySelector<HTMLParagraphElement>("#v2-autosave-status");
let currentEntry = createEmptyV2Entry(new Date().toISOString().slice(0, 10));
let saveTimer: number | undefined;
let isLoading = false;

function setStatus(message: string): void {
  if (status) status.textContent = message;
}

function updateEffectVisibility(): void {
  form?.querySelectorAll<HTMLElement>("[data-effect-for]").forEach((field) => {
    const name = field.dataset.effectFor;
    const checkbox = name ? form.querySelector<HTMLInputElement>(`[name="${name}"]`) : null;
    field.hidden = !checkbox?.checked;
    if (field.hidden) {
      const select = field.querySelector<HTMLSelectElement>("select");
      if (select) select.value = "";
    }
  });
}

function render(): void {
  if (!form || !dateInput) return;
  isLoading = true;
  dateInput.value = currentEntry.date;
  for (const control of form.elements) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    const name = control.name as keyof V2DailyEntry;
    if (!name || name === "date") continue;
    const value = currentEntry[name];
    if (control instanceof HTMLInputElement && control.type === "checkbox") control.checked = value === true;
    else control.value = String(value ?? "");
  }
  updateEffectVisibility();
  isLoading = false;
}

async function load(date: string): Promise<void> {
  currentEntry = normaliseV2Entry((await getV2Entry(date)) ?? createEmptyV2Entry(date));
  render();
  setStatus("Autosaves as I go");
}

function collect(): V2DailyEntry {
  if (!form || !dateInput) return currentEntry;
  const entry = createEmptyV2Entry(dateInput.value || currentEntry.date);
  for (const control of form.elements) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) continue;
    const name = control.name as keyof V2DailyEntry;
    if (!name || name === "date") continue;
    if (control instanceof HTMLInputElement && control.type === "checkbox") (entry[name] as boolean) = control.checked;
    else if (name === "physicalFatigue" || name === "cognitiveDifficulty") (entry[name] as number | "") = control.value === "" ? "" : Number(control.value);
    else (entry[name] as string) = control.value;
  }
  return entry;
}

function scheduleSave(): void {
  if (isLoading) return;
  window.clearTimeout(saveTimer);
  setStatus("Saving...");
  saveTimer = window.setTimeout(async () => {
    currentEntry = collect();
    await saveV2Entry(currentEntry);
    setStatus(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }, 450);
}

dateInput?.addEventListener("change", () => {
  window.clearTimeout(saveTimer);
  void load(dateInput.value);
});
form?.addEventListener("input", () => { updateEffectVisibility(); scheduleSave(); });
form?.addEventListener("change", () => { updateEffectVisibility(); scheduleSave(); });

const initialDate = new URLSearchParams(window.location.search).get("date") || currentEntry.date;
void load(initialDate);

