import { getV2Entry, saveV2Entry } from "./db";
import { createEmptyV2Entry, normaliseV2Entry, type V2DailyEntry, type V2Meal } from "./v2-schema";

const form = document.querySelector<HTMLFormElement>("#v2-entry-form");
const dateInput = document.querySelector<HTMLInputElement>("#v2-entry-date");
const status = document.querySelector<HTMLParagraphElement>("#v2-autosave-status");
const completeButton = document.querySelector<HTMLButtonElement>("#v2-complete-button");
const pendingDraftKey = "personal-operating-system-v2-pending-draft";
const apiBase = String(import.meta.env.PUBLIC_PERSONAL_OS_API_BASE || "").replace(/\/$/, "");
const foodImage = document.querySelector<HTMLInputElement>("#v2-food-image");
const foodTime = document.querySelector<HTMLInputElement>("#v2-food-time");
const foodNote = document.querySelector<HTMLTextAreaElement>("#v2-food-note");
const foodConsent = document.querySelector<HTMLInputElement>("#v2-food-consent");
const foodAnalyse = document.querySelector<HTMLButtonElement>("#v2-food-analyse");
const foodConfirm = document.querySelector<HTMLButtonElement>("#v2-food-confirm");
const foodStatus = document.querySelector<HTMLParagraphElement>("#v2-food-status");
const foodResult = document.querySelector<HTMLDivElement>("#v2-food-result");
const mealList = document.querySelector<HTMLDivElement>("#v2-meal-list");
let analysedMeal: Omit<V2Meal, "id" | "confirmedAt"> | undefined;
let currentEntry = createEmptyV2Entry(new Date().toISOString().slice(0, 10));
let saveTimer: number | undefined;
let isLoading = false;
let pendingSave: Promise<void> | undefined;

function setStatus(message: string): void {
  if (status) status.textContent = message;
}

function setFoodStatus(message: string): void {
  if (foodStatus) foodStatus.textContent = message;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function renderMeals(): void {
  if (!mealList) return;
  mealList.innerHTML = currentEntry.meals.length
    ? `<h4>Saved meals for this day</h4>${currentEntry.meals.map((meal) => `<article class="meal-card"><strong>${escapeHtml(meal.time || "Time not recorded")}</strong><p>${escapeHtml(meal.ingredients)}</p><small>${escapeHtml(meal.portions)} · ${meal.calories === "" ? "Calories not estimated" : `${meal.calories} kcal`} · ${meal.confidence ? `Confidence: ${escapeHtml(meal.confidence)}` : "Estimate"}</small></article>`).join("")}`
    : "";
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
  renderMeals();
  isLoading = false;
}

async function imageDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.78);
}

function numericValue(selector: string): number | "" {
  const value = document.querySelector<HTMLInputElement>(selector)?.value ?? "";
  return value === "" ? "" : Number(value);
}

async function load(date: string): Promise<void> {
  const stored = await getV2Entry(date);
  const pending = readPendingDraft(date);
  currentEntry = normaliseV2Entry(pending ?? stored ?? createEmptyV2Entry(date));
  render();
  setStatus(currentEntry.entryStatus === "complete" ? "Completed daily log" : "Autosaves as I go");
}

function writePendingDraft(entry: V2DailyEntry): void {
  localStorage.setItem(pendingDraftKey, JSON.stringify(entry));
}

function readPendingDraft(date: string): V2DailyEntry | undefined {
  try {
    const raw = localStorage.getItem(pendingDraftKey);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as V2DailyEntry;
    return value.date === date ? normaliseV2Entry(value) : undefined;
  } catch {
    return undefined;
  }
}

async function persist(entry: V2DailyEntry): Promise<void> {
  const operation = saveV2Entry(entry);
  pendingSave = operation;
  await operation;
  if (readPendingDraft(entry.date)?.updatedAt === entry.updatedAt || readPendingDraft(entry.date)) localStorage.removeItem(pendingDraftKey);
  if (pendingSave === operation) pendingSave = undefined;
}

async function flushPendingSave(): Promise<void> {
  window.clearTimeout(saveTimer);
  if (!form || !dateInput) return;
  const entry = readPendingDraft(currentEntry.date) ?? (dateInput.value === currentEntry.date ? collect() : undefined);
  if (!entry) return;
  writePendingDraft(entry);
  currentEntry = entry;
  await persist(entry);
}

