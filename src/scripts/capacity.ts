import {
  clearWhoopDays,
  getAllEntries,
  getCapacityPractice,
  getCapacityPractices,
  getCapacityReview,
  getWhoopDay,
  getWhoopDays,
  getPersonalOsLocalCounts,
  isPersonalOsCloudSyncEnabled,
  saveCapacityPractice,
  saveCapacityReview,
  saveWhoopDays,
  setPersonalOsCloudSyncEnabled,
  syncPersonalOsCloudMirror,
  type CapacityPracticeEntry,
  type CapacityWeeklyReview,
  type WhoopDay
} from "./db";
import { formatMirrorSync } from './personal-os-sync';
import { issuePhoneConnectionCode } from './whoop-connection';
import type { DailyEntry } from "./schema";
import { DraftJournal } from "./v2-journal";
import { flushV2, hasPendingV2, loadV2 } from "./v2";

const dateInput = document.querySelector<HTMLInputElement>("#capacity-date")!;
const dateStatus = document.querySelector<HTMLElement>("#capacity-date-status")!;
const datedSections = Array.from(document.querySelectorAll<HTMLElement>("#capacity-day, #capacity-week, #v2-check-in"));
const stateInput = document.querySelector<HTMLSelectElement>("#capacity-state");
const needInput = document.querySelector<HTMLTextAreaElement>("#capacity-need");
const checkedInInput = document.querySelector<HTMLInputElement>("#checked-in");
const downshiftedInput = document.querySelector<HTMLInputElement>("#downshifted");
const workClosedInput = document.querySelector<HTMLInputElement>("#work-closed");
const somethingForMeInput = document.querySelector<HTMLInputElement>("#something-for-me");
const breakfastChoiceInput = document.querySelector<HTMLSelectElement>("#breakfast-choice");
const breakfastOtherInput = document.querySelector<HTMLInputElement>("#breakfast-other");
const yoghurtFreeInput = document.querySelector<HTMLInputElement>("#yoghurt-free");
const porridgeFreeInput = document.querySelector<HTMLInputElement>("#porridge-free");
const breakfastEnergyScoreInput = document.querySelector<HTMLSelectElement>("#breakfast-energy-score");
const breakfastHungerScoreInput = document.querySelector<HTMLSelectElement>("#breakfast-hunger-score");
const breakfastBloatingScoreInput = document.querySelector<HTMLSelectElement>("#breakfast-bloating-score");
const supportedScoreInput = document.querySelector<HTMLSelectElement>("#supported-score");
const carriedAloneScoreInput = document.querySelector<HTMLSelectElement>("#carried-alone-score");
const notesInput = document.querySelector<HTMLTextAreaElement>("#capacity-notes");
const saveStatus = document.querySelector<HTMLSpanElement>("#capacity-save-status");
const todayProgress = document.querySelector<HTMLElement>("#today-progress");
const foundationPercentage = document.querySelector<HTMLElement>("#foundation-percentage");
const foundationProgressBar = document.querySelector<HTMLElement>("#foundation-progress-bar");
const foundationProgressCopy = document.querySelector<HTMLElement>("#foundation-progress-copy");
const breakfastAdherence = document.querySelector<HTMLElement>("#breakfast-adherence");
const breakfastOutcomes = document.querySelector<HTMLElement>("#breakfast-outcomes");
const breakfastComparison = document.querySelector<HTMLElement>("#breakfast-comparison");
const copyCapacityDataButton = document.querySelector<HTMLButtonElement>("#copy-capacity-data");
const capacityCopyStatus = document.querySelector<HTMLElement>("#capacity-copy-status");
const whoopStatus = document.querySelector<HTMLElement>("#whoop-status");
const whoopDaySummary = document.querySelector<HTMLElement>("#whoop-day-summary");
const whoopConnectButton = document.querySelector<HTMLButtonElement>("#whoop-connect");
const whoopSyncButton = document.querySelector<HTMLButtonElement>("#whoop-sync");
const whoopDisconnectButton = document.querySelector<HTMLButtonElement>("#whoop-disconnect");
const whoopSyncStatus = document.querySelector<HTMLElement>("#whoop-sync-status");
const chatgptAccessStatus = document.querySelector<HTMLElement>("#chatgpt-access-status");
const chatgptAccessCopy = document.querySelector<HTMLElement>("#chatgpt-access-copy");
const chatgptEnableButton = document.querySelector<HTMLButtonElement>("#chatgpt-enable");
const chatgptSyncButton = document.querySelector<HTMLButtonElement>("#chatgpt-sync");
const chatgptRevokeButton = document.querySelector<HTMLButtonElement>("#chatgpt-revoke");
const chatgptSyncStatus = document.querySelector<HTMLElement>("#chatgpt-sync-status");
const chatgptOauthApproval = document.querySelector<HTMLElement>("#chatgpt-oauth-approval");
const chatgptOauthAllowButton = document.querySelector<HTMLButtonElement>("#chatgpt-oauth-allow");
const chatgptOauthCancelButton = document.querySelector<HTMLButtonElement>("#chatgpt-oauth-cancel");
const chatgptOauthStatus = document.querySelector<HTMLElement>("#chatgpt-oauth-status");

