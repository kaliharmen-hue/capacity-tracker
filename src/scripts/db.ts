import Dexie, { type Table } from "dexie";
import type { DailyEntry } from "./schema";
import type { ClusterDecision } from "./timeline-model";

export interface CapacityPracticeEntry {
  date: string;
  state: "" | "Settled" | "Activated" | "Stretched" | "Overloaded";
  needToday: string;
  checkedIn: boolean;
  downshifted: boolean;
  workClosed: boolean;
  somethingForMe: boolean;
  ateEnough?: boolean;
  proteinSupport?: boolean;
  carbSupport?: boolean;
  hydration?: boolean;
  breakfastChoice: "" | "2 eggs + smoked salmon + veg" | "3-egg vegetable scramble" | "Protein-chia berry shake" | "2 boiled eggs + sardines + veg" | "Tofu scramble + 1 egg" | "Leftover chicken + 2 eggs + veg" | "Protein shake + 2 boiled eggs" | "Other quick protein breakfast" | "No breakfast";
  breakfastOther: string;
  yoghurtFree: boolean;
  porridgeFree: boolean;
  breakfastEnergyScore: number | "";
  breakfastHungerScore: number | "";
  breakfastBloatingScore: number | "";
  supportedScore: number | "";
  carriedAloneScore: number | "";
  notes: string;
  updatedAt: string;
}

export interface CapacityWeeklyReview {
  weekStart: string;
  capacityGivers: string;
  capacityDrains: string;
  receivedSupport: string;
  carriedAlone: string;
  oneAdjustment: string;
  updatedAt: string;
}

export interface WhoopWorkout {
  id: string | number;
  sportName: string | null;
  start: string | null;
  end: string | null;
  strain: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
}

export interface WhoopDay {
  date: string;
  sleepId: string | number | null;
  cycleId: string | number | null;
  recoveryScore: number | null;
  hrvRmssdMs: number | null;
  restingHeartRate: number | null;
  spo2Percentage: number | null;
  skinTempCelsius: number | null;
  sleepHours: number | null;
  sleepStart: string | null;
  sleepEnd: string | null;
  sleepPerformancePercentage: number | null;
  sleepEfficiencyPercentage: number | null;
  sleepConsistencyPercentage: number | null;
  disturbanceCount: number | null;
  respiratoryRate: number | null;
  cycleStrain: number | null;
  cycleKilojoule: number | null;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  stepCount: number | null;
  workouts: WhoopWorkout[];
  syncedAt: string;
}

export interface PostExertionalResponse {
  exposureDate: string;
  worseningTiming: "No" | "Immediately" | "Several hours later" | "The following day" | "Unsure" | "";
  disproportionate: "No" | "Possibly" | "Yes" | "Unsure" | "";
  recoveryDuration: "Less than a few hours" | "Same day" | "1 day" | "2-3 days" | "4+ days" | "Not recovered yet" | "";
  notes: string;
  updatedAt: string;
}

class CapacityDatabase extends Dexie {
  entries!: Table<DailyEntry, string>;
  clusterDecisions!: Table<ClusterDecision, string>;
  postExertionalResponses!: Table<PostExertionalResponse, string>;
  capacityPractices!: Table<CapacityPracticeEntry, string>;
  capacityReviews!: Table<CapacityWeeklyReview, string>;
  whoopDays!: Table<WhoopDay, string>;

  constructor() {
    super("capacity-tracker");
    this.version(1).stores({
      entries: "date, updatedAt"
    });
    this.version(2).stores({
      entries: "date, updatedAt",
      clusterDecisions: "id, status, startDate, endDate, updatedAt"
    });
    this.version(3).stores({
      entries: "date, updatedAt",
      clusterDecisions: "id, status, startDate, endDate, updatedAt",
      postExertionalResponses: "exposureDate, updatedAt"
    });
    this.version(4).stores({
      entries: "date, updatedAt",
      clusterDecisions: "id, status, startDate, endDate, updatedAt",
      postExertionalResponses: "exposureDate, updatedAt",
      capacityPractices: "date, updatedAt",
      capacityReviews: "weekStart, updatedAt"
    });
    this.version(5).stores({
      entries: "date, updatedAt",
      clusterDecisions: "id, status, startDate, endDate, updatedAt",
      postExertionalResponses: "exposureDate, updatedAt",
      capacityPractices: "date, updatedAt",
      capacityReviews: "weekStart, updatedAt",
      whoopDays: "date, syncedAt"
    });
  }
}

export const db = new CapacityDatabase();

export async function saveEntry(entry: DailyEntry): Promise<void> {
  await db.entries.put({ ...entry, updatedAt: new Date().toISOString() });
  schedulePersonalOsCloudSync();
}

export async function getEntry(date: string): Promise<DailyEntry | undefined> {
  return db.entries.get(date);
}

export async function getAllEntries(): Promise<DailyEntry[]> {
  return db.entries.orderBy("date").toArray();
}

export async function importEntries(entries: DailyEntry[]): Promise<void> {
  await db.transaction("rw", db.entries, async () => {
    await db.entries.bulkPut(entries);
  });
}

export async function getClusterDecisions(): Promise<ClusterDecision[]> {
  return db.clusterDecisions.toArray();
}

export async function saveClusterDecision(decision: ClusterDecision): Promise<void> {
  await db.clusterDecisions.put(decision);
  schedulePersonalOsCloudSync();
}

export async function importClusterDecisions(decisions: ClusterDecision[]): Promise<void> {
  await db.clusterDecisions.bulkPut(decisions);
}

