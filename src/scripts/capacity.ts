import {
  getCapacityPractice,
  getCapacityPractices,
  getCapacityReview,
  saveCapacityPractice,
  saveCapacityReview,
  type CapacityPracticeEntry,
  type CapacityWeeklyReview
} from "./db";
import { todayIso } from "./schema";

const dateInput = document.querySelector<HTMLInputElement>("#capacity-date");
const stateInput = document.querySelector<HTMLSelectElement>("#capacity-state");
const needInput = document.querySelector<HTMLTextAreaElement>("#capacity-need");
const checkedInInput = document.querySelector<HTMLInputElement>("#checked-in");
const downshiftedInput = document.querySelector<HTMLInputElement>("#downshifted");
const workClosedInput = document.querySelector<HTMLInputElement>("#work-closed");
const somethingForMeInput = document.querySelector<HTMLInputElement>("#something-for-me");
const ateEnoughInput = document.querySelector<HTMLInputElement>("#ate-enough");
const proteinSupportInput = document.querySelector<HTMLInputElement>("#protein-support");
const carbSupportInput = document.querySelector<HTMLInputElement>("#carb-support");
const hydrationInput = document.querySelector<HTMLInputElement>("#hydration");
const supportedScoreInput = document.querySelector<HTMLSelectElement>("#supported-score");
const carriedAloneScoreInput = document.querySelector<HTMLSelectElement>("#carried-alone-score");
const notesInput = document.querySelector<HTMLTextAreaElement>("#capacity-notes");
const saveStatus = document.querySelector<HTMLSpanElement>("#capacity-save-status");
const todayProgress = document.querySelector<HTMLElement>("#today-progress");
const foundationPercentage = document.querySelector<HTMLElement>("#foundation-percentage");
const foundationProgressBar = document.querySelector<HTMLElement>("#foundation-progress-bar");
const foundationProgressCopy = document.querySelector<HTMLElement>("#foundation-progress-copy");

const weekStartInput = document.querySelector<HTMLInputElement>("#capacity-week-start");
const weeklyForm = document.querySelector<HTMLFormElement>("#capacity-weekly-form");
const capacityGiversInput = document.querySelector<HTMLTextAreaElement>("#capacity-givers");
const capacityDrainsInput = document.querySelector<HTMLTextAreaElement>("#capacity-drains");
const receivedSupportInput = document.querySelector<HTMLTextAreaElement>("#received-support");
const carriedAloneInput = document.querySelector<HTMLTextAreaElement>("#carried-alone");
const oneAdjustmentInput = document.querySelector<HTMLTextAreaElement>("#one-adjustment");
const weeklySaveStatus = document.querySelector<HTMLParagraphElement>("#weekly-save-status");

let dailySaveTimer: number | undefined;
let weeklySaveTimer: number | undefined;
let loadingDaily = false;
let loadingWeekly = false;

function emptyPractice(date: string): CapacityPracticeEntry {
  return {
    date,
    state: "",
    needToday: "",
    checkedIn: false,
    downshifted: false,
    workClosed: false,
    somethingForMe: false,
    ateEnough: false,
    proteinSupport: false,
    carbSupport: false,
    hydration: false,
    supportedScore: "",
    carriedAloneScore: "",
    notes: "",
    updatedAt: ""
  };
}

function emptyReview(weekStart: string): CapacityWeeklyReview {
  return {
    weekStart,
    capacityGivers: "",
    capacityDrains: "",
    receivedSupport: "",
    carriedAlone: "",
    oneAdjustment: "",
    updatedAt: ""
  };
}

function mondayFor(date: string): string {
  const value = new Date(date + "T12:00:00");
  const day = value.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + offset);
  return value.toISOString().slice(0, 10);
}

function numericValue(input: HTMLSelectElement | null): number | "" {
  if (!input || input.value === "") return "";
  return Number(input.value);
}

