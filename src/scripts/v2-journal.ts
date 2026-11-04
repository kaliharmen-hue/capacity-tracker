import type { V2DailyEntry } from "./v2-schema.ts";

export class DraftJournal {
  private staged = new Map<string, string>();
  private tail = Promise.resolve();
  private storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">;
  private save: (entry: V2DailyEntry) => Promise<void>;
  constructor(storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">, save: (entry: V2DailyEntry) => Promise<void>) {
    this.storage = storage;
    this.save = save;
    try {
      const legacy = storage.getItem('personal-operating-system-v2-pending-draft');
      if (legacy) { this.stage(JSON.parse(legacy)); storage.removeItem('personal-operating-system-v2-pending-draft'); }
    } catch { /* Preserve unreadable older drafts for manual recovery. */ }
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith("pos-v2-draft:")) {
        const value = storage.getItem(key);
        if (value) this.staged.set(key.slice("pos-v2-draft:".length), value);
      }
    }
  }
  stage(entry: V2DailyEntry) {
    const value = JSON.stringify(entry);
    this.staged.set(entry.date, value);
    this.storage.setItem("pos-v2-draft:" + entry.date, value);
  }
  read(date: string): V2DailyEntry | undefined {
    try { const value = this.staged.get(date); return value ? JSON.parse(value) : undefined; } catch { return undefined; }
  }
  hasPending() { return this.staged.size > 0; }
  flush(): Promise<void> {
    const work = this.tail.catch(() => {}).then(async () => {
      for (const [date, snapshot] of this.staged) {
        await this.save(JSON.parse(snapshot));
        if (this.staged.get(date) === snapshot) {
          this.staged.delete(date);
          this.storage.removeItem("pos-v2-draft:" + date);
        }
      }
    });
    this.tail = work;
    return work;
  }
}
