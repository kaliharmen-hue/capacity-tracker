import assert from 'node:assert/strict';
import { test } from 'node:test';

const origin = process.env.PLANNER_TEST_ORIGIN ?? 'http://127.0.0.1:8794';
if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Use an isolated localhost Worker.');
const testKey = 'A'.repeat(43);
const call = (path, { method = 'GET', cookie, body, site = origin, extra = {} } = {}) =>
  fetch(origin + path, {
    method,
    headers: {
      Origin: site,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });

async function login() {
  const response = await call('/api/login', { method: 'POST', body: { key: testKey } });
  assert.equal(response.status, 200);
  const header = response.headers.get('Set-Cookie');
  assert.match(header, /^__Host-planner=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000$/);
  return header.split(';')[0];
}

test('only planner assets are hosted and private responses are uncached', async () => {
  const landing = await call('/');
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /Personal Planner/);
  assert.match(landing.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  for (const path of ['/app.mjs', '/model.mjs']) {
    const response = await call(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Type'), /javascript/);
  }
  for (const path of ['/cloud/worker.mjs', '/cloud/wrangler.toml', '/architecture.md', '/.assetsignore']) {
    assert.equal((await call(path)).status, 404, path);
  }
  const response = await call('/api/tasks');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('owner sign-in, mutation origin, revoked session and prototype credential rejection', async () => {
  assert.equal((await call('/api/login', { method: 'POST', body: { key: 'B'.repeat(43) } })).status, 401);
  assert.equal((await call('/api/login', { method: 'POST', site: 'https://example.invalid', body: { key: testKey } })).status, 403);
  assert.equal((await call('/api/tasks', { extra: { Authorization: 'Bearer ' + testKey } })).status, 401);
  const cookie = await login();
  const immediate = await call('/api/tasks', { cookie });
  assert.equal(immediate.status, 200);
  assert.equal(immediate.headers.get('Set-Cookie'), null, 'no renewal on every request');
  assert.equal((await call('/api/tasks', { method: 'PATCH', cookie, site: 'null', body: {} })).status, 403);
  assert.equal((await call('/api/tasks', { method: 'PUT', cookie })).status, 405);
  assert.equal((await call('/api/tasks', { method: 'PATCH', cookie, body: { changes: [] } })).status, 400);
  const logout = await call('/api/logout', { method: 'POST', cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await call('/api/tasks', { cookie })).status, 401);
});

test('concurrent device writes, retries and stale updates preserve task revisions', async () => {
  const a = await login();
  const b = await login();
  const get = cookie => call('/api/tasks', { cookie }).then(response => response.json());
  const write = (cookie, ...changes) => call('/api/tasks', { method: 'PATCH', cookie, body: { changes } });
  const one = { id: crypto.randomUUID(), title: 'Synthetic one', status: 'Inbox', project: '', deadline: '' };
  const two = { ...one, id: crypto.randomUUID(), title: 'Synthetic two' };
  const initial = await get(a);
  const create = after => ({ before: null, after });
  const responses = await Promise.all([write(a, create(one)), write(b, create(two))]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  let remote = await get(b);
  assert.equal(remote.revision, initial.revision + 2);
  const version = remote.tasks.find(task => task.id === one.id);
  assert.ok(version.version);
  assert.equal((await write(a, create(one))).status, 200);
  assert.equal((await get(a)).revision, remote.revision);

  const winner = { before: version, after: { ...version, title: 'Synthetic winner' } };
  const loser = { before: version, after: { ...version, title: 'Synthetic loser' } };
  const third = { ...one, id: crypto.randomUUID(), title: 'Synthetic third' };
  assert.equal((await write(a, winner)).status, 200);
  const rejected = await write(b, loser, create(third));
  assert.equal(rejected.status, 409);
  assert.deepEqual((await rejected.json()).conflicts, [one.id]);
  remote = await get(b);
  assert.equal(remote.tasks.find(task => task.id === one.id).title, winner.after.title);
  assert.ok(!remote.tasks.some(task => task.id === third.id));
  assert.equal((await write(b, create({ ...third, deadline: '2026-02-31' }))).status, 400);
  assert.equal((await write(b, create({ ...third, title: 'x'.repeat(1200000) }))).status, 413);
});
