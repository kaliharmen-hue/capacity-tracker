import Dexie, { type Table } from "dexie";
import type { DailyEntry } from "./schema";
import type { ClusterDecision } from "./timeline-model";

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
