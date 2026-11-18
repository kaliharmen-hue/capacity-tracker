import test from 'node:test';
import assert from 'node:assert/strict';
import { PhotoLibraryStorage, GRACE_MS, STORAGE_LIMIT } from '../integrations/whoop-worker/src/photos.js';
import worker from '../integrations/whoop-worker/src/index.js';
import { DraftJournal } from '../src/scripts/v2-journal.ts';
import { createEmptyV2Entry } from '../src/scripts/v2-schema.ts';
import { mergeMirror } from '../integrations/whoop-worker/src/mirror-merge.js';

function fixture() {
  const values = new Map();
  const objects = { get size() { return [...values.keys()].filter(k => k.startsWith('image:')).length; } };
  const storage = { get: async k => structuredClone(values.get(k)), put: async (k, v) => { values.set(k, structuredClone(v)); }, delete: async k => values.delete(k), list: async ({ prefix }) => new Map([...values].filter(([key]) => key.startsWith(prefix))), transaction: async fn => fn(storage) };
  const state = { storage };
  const env = {};
  const library = new PhotoLibraryStorage(state, env);
  const call = (path, body?) => library.fetch(new Request('https://test' + path, body ? { method: 'POST', body: JSON.stringify(body) } : {}));
  return { values, objects, call };
}
const photo = (id = '12345678-1234-1234-1234-123456789012') => ({ id, date: '2026-11-04', time: '12:30', note: 'Synthetic meal', image: 'data:image/jpeg;base64,/9j/2Q==', consent: true });

test('private photos reject anonymous and non-owner access before touching storage', async () => {
  const env = { WHOOP_AUTH: { get: async () => null }, APP_ORIGIN: 'https://example.com', PUBLIC_BASE_URL: 'https://bridge.example' };
  const response = await worker.fetch(new Request('https://bridge.example/api/meal-photos/list'), env);
  assert.equal(response.status, 401);
});

test('photo mutations require the owner session, the app origin and POST; read-only readers cannot mutate', async () => {
  let calls = 0;
  const env = {
    WHOOP_AUTH: { get: async key => key === 'owner-session' ? 'owner' : key === 'session:owner' || key === 'session:other' ? {} : null },
    APP_ORIGIN: 'https://tracker.example/app/', PUBLIC_BASE_URL: 'https://bridge.example',
    PHOTO_LIBRARY: { idFromName: () => 'owner-meal-photos', get: () => ({ fetch: async () => { calls++; return Response.json({ ok: true }); } }) }
  };
  for (const path of ['update', 'remove']) {
    const request = (token, origin = 'https://tracker.example', method = 'POST') => new Request('https://bridge.example/api/meal-photos/' + path, { method, headers: { Authorization: 'Bearer ' + token, Origin: origin }, ...(method === 'POST' ? { body: JSON.stringify({ id: photo().id, time: '09:15', note: 'Correction' }) } : {}) });
    for (const token of ['', 'other', 'read-only-reader']) assert.equal((await worker.fetch(request(token), env)).status, 401);
    assert.equal((await worker.fetch(request('owner', 'https://untrusted.example'), env)).status, 403);
    assert.equal((await worker.fetch(request('owner', 'https://tracker.example', 'GET'), env)).status, 405);
    assert.equal(calls, path === 'update' ? 0 : 1);
    assert.equal((await worker.fetch(request('owner'), env)).status, 200);
  }
  assert.equal(calls, 2);
});

