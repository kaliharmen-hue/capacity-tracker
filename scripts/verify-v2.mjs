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
  const recoveredSession = 'a'.repeat(64);
  let recoveredSessionSeen = false;
  await page.route('https://capacity-tracker.kaliharmen.workers.dev/api/whoop-connection/connect', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ session: recoveredSession })
  }));
  await page.route('https://capacity-tracker.kaliharmen.workers.dev/api/meal-photos/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.headers().authorization === 'Bearer ' + recoveredSession) recoveredSessionSeen = true;
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
  await page.locator('#v2-meal-list [role="alert"]').filter({ hasText: 'Photo connection needs renewing' }).waitFor();
  await page.reload();
  await page.locator('#v2-meal-list [role="alert"]').filter({ hasText: 'Photo connection needs renewing' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Retry upload', exact: true }).count(), 1, 'Auth failure must keep the local photo and retry');
  uploadError = undefined;
  await page.getByRole('button', { name: 'Retry upload', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#v2-meal-list img').length === 2 && ![...document.querySelectorAll('button')].some(b => b.textContent === 'Retry upload'));
  assert.equal([...values.keys()].filter(key => key.startsWith('photo:')).length, 2, 'Recovered upload should save exactly once');
  const recoveredRead = page.waitForResponse(response => response.url().includes('/api/meal-photos/list') && response.request().headers().authorization === 'Bearer ' + recoveredSession);
  await page.locator('#v2-phone-connection').evaluate(element => { element.open = true; });
  await page.locator('#v2-phone-code').fill('12345678-12345678-12345678-12345678');
  await page.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem('personal-os-whoop-session') === 'a'.repeat(64));
  await page.locator('#v2-food-status').filter({ hasText: 'Phone connection is ready' }).waitFor();
  assert.equal(await page.locator('#v2-phone-code').inputValue(), '', 'Temporary code must be cleared after connecting');
  await recoveredRead;
  assert(recoveredSessionSeen, 'Home-screen app must use its own recovered connection for private photo access');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'qa/v2-desktop.png' });
  await page.route('https://capacity-tracker.kaliharmen.workers.dev/**', route => route.fulfill({
    status: route.request().url().endsWith('/api/whoop-connection/code') ? 200 : 401,
    contentType: 'application/json', body: JSON.stringify({ code: 'b'.repeat(32), error: 'Synthetic connection test' })
  }));
  await page.goto(origin + '/capacity/');
  await page.getByRole('button', { name: 'Reconnect WHOOP', exact: true }).waitFor();
  await page.getByText('Connect my home-screen app', { exact: true }).click();
  await page.getByRole('button', { name: 'Create connection code', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#whoop-phone-code').value === 'b'.repeat(32));
  assert.equal(await page.getByRole('button', { name: 'Copy connection code', exact: true }).isVisible(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#whoop-phone-code').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'qa/phone-connection-code.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  const capacityDate = await page.locator('#capacity-date').inputValue();
  await page.route('https://capacity-tracker.kaliharmen.workers.dev/api/whoop?days=*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ records: [{
      date: capacityDate, recoveryScore: 80, sleepHours: 7.5,
      remSleepMinutes: 90, deepSleepMinutes: 80, awakeMinutes: 0, sleepDebtMinutes: 40
    }] })
  }));
  await page.getByRole('button', { name: 'Sync 30 days', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#whoop-day-summary')?.textContent.includes('REM sleep'));
  for (const [label, duration] of [['REM sleep', '1 h 30 min'], ['Deep sleep', '1 h 20 min'], ['Awake during sleep', '0 h 0 min'], ['Sleep debt before sleep', '0 h 40 min']]) {
    assert.equal(await page.locator('#whoop-day-summary div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd').textContent(), duration);
  }
  await page.locator('#whoop-day-summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'qa/whoop-sleep-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#whoop-day-summary').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'qa/whoop-sleep-desktop.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.locator('#capacity-notes').fill('Reconnect must preserve this pending edit');
  await page.getByRole('button', { name: 'Reconnect WHOOP', exact: true }).click();
  await page.waitForURL('https://capacity-tracker.kaliharmen.workers.dev/oauth/start');
  await page.goto(origin + '/fixture');
  const capacitySaved = await page.evaluate(async date => {
    const db = await new Promise(resolve => { const request = indexedDB.open('capacity-tracker'); request.onsuccess = () => resolve(request.result); });
    const record = await new Promise(resolve => { const request = db.transaction('capacityPractices').objectStore('capacityPractices').get(date); request.onsuccess = () => resolve(request.result); });
    db.close(); return record;
  }, capacityDate);
  assert.equal(capacitySaved.notes, 'Reconnect must preserve this pending edit');
  console.log('PASS: history/WHOOP preserved; autosave and JPEG retries pass; temporary phone connection is applied; code controls render without errors.');
} finally { await browser.close(); server.close(); }
