export type WhoopRecordType = "sleep" | "recovery" | "cycle" | "workout";

export interface WhoopRecord {
  recordKey: string;
  recordType: WhoopRecordType;
  date: string;
  start: string;
  end: string;
  scoreState: string;
  source: "whoop-api";
  syncedAt: string;
  metrics: Record<string, number | string | boolean | null>;
}

export function whoopRecordDate(start: string, end = start): string {
  const value = end || start;
  return value ? value.slice(0, 10) : "";
}

export function normaliseWhoopRecord(record: WhoopRecord): WhoopRecord {
  return {
    ...record,
    source: "whoop-api",
    date: record.date || whoopRecordDate(record.start, record.end),
    metrics: { ...record.metrics }
  };
}

