import { getV2Entry, saveV2Entry } from "./db";
import { createEmptyV2Entry, normaliseV2Entry, type V2DailyEntry } from "./v2-schema";
import { DraftJournal } from "./v2-journal";
import { initMealPhotos } from "./meal-photos";
import { refreshOptionalFields } from "./capacity-ui";

const form = document.querySelector<HTMLFormElement>("#v2-entry-form")!;
const status = document.querySelector<HTMLElement>("#v2-autosave-status")!;
const complete = document.querySelector<HTMLButtonElement>("#v2-complete-button")!;
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let entry = createEmptyV2Entry(localToday());
let loading = true;
let timer: number | undefined;
const journal = new DraftJournal(localStorage, saveV2Entry, "pos-v2-draft:", entry => entry.date);
try {
  const legacyKey = "personal-operating-system-v2-pending-draft";
  const legacy = localStorage.getItem(legacyKey);
  if (legacy) {
    const draft = normaliseV2Entry(JSON.parse(legacy));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) throw new Error("Invalid legacy draft date");
    if (!journal.read(draft.date)) journal.stage(draft);
    localStorage.removeItem(legacyKey);
  }
} catch { /* Preserve unreadable older drafts for manual recovery. */ }
const setStatus = (text: string) => { status.textContent = text; };
const photos = initMealPhotos();
export const hasPendingV2 = () => journal.hasPending();

function effects() {
  form.querySelectorAll<HTMLElement>("[data-effect-for]").forEach(field => {
    const checked = form.querySelector<HTMLInputElement>('[name="' + field.dataset.effectFor + '"]')?.checked;
    field.hidden = !checked;
    if (!checked) field.querySelector<HTMLSelectElement>("select")!.value = "";
  });
}
function collect(): V2DailyEntry {
  const result = structuredClone(entry);
  for (const field of form.elements) {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
    const key = field.name as keyof V2DailyEntry;
    if (!key || key === "date") continue;
    if (field instanceof HTMLInputElement && field.type === "checkbox") (result[key] as boolean) = field.checked;
    else if (key === "physicalFatigue" || key === "cognitiveDifficulty") {
      result[key] = field.value === "" ? "" : Number(field.value);
    } else (result[key] as string) = field.value;
  }
  result.updatedAt = new Date().toISOString();
  return result;
}
export async function flushV2() {
  window.clearTimeout(timer);
  if (!journal.hasPending()) return;
  try {
    await journal.flush();
    setStatus(entry.entryStatus === "complete" ? "Check-in complete" : "Saved");
  } catch {
    setStatus("Save needs retrying. This browser keeps a recovery draft.");
    throw new Error("Unable to finish saving yet.");
  }
}
export async function loadV2(date: string) {
  loading = true;
  form.inert = true;
  try {
    const stored = await getV2Entry(date);
    entry = normaliseV2Entry(journal.read(date) ?? stored ?? createEmptyV2Entry(date));
    for (const field of form.elements) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
      const key = field.name as keyof V2DailyEntry;
      if (!key || key === "date") continue;
      if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = entry[key] === true;
      else field.value = String(entry[key] ?? "");
    }
    effects();
    setStatus(entry.entryStatus === "complete" ? "Check-in complete" : stored ? "Saved" : "Autosaves as I go");
    complete.textContent = entry.entryStatus === "complete" ? "Reopen check-in" : "Complete check-in";
    photos.showDate(date);
    refreshOptionalFields();
  } finally {
    loading = false;
    form.inert = false;
  }
}
function changed() {
  if (loading) return;
  effects();
  entry = collect();
  // Editing a completed record reopens it, so protocols cannot silently acquire a missed status.
  entry.entryStatus = "draft";
  complete.textContent = "Complete check-in";
  try { journal.stage(entry); } catch { setStatus("Browser recovery storage is full. Keep this page open while saving."); }
  window.clearTimeout(timer);
  setStatus("Saving...");
  timer = window.setTimeout(() => { void flushV2().catch(() => {}); }, 450);
}
form.addEventListener("input", changed);
form.addEventListener("change", changed);
form.addEventListener("submit", event => event.preventDefault());
complete.addEventListener("click", async () => {
  if (!form.reportValidity()) return;
  entry = collect();
  if (entry.entryStatus !== "complete" && (entry.physicalFatigue === "" || entry.cognitiveDifficulty === "" || !entry.functionalImpact)) {
    setStatus("Answer the three daily measures before completing the check-in.");
    return;
  }
  entry.entryStatus = entry.entryStatus === "complete" ? "draft" : "complete";
  try { journal.stage(entry); } catch { /* The in-memory snapshot can still be saved. */ }
  complete.textContent = entry.entryStatus === "complete" ? "Reopen check-in" : "Complete check-in";
  try { await flushV2(); } catch { /* The journal retains the draft. */ }
});

