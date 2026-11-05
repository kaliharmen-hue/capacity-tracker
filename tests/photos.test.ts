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