function collectPractice(): CapacityPracticeEntry {
  const date = dateInput?.value || todayIso();
  return {
    date,
    state: (stateInput?.value || "") as CapacityPracticeEntry["state"],
    needToday: needInput?.value || "",
    checkedIn: Boolean(checkedInInput?.checked),
    downshifted: Boolean(downshiftedInput?.checked),
    workClosed: Boolean(workClosedInput?.checked),
    somethingForMe: Boolean(somethingForMeInput?.checked),
    ateEnough: Boolean(ateEnoughInput?.checked),
    proteinSupport: Boolean(proteinSupportInput?.checked),
    carbSupport: Boolean(carbSupportInput?.checked),
    hydration: Boolean(hydrationInput?.checked),
    supportedScore: numericValue(supportedScoreInput),
    carriedAloneScore: numericValue(carriedAloneScoreInput),
    notes: notesInput?.value || "",
    updatedAt: ""
  };
}

function setPractice(entry: CapacityPracticeEntry): void {
  if (dateInput) dateInput.value = entry.date;
  if (stateInput) stateInput.value = entry.state;
  if (needInput) needInput.value = entry.needToday;
  if (checkedInInput) checkedInInput.checked = entry.checkedIn;
  if (downshiftedInput) downshiftedInput.checked = entry.downshifted;
  if (workClosedInput) workClosedInput.checked = entry.workClosed;
  if (somethingForMeInput) somethingForMeInput.checked = entry.somethingForMe;
  if (ateEnoughInput) ateEnoughInput.checked = entry.ateEnough;
  if (proteinSupportInput) proteinSupportInput.checked = entry.proteinSupport;
  if (carbSupportInput) carbSupportInput.checked = entry.carbSupport;
  if (hydrationInput) hydrationInput.checked = entry.hydration;
  if (supportedScoreInput) supportedScoreInput.value = String(entry.supportedScore);
  if (carriedAloneScoreInput) carriedAloneScoreInput.value = String(entry.carriedAloneScore);
  if (notesInput) notesInput.value = entry.notes;
  updateTodayProgress(entry);
}

function actionsCompleted(entry: CapacityPracticeEntry): number {
  return [
    entry.checkedIn,
    entry.downshifted,
    entry.workClosed,
    entry.somethingForMe,
    entry.ateEnough,
    entry.proteinSupport,
    entry.carbSupport,
    entry.hydration
  ].filter(Boolean).length;
}

function updateTodayProgress(entry: CapacityPracticeEntry): void {
  if (todayProgress) todayProgress.textContent = String(actionsCompleted(entry)) + " / 8 foundation actions";
}

async function updateRollingProgress(): Promise<void> {
  const entries = await getCapacityPractices();
  const end = new Date((dateInput?.value || todayIso()) + "T12:00:00");
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  const windowEntries = entries.filter((entry) => entry.date >= startIso && entry.date <= endIso);

  if (!windowEntries.length) {
    if (foundationPercentage) foundationPercentage.textContent = "No data yet";
    if (foundationProgressBar) foundationProgressBar.style.width = "0%";
    if (foundationProgressCopy) foundationProgressCopy.textContent = "Log a few days first. The useful signal is whether these behaviours are becoming easier and whether they actually improve capacity.";
    return;
  }

  const possible = windowEntries.length * 8;
  const completed = windowEntries.reduce((sum, entry) => sum + actionsCompleted(entry), 0);
  const percent = Math.round((completed / possible) * 100);

  if (foundationPercentage) foundationPercentage.textContent = String(percent) + "% across " + String(windowEntries.length) + " logged day" + (windowEntries.length === 1 ? "" : "s");
  if (foundationProgressBar) foundationProgressBar.style.width = String(percent) + "%";
  if (foundationProgressCopy) {
    foundationProgressCopy.textContent =
      windowEntries.length >= 7 && percent >= 70
        ? "The base is becoming consistent. If it also feels useful rather than forced, this is a good point to review what is helping before adding one Stage 2 skill."
        : "Keep building the base. The aim is not a perfect streak; it is making supportive conditions easier to repeat.";
  }
}

