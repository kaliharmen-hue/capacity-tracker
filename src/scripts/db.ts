import Dexie, { type Table } from "dexie";
import type { DailyEntry } from "./schema";

class CapacityDatabase extends Dexie {
  entries!: Table<DailyEntry, string>;

  constructor() {
    super("capacity-tracker");
    this.version(1).stores({
      entries: "date, updatedAt"
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
