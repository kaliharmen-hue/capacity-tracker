const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
const populated = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
function hasAnswers(record) {
  const defaults = { energyScore: 5, clarityScore: 5, sleepHours: 0, coffees: 0, amfexaDose: '15' };
  return object(record) && Object.entries(record).some(([key, value]) => !['date', 'updatedAt', 'syncedAt', 'id', 'weekStart', 'exposureDate'].includes(key) && value !== false && !(Object.hasOwn(defaults, key) && defaults[key] === value) && populated(value));
}
// Missing/null/empty fields are not deletion instructions. Zero and false are
// recorded answers. A newer populated field may update an older populated field.
export function mergeEntry(existing, incoming) {
  if (!object(incoming)) return existing ?? null;
  if (!object(existing)) return incoming;
  if (hasAnswers(existing) && !hasAnswers(incoming)) return existing;
  const oldTime = Date.parse(existing.updatedAt || existing.syncedAt || '') || 0;
  const newTime = Date.parse(incoming.updatedAt || incoming.syncedAt || '') || 0;
  const preferIncoming = newTime > oldTime;
  const result = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    if (populated(value) && (!populated(result[key]) || preferIncoming)) result[key] = value;
  }
  return result;
}
export function mirrorCounts(records = []) {
  return { days: records.length, daily: records.filter(r => object(r.daily)).length, capacity: records.filter(r => object(r.capacity)).length, whoop: records.filter(r => object(r.whoop)).length, dailyBlank: records.filter(r => object(r.daily) && !hasAnswers(r.daily)).length, dailyMissing: records.filter(r => !object(r.daily)).length };
}
export function validateUpload(payload) {
  if (!object(payload) || !Array.isArray(payload.records)) throw new Error('records must be an array; no data was changed.');
  if (payload.records.length > 180) throw new Error('Upload at most 180 days per batch.');
  const seen = new Set();
  for (const row of payload.records) {
    if (!object(row) || !validDate(row.date) || seen.has(row.date)) throw new Error('Each record needs a unique valid YYYY-MM-DD date.');
    seen.add(row.date);
    for (const field of ['daily', 'capacity', 'whoop']) {
      const entry = row[field];
      if (entry !== undefined && entry !== null && (!object(entry) || entry.date !== row.date)) throw new Error('Joined record dates must match.');
    }
  }
  for (const [field, key] of [['weeklyReviews', 'weekStart'], ['postExertionalResponses', 'exposureDate'], ['clusterDecisions', 'id']]) {
    if (payload[field] !== undefined && (!Array.isArray(payload[field]) || payload[field].some(r => !object(r) || typeof r[key] !== 'string' || !r[key]))) throw new Error('Invalid '+field+' collection.');
  }
}
function mergeCollection(old = [], incoming = [], key) {
  const rows = new Map(old.map(row => [row[key], row]));
  for (const row of incoming) rows.set(row[key], mergeEntry(rows.get(row[key]), row));
  return [...rows.values()].sort((a, b) => a[key].localeCompare(b[key]));
}
export function mergeMirror(previous, payload, now = new Date().toISOString()) {
  validateUpload(payload);
  const rows = new Map((previous?.records || []).map(row => [row.date, row]));
  for (const row of payload.records) {
    const old = rows.get(row.date) || {};
    rows.set(row.date, { date: row.date, daily: mergeEntry(old.daily, row.daily), capacity: mergeEntry(old.capacity, row.capacity), whoop: mergeEntry(old.whoop, row.whoop) });
  }
  const records = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  const counts = mirrorCounts(records);
  return { version: 2, syncedAt: now, rangeStart: records[0]?.date ?? null, rangeEnd: records.at(-1)?.date ?? null, records,
    weeklyReviews: mergeCollection(previous?.weeklyReviews, payload.weeklyReviews, 'weekStart'),
    postExertionalResponses: mergeCollection(previous?.postExertionalResponses, payload.postExertionalResponses, 'exposureDate'),
    clusterDecisions: mergeCollection(previous?.clusterDecisions, payload.clusterDecisions, 'id'),
    counts, lastSync: { uploaded: mirrorCounts(payload.records), stored: counts, source: { browserId: typeof payload.client?.id === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(payload.client.id) ? payload.client.id : null, database: 'capacity-tracker', origin: payload.client?.origin === 'https://kaliharmen-hue.github.io' ? payload.client.origin : null }, preservedDaily: records.filter(row => row.daily && !payload.records.some(r => r.date === row.date && r.daily)).length }
  };
}