const WHOOP_BRIDGE = "https://capacity-tracker.kaliharmen.workers.dev";
const WHOOP_SESSION_KEY = "personal-os-whoop-session";

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
let loadingDaily = true;
let loadingWeekly = false;
let activeDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let activeWeek = mondayFor(activeDate);
const practices = new DraftJournal(localStorage, saveCapacityPractice, "pos-capacity-draft:", entry => entry.date);
const reviews = new DraftJournal(localStorage, saveCapacityReview, "pos-capacity-week-draft:", entry => entry.weekStart);

function showDateStatus(message: string) {
  dateStatus.textContent = message;
  dateStatus.hidden = !message;
}

function hasPendingEdits() {
  return practices.hasPending() || reviews.hasPending() || hasPendingV2();
}

async function flushPractice() {
  window.clearTimeout(dailySaveTimer);
  if (!practices.hasPending()) return;
  try {
    await practices.flush();
    if (saveStatus) saveStatus.textContent = "Saved";
  } catch (error) {
    if (saveStatus) saveStatus.textContent = "Save needs retrying.";
    throw error;
  }
}

async function flushReview() {
  window.clearTimeout(weeklySaveTimer);
  if (!reviews.hasPending()) return;
  try {
    await reviews.flush();
    if (weeklySaveStatus) weeklySaveStatus.textContent = "Saved";
  } catch (error) {
    if (weeklySaveStatus) weeklySaveStatus.textContent = "Save needs retrying.";
    throw error;
  }
}

async function flushEdits() {
  const results = await Promise.allSettled([flushPractice(), flushReview(), flushV2()]);
  if (results.some(result => result.status === "rejected")) throw new Error("Could not save an edit yet. Please keep this page open and retry.");
}

