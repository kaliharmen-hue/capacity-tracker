import Dexie, { type Table } from "dexie";
import type { DailyEntry } from "./schema";
import type { ClusterDecision } from "./timeline-model";
import type { V2DailyEntry } from "./v2-schema";
import type { WhoopRecord } from "./whoop-schema";

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
  v2Entries!: Table<V2DailyEntry, string>;
  whoopRecords!: Table<WhoopRecord, string>;

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
      v2Entries: "date, updatedAt"
    });
    this.version(5).stores({
      entries: "date, updatedAt",
      clusterDecisions: "id, status, startDate, endDate, updatedAt",
      postExertionalResponses: "exposureDate, updatedAt",
      v2Entries: "date, updatedAt",
      whoopRecords: "recordKey, recordType, date, start, syncedAt"
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

export async function saveV2Entry(entry: V2DailyEntry): Promise<void> {
  await db.v2Entries.put({ ...entry, schemaVersion: 1, updatedAt: new Date().toISOString() });
}

export async function getV2Entry(date: string): Promise<V2DailyEntry | undefined> {
  return db.v2Entries.get(date);
}

export async function getAllV2Entries(): Promise<V2DailyEntry[]> {
  return db.v2Entries.orderBy("date").toArray();
}

export async function importV2Entries(entries: V2DailyEntry[]): Promise<void> {
  await db.transaction("rw", db.v2Entries, async () => {
    await db.v2Entries.bulkPut(entries.map((entry) => ({ ...entry, schemaVersion: 1 })));
  });
}

export async function getAllWhoopRecords(): Promise<WhoopRecord[]> {
  return db.whoopRecords.orderBy("start").toArray();
}

export async function importWhoopRecords(records: WhoopRecord[]): Promise<void> {
  await db.transaction("rw", db.whoopRecords, async () => {
    await db.whoopRecords.bulkPut(records);
  });
}
