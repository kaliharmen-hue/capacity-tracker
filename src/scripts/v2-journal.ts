export class DraftJournal<T> {
  private staged = new Map<string, string>();
  private tail = Promise.resolve();
  private storage: Pick<Storage, "getItem" | "setItem" | "removeItem" | "length" | "key">;
  private save: (entry: T) => Promise<void>;
  private prefix: string;
  private keyOf: (entry: T) => string;
  constructor(
    storage: DraftJournal<T>["storage"],
    save: (entry: T) => Promise<void>,
    prefix: string,
    keyOf: (entry: T) => string
  ) {
    this.storage = storage;
    this.save = save;
    this.prefix = prefix;
    this.keyOf = keyOf;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) {
        const value = storage.getItem(key);
        if (value) this.staged.set(key.slice(prefix.length), value);
      }
    }
  }
  stage(entry: T) {
    const value = JSON.stringify(entry);
    const key = this.keyOf(entry);
    this.staged.set(key, value);
    this.storage.setItem(this.prefix + key, value);
  }
  read(date: string): T | undefined {
    try { const value = this.staged.get(date); return value ? JSON.parse(value) : undefined; } catch { return undefined; }
  }
  hasPending() { return this.staged.size > 0; }
  flush(): Promise<void> {
    const work = this.tail.catch(() => {}).then(async () => {
      for (const [date, snapshot] of this.staged) {
        await this.save(JSON.parse(snapshot));
        if (this.staged.get(date) === snapshot) {
          this.staged.delete(date);
          this.storage.removeItem(this.prefix + date);
        }
      }
    });
    this.tail = work;
    return work;
  }
}