function emptyPractice(date: string): CapacityPracticeEntry {
  return {
    date,
    state: "",
    needToday: "",
    checkedIn: false,
    downshifted: false,
    workClosed: false,
    somethingForMe: false,
    breakfastChoice: "",
    breakfastOther: "",
    yoghurtFree: false,
    porridgeFree: false,
    breakfastEnergyScore: "",
    breakfastHungerScore: "",
    breakfastBloatingScore: "",
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
  const date = activeDate;
  return {
    date,
    state: (stateInput?.value || "") as CapacityPracticeEntry["state"],
    needToday: needInput?.value || "",
    checkedIn: Boolean(checkedInInput?.checked),
    downshifted: Boolean(downshiftedInput?.checked),
    workClosed: Boolean(workClosedInput?.checked),
    somethingForMe: Boolean(somethingForMeInput?.checked),
    breakfastChoice: (breakfastChoiceInput?.value || "") as CapacityPracticeEntry["breakfastChoice"],
    breakfastOther: breakfastOtherInput?.value || "",
    yoghurtFree: Boolean(yoghurtFreeInput?.checked),
    porridgeFree: Boolean(porridgeFreeInput?.checked),
    breakfastEnergyScore: numericValue(breakfastEnergyScoreInput),
    breakfastHungerScore: numericValue(breakfastHungerScoreInput),
    breakfastBloatingScore: numericValue(breakfastBloatingScoreInput),
    supportedScore: numericValue(supportedScoreInput),
    carriedAloneScore: numericValue(carriedAloneScoreInput),
    notes: notesInput?.value || "",
    updatedAt: ""
  };
}

function setPractice(entry: CapacityPracticeEntry): void {
  if (stateInput) stateInput.value = entry.state;
  if (needInput) needInput.value = entry.needToday;
  if (checkedInInput) checkedInInput.checked = entry.checkedIn;
  if (downshiftedInput) downshiftedInput.checked = entry.downshifted;
  if (workClosedInput) workClosedInput.checked = entry.workClosed;
  if (somethingForMeInput) somethingForMeInput.checked = entry.somethingForMe;
  if (breakfastChoiceInput) breakfastChoiceInput.value = entry.breakfastChoice || "";
  if (breakfastOtherInput) breakfastOtherInput.value = entry.breakfastOther || "";
  if (yoghurtFreeInput) yoghurtFreeInput.checked = Boolean(entry.yoghurtFree);
  if (porridgeFreeInput) porridgeFreeInput.checked = Boolean(entry.porridgeFree);
  if (breakfastEnergyScoreInput) breakfastEnergyScoreInput.value = String(entry.breakfastEnergyScore ?? "");
  if (breakfastHungerScoreInput) breakfastHungerScoreInput.value = String(entry.breakfastHungerScore ?? "");
  if (breakfastBloatingScoreInput) breakfastBloatingScoreInput.value = String(entry.breakfastBloatingScore ?? "");
  if (supportedScoreInput) supportedScoreInput.value = String(entry.supportedScore);
  if (carriedAloneScoreInput) carriedAloneScoreInput.value = String(entry.carriedAloneScore);
  if (notesInput) notesInput.value = entry.notes;
  updateTodayProgress(entry);
}

function breakfastResetFollowed(entry: CapacityPracticeEntry): boolean {
  return Boolean(
    entry.yoghurtFree &&
    entry.porridgeFree &&
    entry.breakfastChoice &&
    entry.breakfastChoice !== "No breakfast"
  );
}

function actionsCompleted(entry: CapacityPracticeEntry): number {
  return [
    entry.checkedIn,
    entry.downshifted,
    entry.workClosed,
    entry.somethingForMe,
    breakfastResetFollowed(entry)
  ].filter(Boolean).length;
}

function updateTodayProgress(entry: CapacityPracticeEntry): void {
  if (todayProgress) todayProgress.textContent = String(actionsCompleted(entry)) + " / 5 active practices";
}

function scoreAverage(entries: CapacityPracticeEntry[], field: "breakfastEnergyScore" | "breakfastHungerScore" | "breakfastBloatingScore"): number | null {
  const values = entries
    .map((entry) => entry[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function displayBreakfastName(entry: CapacityPracticeEntry): string {
  if (entry.breakfastChoice === "Other quick protein breakfast" && entry.breakfastOther.trim()) return entry.breakfastOther.trim();
  return entry.breakfastChoice || "Not recorded";
}

function whoopAverage(entries: WhoopDay[], field: "sleepHours" | "recoveryScore" | "hrvRmssdMs" | "restingHeartRate" | "cycleStrain" | "stepCount"): number | null {
  const values = entries
    .map((entry) => entry[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dailyAverage(entries: DailyEntry[], field: "sleepHours" | "energyScore" | "clarityScore" | "whoopRecoveryScore" | "capacityRemainingScore"): number | null {
  const values = entries
    .map((entry) => entry[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && (field !== "sleepHours" || value > 0));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderBreakfastComparison(entries: CapacityPracticeEntry[], dailyEntries: DailyEntry[], whoopEntries: WhoopDay[]): void {
  if (!breakfastComparison) return;
  const breakfastDays = entries.filter((entry) => entry.breakfastChoice && entry.breakfastChoice !== "No breakfast");
  if (!breakfastDays.length) {
    breakfastComparison.innerHTML = '<p class="empty-state">Breakfast comparisons will appear after you have logged them.</p>';
    return;
  }

  const groups = new Map<string, CapacityPracticeEntry[]>();
  breakfastDays.forEach((entry) => {
    const name = displayBreakfastName(entry);
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  });

  const dailyByDate = new Map(dailyEntries.map((entry) => [entry.date, entry]));
  const whoopByDate = new Map(whoopEntries.map((entry) => [entry.date, entry]));

  const rows = [...groups.entries()]
    .map(([name, group]) => {
      const linkedDaily = group.map((entry) => dailyByDate.get(entry.date)).filter((entry): entry is DailyEntry => Boolean(entry));
      const linkedWhoop = group.map((entry) => whoopByDate.get(entry.date)).filter((entry): entry is WhoopDay => Boolean(entry));
      return {
        name,
        count: group.length,
        linkedCount: linkedDaily.length,
        energy: scoreAverage(group, "breakfastEnergyScore"),
        hunger: scoreAverage(group, "breakfastHungerScore"),
        bloating: scoreAverage(group, "breakfastBloatingScore"),
        sleep: whoopAverage(linkedWhoop, "sleepHours") ?? dailyAverage(linkedDaily, "sleepHours"),
        whoop: whoopAverage(linkedWhoop, "recoveryScore") ?? dailyAverage(linkedDaily, "whoopRecoveryScore"),
        hrv: whoopAverage(linkedWhoop, "hrvRmssdMs"),
        rhr: whoopAverage(linkedWhoop, "restingHeartRate"),
        strain: whoopAverage(linkedWhoop, "cycleStrain"),
        steps: whoopAverage(linkedWhoop, "stepCount"),
        dailyEnergy: dailyAverage(linkedDaily, "energyScore"),
        clarity: dailyAverage(linkedDaily, "clarityScore"),
        remaining: dailyAverage(linkedDaily, "capacityRemainingScore")
      };
    })
    .sort((a, b) => b.count - a.count || (b.energy ?? -1) - (a.energy ?? -1));

  const fmt = (value: number | null) => value === null ? "—" : value.toFixed(1);
  breakfastComparison.innerHTML = rows.map((row) => `
    <article class="breakfast-result-card">
      <div>
        <strong>${row.name}</strong>
        <small>${row.count} logged breakfast${row.count === 1 ? "" : "s"}${row.count < 3 ? " · preliminary" : ""}</small>
      </div>
      <div class="breakfast-result-metrics">
        <div>
          <small class="metric-heading">Breakfast response</small>
          <dl>
            <div><dt>Morning energy</dt><dd>${fmt(row.energy)} / 4</dd></div>
            <div><dt>Hunger</dt><dd>${fmt(row.hunger)} / 4</dd></div>
            <div><dt>Bloating</dt><dd>${fmt(row.bloating)} / 4</dd></div>
          </dl>
        </div>
        <div>
          <small class="metric-heading">Matched Daily Log · ${row.linkedCount} day${row.linkedCount === 1 ? "" : "s"}</small>
          <dl class="joined-daily-metrics">
            <div><dt>Sleep</dt><dd>${row.sleep === null ? "—" : row.sleep.toFixed(1) + " h"}</dd></div>
            <div><dt>Recovery</dt><dd>${fmt(row.whoop)}</dd></div>
            <div><dt>HRV</dt><dd>${row.hrv === null ? "—" : row.hrv.toFixed(0) + " ms"}</dd></div>
            <div><dt>RHR</dt><dd>${row.rhr === null ? "—" : row.rhr.toFixed(0)}</dd></div>
            <div><dt>Strain</dt><dd>${fmt(row.strain)}</dd></div>
            <div><dt>Steps</dt><dd>${row.steps === null ? "—" : Math.round(row.steps).toLocaleString()}</dd></div>
            <div><dt>Day energy</dt><dd>${row.dailyEnergy === null ? "—" : row.dailyEnergy.toFixed(1) + " / 10"}</dd></div>
            <div><dt>Clarity</dt><dd>${row.clarity === null ? "—" : row.clarity.toFixed(1) + " / 10"}</dd></div>
            <div><dt>Capacity left</dt><dd>${row.remaining === null ? "—" : row.remaining.toFixed(1) + " / 10"}</dd></div>
          </dl>
        </div>
      </div>
    </article>
  `).join("");
}

async function updateRollingProgress(): Promise<void> {
  const [entries, dailyEntries, whoopEntries] = await Promise.all([getCapacityPractices(), getAllEntries(), getWhoopDays()]);
  const end = new Date(activeDate + "T12:00:00");
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

  const possible = windowEntries.length * 5;
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

  const breakfastDays = windowEntries.filter((entry) =>
    Boolean(entry.breakfastChoice) || entry.breakfastEnergyScore !== "" || entry.breakfastHungerScore !== "" || entry.breakfastBloatingScore !== ""
  );
  const followed = breakfastDays.filter(breakfastResetFollowed).length;
  if (breakfastAdherence) {
    breakfastAdherence.textContent = breakfastDays.length
      ? String(followed) + " / " + String(breakfastDays.length) + " reset days followed"
      : "No data yet";
  }

  function average(field: "breakfastEnergyScore" | "breakfastHungerScore" | "breakfastBloatingScore"): string | null {
    const values = breakfastDays
      .map((entry) => entry[field])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) return null;
    return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
  }

  const energy = average("breakfastEnergyScore");
  const hunger = average("breakfastHungerScore");
  const bloating = average("breakfastBloatingScore");
  if (breakfastOutcomes) {
    breakfastOutcomes.textContent = [energy ? "Energy " + energy + "/4" : "", hunger ? "Hunger " + hunger + "/4" : "", bloating ? "Bloating " + bloating + "/4" : ""]
      .filter(Boolean)
      .join(" · ") || "Energy, hunger and bloating averages will appear once there are ratings to compare.";
  }

  const windowDailyEntries = dailyEntries.filter((entry) => entry.date >= startIso && entry.date <= endIso);
  const windowWhoopEntries = whoopEntries.filter((entry) => entry.date >= startIso && entry.date <= endIso);
  renderBreakfastComparison(windowEntries, windowDailyEntries, windowWhoopEntries);
}

function formatWhoopValue(value: number | null, suffix = "", digits = 0): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) + suffix : "—";
}

function formatSleepDuration(minutes: number | null | undefined): string {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return '-';
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)} h ${rounded % 60} min`;
}

async function renderWhoopDay(date: string): Promise<void> {
  const session = localStorage.getItem(WHOOP_SESSION_KEY);
  const day = await getWhoopDay(date);
  if (date !== activeDate) return;
  if (whoopStatus) whoopStatus.textContent = session ? "Connected" : "Not connected";
  if (whoopConnectButton) {
    whoopConnectButton.hidden = false;
    whoopConnectButton.textContent = session ? 'Reconnect WHOOP' : 'Connect WHOOP';
  }
  if (whoopSyncButton) whoopSyncButton.hidden = !session;
  if (whoopDisconnectButton) whoopDisconnectButton.hidden = !session;

  if (!whoopDaySummary) return;
  if (!day) {
    whoopDaySummary.innerHTML = session
      ? "<p>No synced WHOOP record for this date yet.</p>"
      : "<p>Connect WHOOP to pull recovery, sleep, HRV, resting heart rate, strain, steps and workouts into the Personal OS.</p>";
    return;
  }

  whoopDaySummary.innerHTML = `
    <dl class="whoop-summary-grid">
      <div><dt>Recovery</dt><dd>${formatWhoopValue(day.recoveryScore)}</dd></div>
      <div><dt>Sleep</dt><dd>${formatWhoopValue(day.sleepHours, " h", 1)}</dd></div>
      <div><dt>REM sleep</dt><dd>${formatSleepDuration(day.remSleepMinutes)}</dd></div>
      <div><dt>Deep sleep</dt><dd>${formatSleepDuration(day.deepSleepMinutes)}</dd></div>
      <div><dt>Awake during sleep</dt><dd>${formatSleepDuration(day.awakeMinutes)}</dd></div>
      <div><dt>Sleep debt before sleep</dt><dd>${formatSleepDuration(day.sleepDebtMinutes)}</dd></div>
      <div><dt>HRV</dt><dd>${formatWhoopValue(day.hrvRmssdMs, " ms")}</dd></div>
      <div><dt>RHR</dt><dd>${formatWhoopValue(day.restingHeartRate)}</dd></div>
      <div><dt>Strain</dt><dd>${formatWhoopValue(day.cycleStrain, "", 1)}</dd></div>
      <div><dt>Steps</dt><dd>${typeof day.stepCount === "number" ? Math.round(day.stepCount).toLocaleString() : "—"}</dd></div>
    </dl>
    <small>Sleep debt is WHOOP's debt contribution to the sleep need before this sleep, not the remaining debt after waking.</small>
    <small>Last synced ${new Date(day.syncedAt).toLocaleString()}</small>
  `;
}

function captureWhoopSession(): boolean {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const session = hash.get("whoop_session");
  if (!session) return false;

  localStorage.setItem(WHOOP_SESSION_KEY, session);

  const url = new URL(window.location.href);
  url.searchParams.delete("whoop");
  url.hash = "";
  history.replaceState({}, document.title, url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""));

  return true;
}

async function syncWhoop(days = 30): Promise<void> {
  const session = localStorage.getItem(WHOOP_SESSION_KEY);
  if (!session) {
    await renderWhoopDay(activeDate);
    return;
  }

  if (whoopSyncStatus) whoopSyncStatus.textContent = "Syncing WHOOP...";
  try {
    const response = await fetch(`${WHOOP_BRIDGE}/api/whoop?days=${days}`, {
      headers: { Authorization: `Bearer ${session}` }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "WHOOP sync failed");
    const records = Array.isArray(payload?.records) ? payload.records : [];
    await saveWhoopDays(records);
    if (whoopSyncStatus) whoopSyncStatus.textContent = `Synced ${records.length} WHOOP day${records.length === 1 ? "" : "s"}.`;
    await renderWhoopDay(activeDate);
    await updateRollingProgress();
  } catch (error) {
    if (whoopSyncStatus) whoopSyncStatus.textContent = error instanceof Error ? error.message : "WHOOP sync failed.";
  }
}

async function disconnectWhoop(): Promise<void> {
  const session = localStorage.getItem(WHOOP_SESSION_KEY);
  if (session) {
    try {
      await fetch(`${WHOOP_BRIDGE}/api/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session}` }
      });
    } catch {
      // Local disconnect still proceeds if the network request fails.
    }
  }
  localStorage.removeItem(WHOOP_SESSION_KEY);
  await clearWhoopDays();
  if (whoopSyncStatus) whoopSyncStatus.textContent = "WHOOP disconnected and locally synced WHOOP data cleared.";
  await renderWhoopDay(activeDate);
  await updateRollingProgress();
}

async function renderChatGPTAccessStatus(): Promise<void> {
  const diagnostic = document.querySelector('#chatgpt-local-counts');
  if (diagnostic) {
    const counts = await getPersonalOsLocalCounts();
    const id = localStorage.getItem('personal-os-sync-client-id');
    diagnostic.textContent = `This browser${id ? ' '+id.slice(0,8) : ''} · ${window.location.origin} · capacity-tracker: ${counts.daily} Daily Log, ${counts.capacity} Capacity, ${counts.whoop} WHOOP saved locally. Separate browsers and home-screen apps may have different local records.`;
  }
  const enabled = isPersonalOsCloudSyncEnabled();
  if (chatgptAccessStatus) chatgptAccessStatus.textContent = enabled ? "Enabled" : "Not enabled";
  if (chatgptEnableButton) chatgptEnableButton.hidden = enabled;
  if (chatgptSyncButton) chatgptSyncButton.hidden = !enabled;
  if (chatgptRevokeButton) chatgptRevokeButton.hidden = !enabled;
  if (chatgptAccessCopy) {
    chatgptAccessCopy.textContent = enabled
      ? "Cloud mirroring is enabled. Local Daily Log and Capacity changes sync automatically; ChatGPT connects separately through browser approval and WHOOP can refresh live when queried."
      : "Optional read-only access lets the private Personal OS plugin query the joined Daily Log, Capacity and WHOOP data without copy/paste. ChatGPT connects through a browser approval flow — there is no key to paste.";
  }
}

async function enableChatGPTAccess(): Promise<void> {
  const session = localStorage.getItem(WHOOP_SESSION_KEY);
  if (!session) {
    if (chatgptSyncStatus) chatgptSyncStatus.textContent = "Connect WHOOP first so this browser can authorise Personal OS cloud access.";
    return;
  }

  setPersonalOsCloudSyncEnabled(true);
  if (chatgptSyncStatus) chatgptSyncStatus.textContent = "Syncing the Personal OS cloud mirror...";
  const syncResult = await syncPersonalOsCloudMirror();
  if (chatgptSyncStatus) {
    chatgptSyncStatus.textContent = formatMirrorSync(syncResult);
  }
  await renderChatGPTAccessStatus();
}

async function syncChatGPTMirror(): Promise<void> {
  if (chatgptSyncStatus) chatgptSyncStatus.textContent = "Syncing Personal OS cloud mirror...";
  try { await flushEdits(); }
  catch (error) {
    if (chatgptSyncStatus) chatgptSyncStatus.textContent = String((error as Error).message);
    return;
  }
  const result = await syncPersonalOsCloudMirror();
  if (chatgptSyncStatus) {
    chatgptSyncStatus.textContent = formatMirrorSync(result);
  }
  await renderChatGPTAccessStatus();
}

async function revokeChatGPTAccess(): Promise<void> {
  const session = localStorage.getItem(WHOOP_SESSION_KEY);
  if (!session) {
    setPersonalOsCloudSyncEnabled(false);
    await renderChatGPTAccessStatus();
    return;
  }

  if (chatgptSyncStatus) chatgptSyncStatus.textContent = "Revoking ChatGPT access...";
  try {
    const response = await fetch(`${WHOOP_BRIDGE}/api/chatgpt-key`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session}` }
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Could not revoke ChatGPT access.");
    setPersonalOsCloudSyncEnabled(false);
    if (chatgptSyncStatus) chatgptSyncStatus.textContent = "ChatGPT access revoked and the cloud mirror deleted.";
    await renderChatGPTAccessStatus();
  } catch (error) {
    if (chatgptSyncStatus) chatgptSyncStatus.textContent = error instanceof Error ? error.message : "Could not revoke ChatGPT access.";
  }
}

async function loadPractice(date: string): Promise<void> {
  const entry = { ...emptyPractice(date), ...(practices.read(date) ?? await getCapacityPractice(date)) };
  setPractice(entry);
  if (saveStatus) saveStatus.textContent = "Autosaves as I go";
}

async function loadDay(date: string, saveFirst: boolean) {
  const previouslyLocked = loadingDaily;
  loadingDaily = true;
  dateInput.disabled = true;
  datedSections.forEach(section => { section.inert = true; });
  showDateStatus("");
  try {
    if (saveFirst) {
      try { await flushEdits(); }
      catch {
        dateInput.value = activeDate;
        loadingDaily = previouslyLocked;
        datedSections.forEach(section => { section.inert = previouslyLocked; });
        showDateStatus("Could not save an edit yet. Please try changing the date again.");
        return;
      }
    }
    await loadPractice(date);
    await loadV2(date);
    await loadReview(mondayFor(date));
    activeDate = date;
    dateInput.value = date;
    const url = new URL(location.href);
    url.searchParams.set("date", date);
    history.replaceState(history.state, "", url);
    loadingDaily = false;
    datedSections.forEach(section => { section.inert = false; });
    void renderWhoopDay(date).catch(() => {});
    void updateRollingProgress().catch(() => {});
  } catch {
    showDateStatus("Could not load this date. Choose a date to try again.");
  } finally {
    dateInput.disabled = false;
  }
}

function scheduleDailySave(): void {
  if (loadingDaily) return;
  window.clearTimeout(dailySaveTimer);
  if (saveStatus) saveStatus.textContent = "Saving...";
  const snapshot = collectPractice();
  try { practices.stage(snapshot); }
  catch { if (saveStatus) saveStatus.textContent = "Keep this page open while saving."; }
  updateTodayProgress(snapshot);
  dailySaveTimer = window.setTimeout(() => {
    void flushPractice().then(updateRollingProgress).catch(() => {});
  }, 450);
}

function collectReview(): CapacityWeeklyReview {
  return {
    weekStart: activeWeek,
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
  const review = { ...emptyReview(weekStart), ...(reviews.read(weekStart) ?? await getCapacityReview(weekStart)) };
  setReview(review);
  activeWeek = weekStart;
  if (weeklySaveStatus) weeklySaveStatus.textContent = "Autosaves as I go";
}

function scheduleWeeklySave(): void {
  if (loadingWeekly) return;
  window.clearTimeout(weeklySaveTimer);
  if (weeklySaveStatus) weeklySaveStatus.textContent = "Saving...";
  try { reviews.stage(collectReview()); }
  catch { if (weeklySaveStatus) weeklySaveStatus.textContent = "Keep this page open while saving."; }
  weeklySaveTimer = window.setTimeout(() => {
    void flushReview().catch(() => {});
  }, 450);
}

const dailyControls = [
  stateInput,
  needInput,
  checkedInInput,
  downshiftedInput,
  workClosedInput,
  somethingForMeInput,
  breakfastChoiceInput,
  breakfastOtherInput,
  yoghurtFreeInput,
  porridgeFreeInput,
  breakfastEnergyScoreInput,
  breakfastHungerScoreInput,
  breakfastBloatingScoreInput,
  supportedScoreInput,
  carriedAloneScoreInput,
  notesInput
].filter(Boolean) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

dailyControls.forEach((control) => {
  control.addEventListener("input", scheduleDailySave);
  control.addEventListener("change", scheduleDailySave);
});

dateInput.addEventListener("change", () => {
  if (!dateInput.value) { dateInput.value = activeDate; return; }
  void loadDay(dateInput.value, true);
});

weeklyForm?.addEventListener("input", scheduleWeeklySave);
weeklyForm?.addEventListener("change", scheduleWeeklySave);

weekStartInput?.addEventListener("change", async () => {
  loadingWeekly = true;
  dateInput.disabled = weekStartInput.disabled = true;
  if (weeklyForm) weeklyForm.inert = true;
  try {
    await flushReview();
    await loadReview(weekStartInput.value || activeWeek);
  } catch {
    weekStartInput.value = activeWeek;
    if (weeklySaveStatus) weeklySaveStatus.textContent = "Could not switch weeks. Please try again.";
  } finally {
    loadingWeekly = false;
    dateInput.disabled = weekStartInput.disabled = false;
    if (weeklyForm) weeklyForm.inert = false;
  }
});

document.querySelector("#capacity-form")?.addEventListener("submit", event => event.preventDefault());
weeklyForm?.addEventListener("submit", event => event.preventDefault());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && hasPendingEdits()) void flushEdits().catch(() => {});
});
window.addEventListener("pagehide", () => {
  if (hasPendingEdits()) void flushEdits().catch(() => {});
});
window.addEventListener("beforeunload", event => {
  if (hasPendingEdits()) event.preventDefault();
});
document.addEventListener("click", event => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
  if (!link || event.defaultPrevented || link.target || link.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !hasPendingEdits()) return;
  const destination = new URL(link.href);
  if (destination.origin === location.origin && destination.pathname === location.pathname && destination.hash) return;
  event.preventDefault();
  void flushEdits().then(() => location.assign(destination)).catch(() => showDateStatus("Could not save an edit yet. Please keep this page open and retry."));
});

