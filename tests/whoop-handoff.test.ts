import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../integrations/whoop-worker/src/index.js';

const origin = 'https://kaliharmen-hue.github.io';
function setup() {
  const owner = 'a'.repeat(64);
  const values = new Map([['owner-session', owner], ['session:' + owner, '{}'], ['session:other-session', '{}']]);
  const env = { APP_ORIGIN: origin + '/capacity-tracker/', PUBLIC_BASE_URL: 'https://bridge.example',
    WHOOP_AUTH: { get: async (key, type?) => { const value = values.get(key); return value === undefined ? null : type === 'json' ? JSON.parse(value) : value; },
      put: async (key, value) => { values.set(key, value); }, delete: async key => { values.delete(key); } } };
  const request = (path, body = {}, session?, from = origin) => worker.fetch(new Request('https://bridge.example/api/whoop-connection/' + path, {
    method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session } : {}) }, body: JSON.stringify(body)
  }), env);
  return { values, env, owner, request };
}

test('only the current signed-in owner can issue a private, expiring phone connection code', async () => {
  const { values, owner, request } = setup();
  assert.equal((await request('code')).status, 401);
  assert.equal((await request('code', {}, 'other-session')).status, 401);
  assert.equal((await request('code', {}, owner, 'https://untrusted.example')).status, 403);
  const response = await request('code', {}, owner);
  const issued = await response.json();
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(issued.code, /^[0-9a-f]{32}$/); assert(issued.expiresAt > Date.now());
  const storedKey = [...values.keys()].find(key => key.startsWith('phone-code:'))!;
  assert(!storedKey.includes(issued.code)); assert(!values.get(storedKey)!.includes(issued.code));
  const connected = await request('connect', { code: issued.code.toUpperCase().match(/.{1,8}/g).join('-') });
  assert.equal(connected.status, 200); assert.equal((await connected.json()).session, owner);
  assert.equal(connected.headers.get('Cache-Control'), 'no-store');
  assert.equal((await request('connect', { code: issued.code }, undefined, 'https://untrusted.example')).status, 403);
  assert.equal((await request('connect', { code: '0'.repeat(32) })).status, 410);
  assert.equal((await request('connect?code=' + issued.code)).status, 400, 'Credentials in query strings must not authorize a connection');
});

test('phone code delivery is retryable but rejects expiry, revocation and replacement', async () => {
  const { values, owner, request } = setup();
  const issued = await (await request('code', {}, owner)).json();
  assert.equal((await request('connect', { code: issued.code })).status, 200);
  assert.equal((await request('connect', { code: issued.code })).status, 200);
  values.set('owner-session', 'different-owner-session');
  assert.equal((await request('connect', { code: issued.code })).status, 410);
  values.set('owner-session', owner); values.delete('session:' + owner);
  assert.equal((await request('connect', { code: issued.code })).status, 410);
  values.set('session:' + owner, '{}');
  const storedKey = [...values.keys()].find(key => key.startsWith('phone-code:'))!;
  values.set(storedKey, JSON.stringify({ sessionId: owner, expiresAt: Date.now() - 1 }));
  assert.equal((await request('connect', { code: issued.code })).status, 410);
  assert.equal((await request('connect', { code: 'bad' })).status, 400);
});
