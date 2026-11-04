import { getV2Entry, saveV2Entry, isPersonalOsCloudSyncEnabled, syncPersonalOsCloudMirror } from "./db";
import { createEmptyV2Entry, normaliseV2Entry, type V2DailyEntry } from "./v2-schema";
import { DraftJournal } from "./v2-journal";
import { initMealPhotos } from "./meal-photos";

const form = document.querySelector<HTMLFormElement>("#v2-entry-form")!;
const dateInput = document.querySelector<HTMLInputElement>("#v2-entry-date")!;
const status = document.querySelector<HTMLElement>("#v2-autosave-status")!;
const complete = document.querySelector<HTMLButtonElement>("#v2-complete-button")!;
const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let entry = createEmptyV2Entry(localToday());
let loading = true;
let timer: number | undefined;
let loadVersion = 0;
const journal = new DraftJournal(localStorage, saveV2Entry);
const setStatus = (text: string) => { status.textContent = text; };
const photos = initMealPhotos(() => entry.date);

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
async function flush() {
  window.clearTimeout(timer);
  try {
    await journal.flush();
    setStatus(entry.entryStatus === "complete" ? "Daily log complete" : "Draft saved");
  } catch {
    setStatus("Save needs retrying. This browser keeps a recovery draft.");
    throw new Error("Unable to finish saving yet.");
  }
}
async function load(date: string) {
  const version = ++loadVersion;
  loading = true;
  form.inert = true;
  try {
    const stored = await getV2Entry(date);
    if (version !== loadVersion) return;
    entry = normaliseV2Entry(journal.read(date) ?? stored ?? createEmptyV2Entry(date));
    dateInput.value = date;
    const url = new URL(location.href); url.searchParams.set('date', date); history.replaceState(null, '', url);
    for (const field of form.elements) {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) continue;
      const key = field.name as keyof V2DailyEntry;
      if (!key || key === "date") continue;
      if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = entry[key] === true;
      else field.value = String(entry[key] ?? "");
    }
    effects();
    setStatus(entry.entryStatus === "complete" ? "Daily log complete" : stored ? "Draft saved" : "No daily log saved yet");
    complete.textContent = entry.entryStatus === "complete" ? "Reopen daily log" : "Mark daily log complete";
    await photos.refresh();
  } catch { setStatus("Could not load this date. Please retry."); }
  finally { if (version === loadVersion) { loading = false; form.inert = false; } }
}
function changed(event: Event) {
  if (loading || event.target === dateInput) return;
  effects();
  entry = collect();
  // Editing a completed record reopens it, so protocols cannot silently acquire a missed status.
  entry.entryStatus = "draft";
  try { journal.stage(entry); } catch { setStatus("Browser recovery storage is full. Keep this page open while saving."); }
  window.clearTimeout(timer);
  setStatus("Saving draft...");
  timer = window.setTimeout(() => { void flush().catch(() => {}); }, 450);
}
form.addEventListener("input", changed);
form.addEventListener("change", changed);
dateInput.addEventListener("change", async () => {
  const date = dateInput.value;
  if (!date) { dateInput.value = entry.date; return; }
  form.inert = true;
  try { await flush(); await load(date); }
  catch { dateInput.value = entry.date; form.inert = false; }
});
form.addEventListener("submit", event => event.preventDefault());
complete.addEventListener("click", async () => {
  if (!form.reportValidity()) return;
  entry = collect();
  if (entry.entryStatus !== "complete" && (entry.physicalFatigue === "" || entry.cognitiveDifficulty === "" || !entry.functionalImpact)) {
    setStatus("Answer the three daily measures before completing the log.");
    return;
  }
  entry.entryStatus = entry.entryStatus === "complete" ? "draft" : "complete";
  journal.stage(entry);
  try { await flush(); await load(entry.date); } catch { /* The journal retains the draft. */ }
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void flush().catch(() => {});
});
window.addEventListener("pagehide", () => { void journal.flush().catch(() => {}); });
document.addEventListener("click", event => {
  const link = (event.target as Element)?.closest<HTMLAnchorElement>("a[href]");
  if (!link || event.defaultPrevented || link.target === "_blank" || (event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey) return;
  if (!journal.hasPending()) return;
  event.preventDefault();
  void flush().then(() => window.location.assign(link.href)).catch(() => {});
});
window.addEventListener("beforeunload", event => {
  if (journal.hasPending()) { event.preventDefault(); event.returnValue = ""; }
});
document.querySelector("#v2-sync")?.addEventListener("click", async () => {
  if (!isPersonalOsCloudSyncEnabled()) { setStatus("Enable ChatGPT access in Capacity Building to sync daily logs."); return; }
  try { await flush(); const result = await syncPersonalOsCloudMirror(); setStatus(result.ok ? "Daily logs synced for ChatGPT" : result.error || "Sync needs retrying"); } catch {}
});
const initialDate = new URLSearchParams(location.search).get("date");
void load(initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : entry.date);