async function copyCapacityData(): Promise<void> {
  const [entries, dailyEntries, whoopEntries] = await Promise.all([getCapacityPractices(), getAllEntries(), getWhoopDays()]);
  const end = new Date(activeDate + "T12:00:00");
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  const windowEntries = entries.filter((entry) => entry.date >= startIso && entry.date <= endIso);

  if (!windowEntries.length) {
    if (capacityCopyStatus) capacityCopyStatus.textContent = "There are no Capacity Building entries in this 14-day window yet.";
    return;
  }

  const lines = [
    "# Capacity Building — last 14 days",
    "",
    `Range: ${startIso} to ${endIso}`,
    "",
    "## Breakfast data"
  ];

  for (const entry of windowEntries) {
    lines.push(
      `- ${entry.date}: breakfast=${displayBreakfastName(entry)}; yoghurt-free=${entry.yoghurtFree ? "yes" : "no"}; porridge-free=${entry.porridgeFree ? "yes" : "no"}; energy=${entry.breakfastEnergyScore === "" ? "not rated" : entry.breakfastEnergyScore + "/4"}; hunger=${entry.breakfastHungerScore === "" ? "not rated" : entry.breakfastHungerScore + "/4"}; bloating=${entry.breakfastBloatingScore === "" ? "not rated" : entry.breakfastBloatingScore + "/4"}`
    );
  }

  const dailyByDate = new Map(dailyEntries.map((entry) => [entry.date, entry]));
  const whoopByDate = new Map(whoopEntries.map((entry) => [entry.date, entry]));
  lines.push("", "## Joined whole-system context");
  for (const entry of windowEntries) {
    const daily = dailyByDate.get(entry.date);
    const whoop = whoopByDate.get(entry.date);
    lines.push(
      `- ${entry.date}: state=${entry.state || "not recorded"}; breakfast=${displayBreakfastName(entry)}; breakfast-energy=${entry.breakfastEnergyScore === "" ? "not rated" : entry.breakfastEnergyScore + "/4"}; hunger=${entry.breakfastHungerScore === "" ? "not rated" : entry.breakfastHungerScore + "/4"}; bloating=${entry.breakfastBloatingScore === "" ? "not rated" : entry.breakfastBloatingScore + "/4"}; WHOOP-recovery=${whoop?.recoveryScore ?? (typeof daily?.whoopRecoveryScore === "number" ? daily.whoopRecoveryScore : "not recorded")}; WHOOP-HRV=${whoop?.hrvRmssdMs ?? "not recorded"}; WHOOP-RHR=${whoop?.restingHeartRate ?? "not recorded"}; WHOOP-sleep=${whoop?.sleepHours ?? (daily?.sleepHours || "not recorded")}; WHOOP-strain=${whoop?.cycleStrain ?? "not recorded"}; WHOOP-steps=${whoop?.stepCount ?? "not recorded"}; day-energy=${daily?.energyScore ?? "not recorded"}/10; clarity=${daily?.clarityScore ?? "not recorded"}/10; capacity-left=${typeof daily?.capacityRemainingScore === "number" ? daily.capacityRemainingScore + "/10" : "not recorded"}; fatigue=${daily?.fatigueLevel || "not recorded"}; movement=${daily?.movementTypes?.join(", ") || "not recorded"}; load=${daily?.load?.join(", ") || "not recorded"}; supported=${entry.supportedScore === "" ? "not rated" : entry.supportedScore + "/4"}; carried-alone=${entry.carriedAloneScore === "" ? "not rated" : entry.carriedAloneScore + "/4"}${entry.notes ? "; capacity-notes=" + entry.notes.replaceAll("\n", " ") : ""}`
    );
  }

  const text = lines.join("\n");
  try {
    if (navigator.share) {
      await navigator.share({ title: "Capacity Building data", text });
      if (capacityCopyStatus) capacityCopyStatus.textContent = "Shared the last 14 days.";
      return;
    }
  } catch {
    // Fall back to clipboard after a cancelled or unavailable share.
  }

  try {
    await navigator.clipboard.writeText(text);
    if (capacityCopyStatus) capacityCopyStatus.textContent = "Copied the last 14 days. Paste it into this ChatGPT thread and I can interpret it with the rest of your Personal OS data.";
  } catch {
    if (capacityCopyStatus) capacityCopyStatus.textContent = "Copy was blocked by the browser. Use the JSON backup from Export if needed.";
  }
}