export async function getPostExertionalResponses(): Promise<PostExertionalResponse[]> {
  return db.postExertionalResponses.orderBy("exposureDate").toArray();
}

export async function savePostExertionalResponse(response: PostExertionalResponse): Promise<void> {
  await db.postExertionalResponses.put({ ...response, updatedAt: new Date().toISOString() });
  schedulePersonalOsCloudSync();
}


export async function getCapacityPractice(date: string): Promise<CapacityPracticeEntry | undefined> {
  return db.capacityPractices.get(date);
}

export async function saveCapacityPractice(entry: CapacityPracticeEntry): Promise<void> {
  await db.capacityPractices.put({ ...entry, updatedAt: new Date().toISOString() });
  schedulePersonalOsCloudSync();
}

export async function getCapacityPractices(): Promise<CapacityPracticeEntry[]> {
  return db.capacityPractices.orderBy("date").toArray();
}

export async function importCapacityPractices(entries: CapacityPracticeEntry[]): Promise<void> {
  await db.capacityPractices.bulkPut(entries);
}

export async function getCapacityReview(weekStart: string): Promise<CapacityWeeklyReview | undefined> {
  return db.capacityReviews.get(weekStart);
}

export async function saveCapacityReview(review: CapacityWeeklyReview): Promise<void> {
  await db.capacityReviews.put({ ...review, updatedAt: new Date().toISOString() });
  schedulePersonalOsCloudSync();
}

export async function getCapacityReviews(): Promise<CapacityWeeklyReview[]> {
  return db.capacityReviews.orderBy("weekStart").toArray();
}

export async function importCapacityReviews(reviews: CapacityWeeklyReview[]): Promise<void> {
  await db.capacityReviews.bulkPut(reviews);
}


export async function saveWhoopDays(records: Array<Omit<WhoopDay, "syncedAt"> | WhoopDay>): Promise<void> {
  const syncedAt = new Date().toISOString();
  await db.whoopDays.bulkPut(records.map((record) => ({ ...record, syncedAt })));
  schedulePersonalOsCloudSync();
}

export async function getWhoopDay(date: string): Promise<WhoopDay | undefined> {
  return db.whoopDays.get(date);
}

export async function getWhoopDays(): Promise<WhoopDay[]> {
  return db.whoopDays.orderBy("date").toArray();
}

export async function clearWhoopDays(): Promise<void> {
  await db.whoopDays.clear();
}


const PERSONAL_OS_BRIDGE = "https://capacity-tracker.kaliharmen.workers.dev";
const WHOOP_SESSION_KEY = "personal-os-whoop-session";
const CLOUD_SYNC_ENABLED_KEY = "personal-os-chatgpt-sync-enabled";
let personalOsSyncTimer = 0;

export function isPersonalOsCloudSyncEnabled(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(CLOUD_SYNC_ENABLED_KEY) === "true";
}

export function setPersonalOsCloudSyncEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) localStorage.setItem(CLOUD_SYNC_ENABLED_KEY, "true");
  else localStorage.removeItem(CLOUD_SYNC_ENABLED_KEY);
}

export function schedulePersonalOsCloudSync(delay = 900): void {
  if (typeof window === "undefined" || !isPersonalOsCloudSyncEnabled()) return;
  window.clearTimeout(personalOsSyncTimer);
  personalOsSyncTimer = window.setTimeout(() => {
    void syncPersonalOsCloudMirror();
  }, delay);
}

export async function syncPersonalOsCloudMirror(): Promise<{
  ok: boolean;
  syncedAt?: string;
  recordCount?: number;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  error?: string;
}> {
  if (typeof window === "undefined" || !isPersonalOsCloudSyncEnabled()) {
    return { ok: false, error: "Cloud sync is not enabled." };
  }

  const session = localStorage.getItem(WHOOP_SESSION_KEY);
  if (!session) return { ok: false, error: "WHOOP connection is required to authorise Personal OS cloud sync." };

  const [entries, capacityPractices, whoopDays, weeklyReviews, postExertionalResponses, clusterDecisions] = await Promise.all([
    db.entries.orderBy("date").toArray(),
    db.capacityPractices.orderBy("date").toArray(),
    db.whoopDays.orderBy("date").toArray(),
    db.capacityReviews.orderBy("weekStart").toArray(),
    db.postExertionalResponses.orderBy("exposureDate").toArray(),
    db.clusterDecisions.toArray()
  ]);

  const allDates = new Set<string>();
  entries.forEach((entry) => allDates.add(entry.date));
  capacityPractices.forEach((entry) => allDates.add(entry.date));
  whoopDays.forEach((entry) => allDates.add(entry.date));

  const dates = [...allDates].sort().slice(-180);
  const dailyByDate = new Map(entries.map((entry) => [entry.date, entry]));
  const capacityByDate = new Map(capacityPractices.map((entry) => [entry.date, entry]));
  const whoopByDate = new Map(whoopDays.map((entry) => [entry.date, entry]));

  const records = dates.map((date) => ({
    date,
    daily: dailyByDate.get(date) ?? null,
    capacity: capacityByDate.get(date) ?? null,
    whoop: whoopByDate.get(date) ?? null
  }));

  try {
    const response = await fetch(`${PERSONAL_OS_BRIDGE}/api/personal-os/sync`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${session}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records,
        weeklyReviews,
        postExertionalResponses,
        clusterDecisions
      })
    });
    const payload = await response.json();
    if (!response.ok) return { ok: false, error: payload?.error || "Personal OS cloud sync failed." };
    return { ok: true, ...payload };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Personal OS cloud sync failed." };
  }
}