test('editing time or note preserves the image and other photos, and invalidates old review receipts', async () => {
  const f = fixture();
  const first = photo(), other = photo('22222222-2222-4222-8222-222222222222');
  await f.call('/upload', first); await f.call('/upload', other);
  await f.call('/image?id=' + first.id + '&review=true');
  await f.call('/receipt', { photo_ids: [first.id], review_reference: 'Earlier review' });
  const original = structuredClone(f.values.get('image:' + first.id));
  const result = await f.call('/update', { id: first.id, time: '08:45', note: 'Corrected breakfast' });
  assert.equal(result.status, 200);
  const updated = await result.json();
  assert.equal(updated.time, '08:45'); assert.equal(updated.note, 'Corrected breakfast');
  assert.equal(updated.date, first.date); assert.equal(updated.reviewedAt, null); assert.equal(updated.retrievedAt, null); assert.equal(updated.reviewReference, null);
  assert.deepEqual(f.values.get('image:' + first.id), original);
  assert.equal(f.values.get('photo:' + other.id).time, other.time);
  assert.equal((await f.call('/receipt', { photo_ids: [first.id], review_reference: 'Stale review' })).status, 400);
  for (const details of [{ time: '25:00', note: '' }, { time: '', note: 'x'.repeat(2001) }, { time: null, note: '' }]) assert.equal((await f.call('/update', { id: first.id, ...details })).status, 400);
  assert.equal((await f.call('/update', { id: other.id, time: '', note: '' })).status, 200);
  assert.equal((await f.call('/update', { id: '33333333-3333-4333-8333-333333333333', time: '', note: '' })).status, 404);
});