copyCapacityDataButton?.addEventListener("click", () => {
  void copyCapacityData();
});

whoopConnectButton?.addEventListener("click", async () => {
  if (loadingDaily) { if (whoopSyncStatus) whoopSyncStatus.textContent = 'Please wait for this date to finish loading.'; return; }
  try { await flushEdits(); }
  catch { if (whoopSyncStatus) whoopSyncStatus.textContent = 'Could not save this edit yet. Please keep this page open and retry.'; return; }
  window.location.href = `${WHOOP_BRIDGE}/oauth/start`;
});

const phoneCode = document.querySelector<HTMLInputElement>('#whoop-phone-code');
const phoneCodeStatus = document.querySelector<HTMLElement>('#whoop-phone-code-status');
document.querySelector<HTMLButtonElement>('#whoop-phone-code-create')?.addEventListener('click', async event => {
  const button = event.currentTarget as HTMLButtonElement;
  button.disabled = true;
  try {
    const session = localStorage.getItem(WHOOP_SESSION_KEY);
    if (!session) throw new Error('Open this page in Safari where WHOOP sign-in finished.');
    const code = await issuePhoneConnectionCode(WHOOP_BRIDGE, session);
    phoneCode!.value = code;
    document.querySelector<HTMLElement>('#whoop-phone-code-field')!.hidden = false;
    document.querySelector<HTMLElement>('#whoop-phone-code-copy')!.hidden = false;
    phoneCodeStatus!.textContent = 'This private connection code expires in 10 minutes.';
  } catch (error) { phoneCodeStatus!.textContent = error instanceof Error ? error.message : 'Could not create connection code.'; }
  finally { button.disabled = false; }
});
document.querySelector('#whoop-phone-code-copy')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(phoneCode!.value); phoneCodeStatus!.textContent = 'Connection code copied.'; }
  catch { phoneCode!.focus(); phoneCode!.select(); phoneCodeStatus!.textContent = 'Select and copy the connection code from the field.'; }
});

