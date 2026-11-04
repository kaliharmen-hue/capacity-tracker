import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { PhotoLibraryStorage } from '../integrations/whoop-worker/src/photos.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/kalih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = join(process.cwd(), 'dist');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://test').pathname;
  if (path === '/fixture') { res.end('<!doctype html><title>Test setup</title>'); return; }
  try { const file = join(root, path.endsWith('/') ? path + 'index.html' : path); res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] || 'application/octet-stream'); res.end(await readFile(file)); }
  catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const values = new Map();
  const storage = { get: async k => structuredClone(values.get(k)), put: async (k, v) => { values.set(k, structuredClone(v)); }, delete: async k => values.delete(k), list: async ({ prefix }) => new Map([...values].filter(([key]) => key.startsWith(prefix))), transaction: async fn => fn(storage) };
  const library = new PhotoLibraryStorage({ storage }, {});
  let uploadError;
  await page.route('https://capacity-tracker.kaliharmen.workers.dev/api/meal-photos/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith('/upload') && uploadError) {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: uploadError }) }); return;
    }
    const response = await library.fetch(new Request('https://test' + (url.pathname.split('/api/meal-photos')[1] || '/list') + url.search, { method: request.method(), ...(request.postData() ? { body: request.postData() } : {}) }));
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.goto(origin + '/fixture');
  await page.evaluate(async () => {
    localStorage.setItem('personal-os-whoop-session', 'synthetic-test-session');
    await new Promise((resolve, reject) => {
      const r = indexedDB.open('capacity-tracker', 50);
      r.onupgradeneeded = () => {
        for (const [name, key] of [['entries', 'date'], ['clusterDecisions', 'id'], ['postExertionalResponses', 'exposureDate'], ['capacityPractices', 'date'], ['capacityReviews', 'weekStart'], ['whoopDays', 'date']]) {
          const store = r.result.createObjectStore(name, { keyPath: key });
          store.createIndex(key, key); store.createIndex(name === 'whoopDays' ? 'syncedAt' : 'updatedAt', name === 'whoopDays' ? 'syncedAt' : 'updatedAt');
          if (name === 'entries') store.put({ date: '2026-10-01', energyScore: 7, notes: 'Historical synthetic record' });
          if (name === 'whoopDays') store.put({ date: '2026-10-01', recoveryScore: 80 });
        }
      };
      r.onsuccess = () => { r.result.close(); resolve(); }; r.onerror = reject;
    });
  });
  await page.goto(origin + '/v2/?date=2026-11-04');
  await page.locator('#v2-entry-form').evaluate(async f => { while (f.inert) await new Promise(r => setTimeout(r, 30)); });
  await page.locator('[name="notes"]').fill('Fast date-change draft');
  await page.locator('#v2-entry-date').fill('2026-11-05');
  await page.locator('#v2-entry-date').press('Tab');
  await page.waitForTimeout(700);
  const records = await page.evaluate(async () => {
    const db = await new Promise(resolve => { const r = indexedDB.open('capacity-tracker'); r.onsuccess = () => resolve(r.result); });
    const read = (table, key) => new Promise(resolve => { const r = db.transaction(table).objectStore(table).get(key); r.onsuccess = () => resolve(r.result); });
    return [await read('v2Entries', '2026-11-04'), await read('entries', '2026-10-01'), await read('whoopDays', '2026-10-01')];
  });
  assert.equal(records[0].notes, 'Fast date-change draft'); assert.equal(records[0].entryStatus, 'draft');
  assert.equal(records[1].energyScore, 7); assert.equal(records[2].recoveryScore, 80);
  const jpeg = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1800; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1800, 1200); x.fillStyle = '#3f6f63'; x.fillRect(200, 200, 1400, 800); x.fillStyle = '#fff'; x.font = '80px sans-serif'; x.fillText('Synthetic meal photo', 400, 600); return c.toDataURL('image/jpeg'); });
  assert.equal(await page.locator('#v2-food-image').getAttribute('capture'), null, 'Existing-photo picker must not request camera capture');
  const cameraPicker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take new photo', exact: true }).click();
  assert.equal(await (await cameraPicker).element().getAttribute('id'), 'v2-food-camera');
  const libraryPicker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose existing photo', exact: true }).click();
  const chooser = await libraryPicker;
  assert.equal(await chooser.element().getAttribute('id'), 'v2-food-image');
  await chooser.setFiles({ name: 'synthetic.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg.split(',')[1], 'base64') });
  assert.equal(await page.locator('#v2-food-selected').textContent(), 'synthetic.jpg');
  await page.locator('#v2-food-note').fill('Synthetic picture for testing');
  await page.locator('#v2-food-time').fill('12:30');
  await page.locator('#v2-food-consent').check();
  await page.locator('#v2-food-save').click();
  await page.locator('#v2-meal-list img').waitFor();
  const metadata = [...values].find(([key]) => key.startsWith('photo:'))[1];
  assert.equal(metadata.date, '2026-11-05'); assert.equal(metadata.note, 'Synthetic picture for testing'); assert.ok(metadata.bytes < 750000);
  await page.locator('#v2-food-section').scrollIntoViewIfNeeded();
  await mkdir('qa', { recursive: true });
  await page.screenshot({ path: 'qa/v2-mobile.png' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false); assert.deepEqual(errors, []);
  await page.reload(); await page.locator('#v2-meal-list img').waitFor();
  assert.equal(await page.locator('#v2-meal-list img').count(), 1);
  assert.equal(await page.locator('#v2-food-consent').isChecked(), true, 'Photo permission must survive reopening the page');
  await page.locator('#v2-food-consent').uncheck();
  await page.evaluate(async jpeg => {
    const db = await new Promise(resolve => { const r = indexedDB.open('capacity-tracker'); r.onsuccess = () => resolve(r.result); });
    const image = new Blob([Uint8Array.from(atob(jpeg.split(',')[1]), c => c.charCodeAt(0))], { type: 'image/jpeg' });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('mealPhotoDrafts', 'readwrite');
      tx.objectStore('mealPhotoDrafts').put({ id: '11111111-1111-4111-8111-111111111111', date: '2026-11-05', time: '', note: 'Pending consent test', image, createdAt: new Date().toISOString() });
      tx.oncomplete = resolve; tx.onerror = reject;
    }); db.close();
  }, jpeg);
  await page.reload(); await page.getByRole('button', { name: 'Retry upload', exact: true }).waitFor();
  assert.equal(await page.locator('#v2-food-consent').isChecked(), false, 'Withdrawing photo permission must also persist');
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click();
  await page.locator('#v2-meal-list [role="alert"]').filter({ hasText: 'Photo uploads are paused. Enable photo permission to upload.' }).waitFor();
  assert.equal([...values.keys()].filter(key => key.startsWith('photo:')).length, 1, 'Retry must not upload without permission');
  await page.locator('#v2-food-consent').check();
  uploadError = 'Connect the owner WHOOP account in Capacity Building first.';
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click();
  await page.locator('#v2-meal-list [role="alert"]').filter({ hasText: 'Reconnect WHOOP on this phone' }).waitFor();
  await page.reload();
  await page.locator('#v2-meal-list [role="alert"]').filter({ hasText: 'Reconnect WHOOP on this phone' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry upload', exact: true }).count(), 1, 'Auth failure must keep the local photo and retry');
  uploadError = undefined;
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#v2-meal-list img').length === 2 && ![...document.querySelectorAll('button')].some(b => b.textContent === 'Retry upload'));
  assert.equal([...values.keys()].filter(key => key.startsWith('photo:')).length, 2, 'Recovered upload should save exactly once');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'qa/v2-desktop.png' });
  console.log('PASS: v5 history/WHOOP preserved; draft survives fast date change; real JPEG compressed/uploaded/reloaded; phone and desktop render without errors.');
} finally { await browser.close(); server.close(); }
