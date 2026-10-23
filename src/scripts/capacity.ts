import {
  clearWhoopDays,
  getAllEntries,
  getCapacityPractice,
  getCapacityPractices,
  getCapacityReview,
  getWhoopDay,
  getWhoopDays,
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
import { todayIso, type DailyEntry } from "./schema";

const dateInput = document.querySelector<HTMLInputElement>("#capacity-date");
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
const chatgptKeyBox = document.querySelector<HTMLElement>("#chatgpt-key-box");
const chatgptKeyValue = document.querySelector<HTMLElement>("#chatgpt-key-value");
const chatgptCopyKeyButton = document.querySelector<HTMLButtonElement>("#chatgpt-copy-key");
const chatgptSyncStatus = document.querySelector<HTMLElement>("#chatgpt-sync-status");

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
  const date = dateInput?.value || todayIso();
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
  if (dateInput) dateInput.value = entry.date;
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

async function renderWhoopDay(date: string): Promise<void> {
  const session = localStorage.getItem(WHOOP_SESSION_KEY);
  const day = await getWhoopDay(date);
  if (whoopStatus) whoopStatus.textContent = session ? "Connected" : "Not connected";
  if (whoopConnectButton) whoopConnectButton.hidden = Boolean(session);
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
      <div><dt>HRV</dt><dd>${formatWhoopValue(day.hrvRmssdMs, " ms")}</dd></div>
      <div><dt>RHR</dt><dd>${formatWhoopValue(day.restingHeartRate)}</dd></div>
      <div><dt>Strain</dt><dd>${formatWhoopValue(day.cycleStrain, "", 1)}</dd></div>
      <div><dt>Steps</dt><dd>${typeof day.stepCount === "number" ? Math.round(day.stepCount).toLocaleString() : "—"}</dd></div>
    </dl>
    <small>Last synced ${new Date(day.syncedAt).toLocaleString()}</small>
  `;
}

function captureWhoopSession(): boolean {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const session = hash.get("whoop_session");
  if (!session) return false;
  localStorage.setItem(WHOOP_SESSION_KEY, session);
  history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/[?&]whoop=connected(&|$)/, "$1").replace(/[?&]$/, ""));
  return true;
}

async function syncWhoop(days = 30): Promise<void> {
  const session = localStorage.getItem(WHOOP_SESSION_KEY);
  if (!session) {
    await renderWhoopDay(dateInput?.value || todayIso());
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
    await renderWhoopDay(dateInput?.value || todayIso());
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
  await renderWhoopDay(dateInput?.value || todayIso());
  await updateRollingProgress();
}

async function loadPractice(date: string): Promise<void> {
  loadingDaily = true;
  const entry = { ...emptyPractice(date), ...((await getCapacityPractice(date)) ?? {}) };
  setPractice(entry);
  loadingDaily = false;
  if (saveStatus) saveStatus.textContent = "Autosaves as I go";
  await updateRollingProgress();
  await renderWhoopDay(date);
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

async function copyCapacityData(): Promise<void> {
  const [entries, dailyEntries, whoopEntries] = await Promise.all([getCapacityPractices(), getAllEntries(), getWhoopDays()]);
  const end = new Date((dateInput?.value || todayIso()) + "T12:00:00");
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

whoopConnectButton?.addEventListener("click", () => {
  window.location.href = `${WHOOP_BRIDGE}/oauth/start`;
});

whoopSyncButton?.addEventListener("click", () => {
  void syncWhoop(30);
});

whoopDisconnectButton?.addEventListener("click", () => {
  void disconnectWhoop();
});

const returnedFromWhoop = captureWhoopSession();

const initialDate = new URLSearchParams(window.location.search).get("date") || todayIso();
if (dateInput) dateInput.value = initialDate;
if (weekStartInput) weekStartInput.value = mondayFor(initialDate);
void loadPractice(initialDate);
void loadReview(mondayFor(initialDate));
if (returnedFromWhoop) void syncWhoop(30);