function collect(): V2DailyEntry {
  if (!form || !dateInput) return currentEntry;
  const entry = createEmptyV2Entry(dateInput.value || currentEntry.date);
  entry.entryStatus = currentEntry.entryStatus;
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
  const draft = collect();
  writePendingDraft(draft);
  setStatus("Saving...");
  saveTimer = window.setTimeout(async () => {
    currentEntry = collect();
    await persist(currentEntry);
    setStatus(currentEntry.entryStatus === "complete" ? "Completed daily log" : `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  }, 450);
}

dateInput?.addEventListener("change", async () => {
  await flushPendingSave();
  await load(dateInput.value);
});
form?.addEventListener("input", () => { updateEffectVisibility(); scheduleSave(); });
form?.addEventListener("change", () => { updateEffectVisibility(); scheduleSave(); });
completeButton?.addEventListener("click", async () => {
  currentEntry = collect();
  currentEntry.entryStatus = "complete";
  writePendingDraft(currentEntry);
  setStatus("Saving completion...");
  await persist(currentEntry);
  render();
  setStatus("Completed daily log");
});

foodAnalyse?.addEventListener("click", async () => {
  const file = foodImage?.files?.[0];
  if (!file) return setFoodStatus("Choose a meal photo first.");
  if (!foodConsent?.checked) return setFoodStatus("Please give consent before sending the image for analysis.");
  if (!apiBase) return setFoodStatus("Meal analysis is not configured on this deployment yet. A secure API endpoint is required; no image was sent.");
  if (file.size > 8 * 1024 * 1024) return setFoodStatus("That image is larger than 8 MB. Please choose a smaller photo.");
  try {
    foodAnalyse.disabled = true;
    setFoodStatus("Analysing the meal...");
    const response = await fetch(`${apiBase}/food/analyse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl: await imageDataUrl(file), mealDate: currentEntry.date, mealTime: foodTime?.value ?? "", note: foodNote?.value ?? "", consent: true })
    });
    if (!response.ok) throw new Error("The meal analysis service did not respond successfully.");
    const payload = await response.json() as { meal?: Omit<V2Meal, "id" | "confirmedAt"> };
    if (!payload.meal) throw new Error("No meal estimate was returned.");
    analysedMeal = payload.meal;
    const setValue = (selector: string, value: string | number | "") => { const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector); if (input) input.value = String(value ?? ""); };
    setValue("#v2-food-ingredients", payload.meal.ingredients);
    setValue("#v2-food-portions", payload.meal.portions);
    setValue("#v2-food-calories", payload.meal.calories);
    setValue("#v2-food-protein", payload.meal.proteinGrams);
    setValue("#v2-food-carbs", payload.meal.carbohydrateGrams);
    setValue("#v2-food-fat", payload.meal.fatGrams);
    const confidence = document.querySelector<HTMLElement>("#v2-food-confidence");
    if (confidence) confidence.textContent = payload.meal.confidence ? `AI confidence: ${payload.meal.confidence}. Please correct anything that looks wrong.` : "Please review this estimate carefully.";
    if (foodResult) foodResult.hidden = false;
    setFoodStatus("Estimate ready for review.");
  } catch (error) {
    setFoodStatus(error instanceof Error ? error.message : "Meal analysis failed. No meal was saved.");
  } finally {
    foodAnalyse.disabled = false;
  }
});

foodConfirm?.addEventListener("click", async () => {
  if (!analysedMeal) return setFoodStatus("Analyse a meal before confirming it.");
  const meal: V2Meal = {
    ...analysedMeal,
    id: crypto.randomUUID(),
    time: foodTime?.value ?? analysedMeal.time,
    note: foodNote?.value ?? analysedMeal.note,
    ingredients: document.querySelector<HTMLTextAreaElement>("#v2-food-ingredients")?.value ?? analysedMeal.ingredients,
    portions: document.querySelector<HTMLTextAreaElement>("#v2-food-portions")?.value ?? analysedMeal.portions,
    calories: numericValue("#v2-food-calories"),
    proteinGrams: numericValue("#v2-food-protein"),
    carbohydrateGrams: numericValue("#v2-food-carbs"),
    fatGrams: numericValue("#v2-food-fat"),
    confirmedAt: new Date().toISOString()
  };
  currentEntry.meals.push(meal);
  writePendingDraft(currentEntry);
  await persist(currentEntry);
  analysedMeal = undefined;
  if (foodResult) foodResult.hidden = true;
  if (foodImage) foodImage.value = "";
  renderMeals();
  setFoodStatus("Meal confirmed and saved for this date.");
});

window.addEventListener("pagehide", () => {
  if (isLoading || !form || !dateInput) return;
  const entry = collect();
  writePendingDraft(entry);
  void persist(entry);
});

const initialDate = new URLSearchParams(window.location.search).get("date") || currentEntry.date;
void load(initialDate);

