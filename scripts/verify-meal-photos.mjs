import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { PhotoLibraryStorage } from '../integrations/whoop-worker/src/photos.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/kalih/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://test').pathname;
  try {
    const file = join(process.cwd(), 'dist', path.endsWith('/') ? path + 'index.html' : path);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const values = new Map();
  const storage = { get: async k => structuredClone(values.get(k)), put: async (k, v) => { values.set(k, structuredClone(v)); }, delete: async k => values.delete(k), list: async ({ prefix }) => new Map([...values].filter(([key]) => key.startsWith(prefix))), transaction: async fn => fn(storage) };
  const library = new PhotoLibraryStorage({ storage }, {});
  let uploads = 0, failRemove = false, slowUpload = false, releaseUpload, loseNextUpload = false;
  const calls = [];
  await page.route('https://capacity-tracker.kaliharmen.workers.dev/**', route => route.fulfill({ status: 401, body: '{}' }));
  await page.route('https://capacity-tracker.kaliharmen.workers.dev/api/meal-photos/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.split('/api/meal-photos')[1];
    const body = req.postData(); calls.push({ path, body: body ? JSON.parse(body) : null });
    if (path === '/remove' && failRemove) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary connection failure. Please retry.' }) }); return; }
    const response = await library.fetch(new Request('https://photos.internal' + path + url.search, { method: req.method(), ...(body ? { body } : {}) }));
    if (path === '/upload') {
      uploads++;
      if (uploads === 2 || loseNextUpload) { loseNextUpload = false; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Upload response lost. Please retry.' }) }); return; }
      if (slowUpload) await new Promise(resolve => { releaseUpload = resolve; });
    }
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('personal-os-whoop-session', 'synthetic-owner');
    localStorage.setItem('personal-os-meal-photo-consent-v1', 'yes');
  });
  const date = '2026-11-17';
  await page.goto(origin + '/capacity/?date=' + date);
  await page.waitForFunction(() => !document.querySelector('#v2-check-in').inert && !document.querySelector('#capacity-date').disabled);
  const jpeg = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1600, 1200);
    ctx.fillStyle = '#3f6f63'; ctx.fillRect(200, 200, 1200, 800);
    ctx.fillStyle = '#fff'; ctx.font = '64px sans-serif'; ctx.fillText('Synthetic breakfast', 360, 620);
    return c.toDataURL('image/jpeg');
  });
  const file = name => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(jpeg.split(',')[1], 'base64') });
  await page.locator('#v2-food-image').setInputFiles([file('breakfast.jpg'), file('portion.jpg'), file('unwanted.jpg')]);
  assert.equal(await page.locator('#v2-food-preview img').count(), 3);
  await page.getByRole('button', { name: 'Remove selected photo: unwanted.jpg', exact: true }).click();
  await page.locator('#v2-food-camera').setInputFiles(file('ingredients.jpg'));
  assert.equal(await page.locator('#v2-food-preview img').count(), 3);
  await page.locator('#v2-food-time').fill('07:30');
  await page.locator('#v2-food-note').evaluate(el => { el.closest('details').open = true; });
  await page.locator('#v2-food-note').fill('Breakfast from three angles');
  await page.getByRole('button', { name: 'Save meal photos', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('#v2-food-save').disabled && document.querySelectorAll('#v2-meal-list img').length === 3);
  assert.equal(uploads, 3);
  const photos = [...values].filter(([key, p]) => key.startsWith('photo:') && p.state === 'available').map(([, p]) => p);
  assert.equal(photos.length, 3);
  assert(photos.every(p => p.date === date && p.time === '07:30' && p.note === 'Breakfast from three angles' && p.bytes < 750000));
  const pending = page.locator('.meal-card').filter({ hasText: 'Saved on this phone; upload pending' });
  await pending.getByRole('button', { name: 'Edit photo details', exact: true }).click();
  await pending.getByLabel('Meal time', { exact: true }).fill('08:45');
  await pending.getByLabel('Meal note', { exact: true }).fill('Corrected pending breakfast');
  await pending.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.locator('.meal-card').filter({ hasText: 'Corrected pending breakfast' }).getByRole('button', { name: 'Retry upload', exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(b => b.textContent === 'Retry upload'));
  assert.equal([...values].filter(([key, p]) => key.startsWith('photo:') && p.state === 'available').length, 3, 'Retry cannot duplicate a partial batch');
  const corrected = [...values.values()].find(p => p?.note === 'Corrected pending breakfast');
  assert.equal(corrected.time, '08:45');

  const first = page.locator('.meal-card').filter({ hasText: 'Breakfast from three angles' }).first();
  await first.getByRole('button', { name: 'Edit photo details', exact: true }).click();
  await first.getByLabel('Meal time', { exact: true }).fill('09:10');
  await first.getByLabel('Meal note', { exact: true }).fill('Corrected saved breakfast');
  await first.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.locator('.meal-card').filter({ hasText: 'Corrected saved breakfast' }).getByText('09:10', { exact: true }).waitFor();
  await page.reload();
  const savedCard = page.locator('.meal-card').filter({ hasText: 'Corrected saved breakfast' });
  await savedCard.getByText('09:10', { exact: true }).waitFor();
  await savedCard.getByRole('button', { name: 'Edit photo details', exact: true }).click();
  await savedCard.getByLabel('Meal time', { exact: true }).fill('10:00');
  await savedCard.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await savedCard.getByText('09:10', { exact: true }).count(), 1);
  page.once('dialog', dialog => dialog.dismiss());
  await savedCard.getByRole('button', { name: 'Delete photo', exact: true }).click();
  assert.equal(await page.locator('.meal-card').count(), 3);
  failRemove = true;
  page.once('dialog', dialog => dialog.accept());
  await savedCard.getByRole('button', { name: 'Delete photo', exact: true }).click();
  await savedCard.getByRole('alert').filter({ hasText: 'Temporary connection failure' }).waitFor();
  assert.equal(await page.locator('.meal-card').count(), 3, 'A failed delete must leave the photo visible');
  failRemove = false;
  page.once('dialog', dialog => dialog.accept());
  await savedCard.getByRole('button', { name: 'Delete photo', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.meal-card').length === 2);
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('#v2-meal-list img').length === 2);
  assert.equal([...values.values()].filter(p => p?.state === 'removed').length, 1);
  assert.equal([...values.values()].filter(p => p?.state === 'available').length, 2);

  await page.locator('#v2-food-image').setInputFiles(file('late.jpg'));
  await page.locator('#v2-food-time').fill('12:00');
  slowUpload = true;
  await page.getByRole('button', { name: 'Save meal photo', exact: true }).click();
  while (!releaseUpload) await new Promise(resolve => setTimeout(resolve, 10));
  await page.locator('#capacity-date').fill('2026-11-18');
  await page.waitForFunction(() => !document.querySelector('#capacity-date').disabled && new URL(location.href).searchParams.get('date') === '2026-11-18');
  releaseUpload(); slowUpload = false;
  await page.waitForFunction(() => !document.querySelector('#v2-food-save').disabled);
  assert.equal(await page.locator('#v2-meal-list img').count(), 0, 'Late upload cannot appear on another date');
  await page.locator('#capacity-date').fill(date);
  await page.waitForFunction(() => document.querySelectorAll('#v2-meal-list img').length === 3);
  loseNextUpload = true;
  await page.locator('#v2-food-image').setInputFiles(file('pending-delete.jpg'));
  await page.getByRole('button', { name: 'Save meal photo', exact: true }).click();
  const pendingDelete = page.locator('.meal-card').filter({ hasText: 'Saved on this phone; upload pending' });
  await pendingDelete.getByRole('button', { name: 'Delete photo', exact: true }).waitFor();
  page.once('dialog', dialog => dialog.accept());
  await pendingDelete.getByRole('button', { name: 'Delete photo', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#v2-meal-list img').length === 3 && ![...document.querySelectorAll('button')].some(b => b.textContent === 'Retry upload'));
  assert.equal([...values.values()].filter(p => p?.state === 'available').length, 3);
  await page.locator('#v2-meal-list .meal-card').first().getByRole('button', { name: 'Edit photo details', exact: true }).click();
  await mkdir('qa', { recursive: true });
  await page.locator('#v2-meal-list').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'qa/meal-photo-edit-mobile.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#v2-meal-list').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'qa/meal-photo-edit-desktop.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  assert(calls.some(c => c.path === '/update') && calls.some(c => c.path === '/remove'));
  console.log('PASS: batch selection/removal, partial retry, time/note edits, persistence, delete cancel/failure/retry, date-switch race, phone/desktop layouts.');
} finally { await browser.close(); server.close(); }