test('manual removal excludes the duplicate from reads, releases bytes, and cannot be undone by a late upload', async () => {
  const f = fixture(); const first = photo(), other = photo('22222222-2222-4222-8222-222222222222');
  await f.call('/upload', first); await f.call('/upload', other);
  const before = await (await f.call('/list')).json();
  assert.equal((await f.call('/remove', { id: first.id })).status, 200);
  assert.equal((await f.call('/remove', { id: first.id })).status, 200, 'Delete retries are idempotent');
  const after = await (await f.call('/list')).json();
  assert.deepEqual(after.photos.map(p => p.id), [other.id]);
  assert(after.bytesUsed < before.bytesUsed); assert.equal(f.objects.size, 1);
  assert.deepEqual(f.values.get('photo:' + first.id), { id: first.id, state: 'removed' }, 'No meal details remain in the tombstone');
  assert.equal((await f.call('/image?id=' + first.id)).status, 404);
  assert.equal((await f.call('/upload', first)).status, 409);
  assert.equal((await f.call('/update', { id: first.id, time: '', note: '' })).status, 404);
  assert.equal((await f.call('/receipt', { photo_ids: [first.id], review_reference: 'Old review' })).status, 400);
  const delayed = photo('33333333-3333-4333-8333-333333333333');
  await f.call('/remove', { id: delayed.id });
  assert.equal((await f.call('/upload', delayed)).status, 409, 'Deleting an uncertain pending upload prevents late restoration');
});
test('uploads are idempotent, metadata survives cleanup, and pending review never means reviewed', async () => {
  const f = fixture();
  assert.equal((await f.call('/upload', photo())).status, 200);
  await f.call('/upload', photo());
  assert.equal(f.objects.size, 1);
  assert.equal((await (await f.call('/list')).json()).photos[0].reviewedAt, null);
  const premature = await f.call('/receipt', { photo_ids: [photo().id], review_reference: 'Saved test review' });
  assert.equal(premature.status, 400);
  await f.call('/image?id=' + photo().id + '&review=true');
  assert.equal((await f.call('/receipt', { photo_ids: [photo().id], review_reference: 'Saved test review' })).status, 200);
  await f.call('/settings', { enabled: true });
  await f.call('/cleanup');
  assert.equal(f.objects.size, 1, 'Grace period must elapse');
  const key = 'photo:' + photo().id;
  f.values.set(key, { ...f.values.get(key), reviewedAt: new Date(Date.now() - GRACE_MS - 1000).toISOString() });
  await f.call('/cleanup');
  assert.equal(f.objects.size, 0);
  const metadata = (await (await f.call('/list')).json()).photos[0];
  assert.equal(metadata.state, 'deleted'); assert.equal(metadata.note, 'Synthetic meal');
});
test('a full library blocks new uploads and preserves unreviewed photos', async () => {
  const f = fixture();
  f.values.set('photo:old', { id: 'old', state: 'available', bytes: STORAGE_LIMIT, key: 'old', createdAt: '2026-01-01', date: '2026-01-01', reviewedAt: null });
  await f.call('/settings', { enabled: true });
  assert.equal((await f.call('/upload', photo())).status, 409);
  assert.equal(f.values.get('photo:old').state, 'available');
});
test('unknown photos and duplicate IDs cannot acknowledge unrelated images', async () => {
  const f = fixture(); await f.call('/upload', photo()); await f.call('/image?id=' + photo().id + '&review=true');
  assert.equal((await f.call('/receipt', { photo_ids: [photo().id, 'missing'], review_reference: 'Test' })).status, 400);
  assert.equal(f.values.get('photo:' + photo().id).reviewedAt, null);
});
function local() {
  const map = new Map<string, string>();
  return { get length() { return map.size; }, key: (i: number) => [...map.keys()][i] ?? null, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
}
test('date changes and a new edit during an in-flight save cannot erase newer recovery drafts', async () => {
  const storage = local(); let release!: () => void;
  const saved: any[] = [];
  const journal = new DraftJournal(storage, async (entry: ReturnType<typeof createEmptyV2Entry>) => { saved.push(entry); if (saved.length === 1) await new Promise<void>(resolve => { release = resolve; }); }, "pos-v2-draft:", entry => entry.date);
  const first = { ...createEmptyV2Entry('2026-11-04'), notes: 'First' };
  journal.stage(first); const work = journal.flush();
  await new Promise(resolve => setTimeout(resolve, 0));
  journal.stage({ ...first, notes: 'Newer edit' });
  journal.stage({ ...first, date: '2026-11-05', notes: 'Other day' });
  release(); await work;
  assert.equal(journal.read(first.date)?.notes, 'Newer edit');
  await journal.flush();
  assert.equal(saved.at(-1).notes, 'Newer edit');
  assert.equal(journal.hasPending(), false);
});
test('failed saves survive a page restart and untouched journals write nothing', async () => {
  const storage = local(); let saves = 0;
  const broken = new DraftJournal<ReturnType<typeof createEmptyV2Entry>>(storage, async () => { throw new Error('Offline storage failure'); }, "pos-v2-draft:", entry => entry.date);
  broken.stage(createEmptyV2Entry('2026-11-04'));
  await assert.rejects(broken.flush());
  const restarted = new DraftJournal<ReturnType<typeof createEmptyV2Entry>>(storage, async () => { saves++; }, "pos-v2-draft:", entry => entry.date);
  await restarted.flush(); assert.equal(saves, 1);
  await restarted.flush(); assert.equal(saves, 1);
});
test('V2 cloud sync retains zeroes and intentional blank edits without modifying historical records', () => {
  const row = { ...createEmptyV2Entry('2026-11-04'), physicalFatigue: 0, notes: 'Before', updatedAt: '2026-11-04T10:00:00Z' };
  const mirror = mergeMirror(null, { records: [], v2Entries: [row] });
  const changed = mergeMirror(mirror, { records: [], v2Entries: [{ ...row, notes: '', updatedAt: '2026-11-04T11:00:00Z' }] });
  assert.equal(changed.v2Entries[0].physicalFatigue, 0); assert.equal(changed.v2Entries[0].notes, '');
  assert.deepEqual(changed.records, []);
});

test('autosaved protocol duration survives mirror sync without declaring unchecked sessions missed', () => {
  const row = {...createEmptyV2Entry('2026-11-11'), bioLightFullSpectrum: true, bioLightDurationMinutes: 20 as const, updatedAt: '2026-11-11T10:00:00Z'};
  const mirror = mergeMirror(null, {records: [], v2Entries: [row]});
  assert.equal(mirror.v2Entries[0].bioLightDurationMinutes, 20);
  assert.equal(mirror.v2Entries[0].entryStatus, 'draft');
  assert.equal(mirror.v2Entries[0].vagustimEvening, false);
});
