export interface MirrorCounts { days: number; daily: number; capacity: number; whoop: number }
type Dated = { date: string };
export function buildMirrorBatches(entries: Dated[], capacity: Dated[], whoop: Dated[]) {
  const dailyByDate = new Map(entries.map(row => [row.date, row]));
  const capacityByDate = new Map(capacity.map(row => [row.date, row]));
  const whoopByDate = new Map(whoop.map(row => [row.date, row]));
  const dates = [...new Set([...dailyByDate.keys(), ...capacityByDate.keys(), ...whoopByDate.keys()])].sort();
  // 180 is a request-size limit, not a retention policy. Send older dates too.
  const records = dates.map(date => ({ date, daily: dailyByDate.get(date) ?? null, capacity: capacityByDate.get(date) ?? null, whoop: whoopByDate.get(date) ?? null }));
  const batches = [];
  for (let i = 0; i < records.length; i += 180) batches.push(records.slice(i, i + 180));
  if (!batches.length) batches.push([]);
  return { batches, counts: { days: dates.length, daily: entries.length, capacity: capacity.length, whoop: whoop.length } };
}
export function formatMirrorSync(result: { ok: boolean; error?: string; localCounts?: MirrorCounts; uploadedCounts?: MirrorCounts; counts?: MirrorCounts; recordCount?: number; clientId?: string }): string {
  const list = (c: MirrorCounts) => `${c.daily} Daily Log, ${c.capacity} Capacity, ${c.whoop} WHOOP`;
  if (!result.ok) return `Cloud sync needs retrying: ${result.error || 'unknown error'}. Existing cloud records are preserved.`;
  const local = result.localCounts, uploaded = result.uploadedCounts, stored = result.counts;
  return `${result.clientId ? 'Browser '+result.clientId.slice(0,8)+'. ' : ''}${local ? 'Local: '+list(local)+'. ' : ''}${uploaded ? 'Uploaded: '+list(uploaded)+'. ' : ''}Cloud: ${stored ? list(stored) : (result.recordCount ?? 0)+' days'}. ${local?.daily === 0 ? 'No Daily Log entries are stored in this browser. Sync from the browser where your answers are visible. ' : ''}Missing fields do not erase cloud answers.`;
}
