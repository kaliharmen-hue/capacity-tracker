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
  }
}

export const db = new CapacityDatabase();

export async function saveEntry(entry: DailyEntry): Promise<void> {
  await db.entries.put({ ...entry, updatedAt: new Date().toISOString() });
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
}

export async function importClusterDecisions(decisions: ClusterDecision[]): Promise<void> {
  await db.clusterDecisions.bulkPut(decisions);
}

export async function getPostExertionalResponses(): Promise<PostExertionalResponse[]> {
  return db.postExertionalResponses.orderBy("exposureDate").toArray();
}

export async function savePostExertionalResponse(response: PostExertionalResponse): Promise<void> {
  await db.postExertionalResponses.put({ ...response, updatedAt: new Date().toISOString() });
}


export async function getCapacityPractice(date: string): Promise<CapacityPracticeEntry | undefined> {
  return db.capacityPractices.get(date);
}

export async function saveCapacityPractice(entry: CapacityPracticeEntry): Promise<void> {
  await db.capacityPractices.put({ ...entry, updatedAt: new Date().toISOString() });
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
}

export async function getCapacityReviews(): Promise<CapacityWeeklyReview[]> {
  return db.capacityReviews.orderBy("weekStart").toArray();
}

export async function importCapacityReviews(reviews: CapacityWeeklyReview[]): Promise<void> {
  await db.capacityReviews.bulkPut(reviews);
}