async function loadPractice(date: string): Promise<void> {
  loadingDaily = true;
  const entry = { ...emptyPractice(date), ...((await getCapacityPractice(date)) ?? {}) };
  setPractice(entry);
  loadingDaily = false;
  if (saveStatus) saveStatus.textContent = "Autosaves as I go";
  await updateRollingProgress();
}

function scheduleDailySave(): void {
  if (loadingDaily) return;
  window.clearTimeout(dailySaveTimer);
  if (saveStatus) saveStatus.textContent = "Saving...";
  const snapshot = collectPractice();
  updateTodayProgress(snapshot);
  dailySaveTimer = window.setTimeout(async () => {
    const entry = collectPractice();
    await saveCapacityPractice(entry);
    if (saveStatus) saveStatus.textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    await updateRollingProgress();
  }, 450);
}

function collectReview(): CapacityWeeklyReview {
  return {
    weekStart: weekStartInput?.value || mondayFor(todayIso()),
    capacityGivers: capacityGiversInput?.value || "",
    capacityDrains: capacityDrainsInput?.value || "",
    receivedSupport: receivedSupportInput?.value || "",
    carriedAlone: carriedAloneInput?.value || "",
    oneAdjustment: oneAdjustmentInput?.value || "",
    updatedAt: ""
  };
}

function setReview(review: CapacityWeeklyReview): void {
  if (weekStartInput) weekStartInput.value = review.weekStart;
  if (capacityGiversInput) capacityGiversInput.value = review.capacityGivers;
  if (capacityDrainsInput) capacityDrainsInput.value = review.capacityDrains;
  if (receivedSupportInput) receivedSupportInput.value = review.receivedSupport;
  if (carriedAloneInput) carriedAloneInput.value = review.carriedAlone;
  if (oneAdjustmentInput) oneAdjustmentInput.value = review.oneAdjustment;
}

async function loadReview(weekStart: string): Promise<void> {
  loadingWeekly = true;
  const review = { ...emptyReview(weekStart), ...((await getCapacityReview(weekStart)) ?? {}) };
  setReview(review);
  loadingWeekly = false;
  if (weeklySaveStatus) weeklySaveStatus.textContent = "Autosaves as I go";
}

function scheduleWeeklySave(): void {
  if (loadingWeekly) return;
  window.clearTimeout(weeklySaveTimer);
  if (weeklySaveStatus) weeklySaveStatus.textContent = "Saving...";
  weeklySaveTimer = window.setTimeout(async () => {
    await saveCapacityReview(collectReview());
    if (weeklySaveStatus) weeklySaveStatus.textContent = "Saved " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }, 450);
}

const dailyControls = [
  stateInput,
  needInput,
  checkedInInput,
  downshiftedInput,
  workClosedInput,
  somethingForMeInput,
  ateEnoughInput,
  proteinSupportInput,
  carbSupportInput,
  hydrationInput,
  supportedScoreInput,
  carriedAloneScoreInput,
  notesInput
].filter(Boolean) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

dailyControls.forEach((control) => {
  control.addEventListener("input", scheduleDailySave);
  control.addEventListener("change", scheduleDailySave);
});

dateInput?.addEventListener("change", () => {
  window.clearTimeout(dailySaveTimer);
  const date = dateInput.value || todayIso();
  void loadPractice(date);
  const weekStart = mondayFor(date);
  if (weekStartInput) weekStartInput.value = weekStart;
  void loadReview(weekStart);
});

weeklyForm?.addEventListener("input", scheduleWeeklySave);
weeklyForm?.addEventListener("change", scheduleWeeklySave);

weekStartInput?.addEventListener("change", () => {
  window.clearTimeout(weeklySaveTimer);
  void loadReview(weekStartInput.value || mondayFor(todayIso()));
});

const initialDate = new URLSearchParams(window.location.search).get("date") || todayIso();
if (dateInput) dateInput.value = initialDate;
if (weekStartInput) weekStartInput.value = mondayFor(initialDate);
void loadPractice(initialDate);
void loadReview(mondayFor(initialDate));