whoopSyncButton?.addEventListener("click", () => {
  void syncWhoop(30);
});

whoopDisconnectButton?.addEventListener("click", () => {
  void disconnectWhoop();
});

chatgptEnableButton?.addEventListener("click", () => {
  void enableChatGPTAccess();
});

chatgptSyncButton?.addEventListener("click", () => {
  void syncChatGPTMirror();
});

chatgptRevokeButton?.addEventListener("click", () => {
  void revokeChatGPTAccess();
});

async function completeChatGPTOAuthDecision(requestId: string, approvalToken: string, approved: boolean): Promise<void> {
  if (chatgptOauthStatus) chatgptOauthStatus.textContent = approved ? "Approving Personal OS access..." : "Cancelling connection...";

  try {
    await flushEdits();
    const response = await fetch(`${WHOOP_BRIDGE}/api/chatgpt-oauth/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, approvalToken, approved })
    });
    const payload = await response.json();
    if (!response.ok || !payload?.redirectUrl) throw new Error(payload?.error || "Could not complete Personal OS approval.");
    window.location.href = payload.redirectUrl;
  } catch (error) {
    if (chatgptOauthStatus) chatgptOauthStatus.textContent = error instanceof Error ? error.message : "Could not complete Personal OS approval.";
  }
}

async function handleChatGPTOAuthRequest(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const requestId = params.get("chatgpt_oauth");
  const approvalToken = params.get("chatgpt_approval");
  if (!requestId || !approvalToken) return;
  if (params.get('chatgpt_review') === '1' && chatgptOauthApproval) {
    const heading = chatgptOauthApproval.querySelector('h2');
    const description = chatgptOauthApproval.querySelector('div > p:last-child');
    if (heading) heading.textContent = 'Allow reading and photo review receipts?';
    if (description) description.textContent = 'ChatGPT can read your logs and private meal photos, and acknowledge photos used in a saved review. If automatic cleanup is enabled, those photos are removed after seven days. It cannot edit your daily answers.';
    if (chatgptOauthAllowButton) chatgptOauthAllowButton.textContent = 'Allow access and review receipts';
  }

  if (chatgptOauthApproval) {
    chatgptOauthApproval.hidden = false;
    chatgptOauthApproval.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (chatgptOauthStatus) chatgptOauthStatus.textContent = params.get('chatgpt_review') === '1'
    ? "Choose whether to allow private reads and completed-photo-review receipts."
    : "Choose whether to allow read-only Personal OS access.";

  chatgptOauthAllowButton?.addEventListener("click", () => {
    void completeChatGPTOAuthDecision(requestId, approvalToken, true);
  }, { once: true });

  chatgptOauthCancelButton?.addEventListener("click", () => {
    void completeChatGPTOAuthDecision(requestId, approvalToken, false);
  }, { once: true });
}

const returnedFromWhoop = captureWhoopSession();
window.addEventListener('personal-os-cloud-sync', event => {
  if (chatgptSyncStatus) chatgptSyncStatus.textContent = formatMirrorSync((event as CustomEvent).detail);
  void renderChatGPTAccessStatus();
});

const initialDate = new URLSearchParams(window.location.search).get("date");
dateInput.value = initialDate ?? activeDate;
void loadDay(dateInput.value || activeDate, false);
window.addEventListener("personal-os-whoop-connected", () => {
  void renderWhoopDay(activeDate).catch(() => {});
  void renderChatGPTAccessStatus();
});
void renderChatGPTAccessStatus();
if (isPersonalOsCloudSyncEnabled()) void syncChatGPTMirror();
void handleChatGPTOAuthRequest();
if (returnedFromWhoop) void syncWhoop(30);
