import { maxBytes, merge, task, taskList } from '../model.mjs';
import { mcp } from './mcp.mjs';
import { oauth, oauthStorage, approveOAuth, connectionEvent } from './oauth.mjs';

const cookie = '__Host-planner';
const lifetime = 30 * 24 * 60 * 60;
const absoluteLifetime = 180 * 24 * 60 * 60;
const renewalInterval = 24 * 60 * 60;
const secretPattern = /^[!-~]{32,128}$/;
const encoder = new TextEncoder();
const security = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
};
const json = (body, status = 200, headers = {}) =>
  Response.json(body, { status, headers: { ...security, ...headers } });

async function readJson(request, limit) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json' || !request.body) {
    throw new Error('JSON body required');
  }
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RangeError('Request too large');
    }
    chunks.push(value);
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await new Blob(chunks).arrayBuffer()));
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

async function matches(candidate, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(secret));
  return crypto.subtle.verify('HMAC', key, signature, encoder.encode(candidate));
}

function sessionCookie(value, seconds) {
  return `${cookie}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
}

export async function handle(request, env) {
  const url = new URL(request.url);
  const localTest = env.PLANNER_LOCAL_TEST === '1' && url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !localTest) {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'HTTPS required' }, 403);
    url.protocol = 'https:';
    return new Response(null, { status: 308, headers: { Location: url.href, 'Cache-Control': 'no-store' } });
  }
  const { pathname } = url;
  if (pathname.startsWith('/oauth/') || pathname.startsWith('/.well-known/')) return oauth(request,env,{json,digest});
  if (pathname === '/mcp') return mcp(request, env, {json, readJson, integration:handle});
  if (!pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(security)) headers.set(name, value);
    return new Response(response.body, { status: response.status, headers });
  }

  const method = request.method;
  // Server-to-server access is separate from browser login. It stays disabled
  // unless explicitly provisioned, and never accepts the owner password.
  if (pathname === '/api/integration/tasks') {
    if (!['GET', 'PATCH'].includes(method)) return json({ error: 'Method not allowed' }, 405);
    const readKey = env.PLANNER_READ_KEY ?? '';
    const writeKey = env.PLANNER_WRITE_KEY ?? '';
    const owner = env.PLANNER_OWNER_KEY?.trim() ?? '';
    const candidate = request.headers.get('Authorization')?.match(/^Bearer ([!-~]{32,128})$/)?.[1] ?? '';
    const valid = key => secretPattern.test(key) && key !== owner && readKey !== writeKey;
    if (!secretPattern.test(owner) || !candidate) return json({ error: 'Unauthorized' }, 401);
    const canWrite = valid(writeKey) && await matches(candidate, writeKey);
    const canRead = valid(readKey) && await matches(candidate, readKey);
    // Dynamically issued connector keys are stored hashed in the same owner object,
    // but grant only task access and never authorize browser/account operations.
    const dynamic = !canWrite && !canRead;
    if (method === 'PATCH' && canRead && !canWrite) return json({ error: 'Write permission required' }, 403);
    const store = env.PLANNER_STORE.get(env.PLANNER_STORE.idFromName('owner'));
    const headers = new Headers(dynamic ? {
      'x-planner-integration-token': await digest(candidate),
      'x-planner-key-version': await digest(owner)
    } : { 'x-planner-integration': canWrite ? 'write' : 'read' });
    const internalUrl = new URL('/api/tasks', url);
    if (method === 'GET') return store.fetch(new Request(internalUrl, { method, headers }));
    try {
      const body = await readJson(request, 2 * maxBytes + 65536);
      // Narrow the number of changes per integration call.
      if (!Array.isArray(body.changes) || body.changes.length < 1 || body.changes.length > 25)
        return json({ error: 'Supply 1 to 25 changes' }, 400);
      return store.fetch(new Request(internalUrl, { method, headers, body: JSON.stringify(body) }));
    } catch (error) {
      return json({ error: 'Invalid integration request' }, error instanceof RangeError ? 413 : 400);
    }
  }
  if (method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    return json({ error: 'Origin rejected' }, 403);
  }
  const allowed = { '/api/login': ['POST'], '/api/logout': ['POST'], '/api/tasks': ['GET', 'PATCH'], '/api/connectors': ['GET','POST','DELETE'] };
  if (!Object.hasOwn(allowed, pathname)) return json({ error: 'Not found' }, 404);
  if (!allowed[pathname].includes(method)) return json({ error: 'Method not allowed' }, 405);
  const ownerKey = env.PLANNER_OWNER_KEY?.trim() ?? '';
  if (!secretPattern.test(ownerKey)) return json({ error: 'Planner sign-in is not configured' }, 503);
  const store = env.PLANNER_STORE.get(env.PLANNER_STORE.idFromName('owner'));
  const headers = new Headers();
  headers.set('x-planner-key-version', await digest(ownerKey));

  if (pathname === '/api/login') {
    let key;
    try { ({ key } = await readJson(request, 512)); }
    catch { return json({ error: 'Invalid sign-in request' }, 400); }
    if (typeof key !== 'string' || !secretPattern.test(key) || !await matches(key, ownerKey)) {
      return json({ error: 'Incorrect owner key' }, 401);
    }
    return store.fetch(new Request(url, { method, headers }));
  }
  const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)__Host-planner=([a-f0-9]{64})(?=;|$)/)?.[1];
  if (!token) return json({ error: 'Sign in to sync' }, 401);
  headers.set('x-planner-session', await digest(token));

  // Only the outer authenticated HTTP handler can issue the browser cookie.
  const forward = async internal => {
    const response = await store.fetch(internal);
    const seconds = Number(response.headers.get('x-planner-renew') || 0);
    const outgoing = new Headers(response.headers);
    outgoing.delete('x-planner-renew');
    if (seconds > 0 && seconds <= lifetime) outgoing.set('Set-Cookie', sessionCookie(token, seconds));
    return new Response(response.body, { status: response.status, headers: outgoing });
  };

  if (method === 'PATCH' || (pathname === '/api/connectors' && method === 'POST')) {
    try {
      const body = await readJson(request, 2 * maxBytes + 65536);
      return forward(new Request(url, { method, headers, body: JSON.stringify(body) }));
    } catch (error) {
      return json({ error: 'Invalid sync request' }, error instanceof RangeError ? 413 : 400);
    }
  }
  return forward(new Request(url, { method, headers }));
}

export default { fetch: handle };

export class PlannerStore {
  constructor(ctx) {
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const keyVersion = request.headers.get('x-planner-key-version');
    const now = Math.floor(Date.now() / 1000);
    if (path.startsWith('/internal/oauth/')) return this.storage.transaction(async tx=>oauthStorage(tx,path.split('/').pop(),await request.json(),keyVersion,digest,json));
    if (path === '/api/login') {
      const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      const id = await digest(token);
      await this.storage.transaction(async tx => {
        const existing = await tx.get('sessions') ?? [];
        const active = existing.filter(session => session.expires > now && session.keyVersion === keyVersion);
        await tx.put('sessions', [...active.slice(-31), { id, keyVersion, issued: now, renewed: now, expires: now + lifetime }]);
      });
      return json({ signedIn: true }, 200, { 'Set-Cookie': sessionCookie(token, lifetime) });
    }

    const id = request.headers.get('x-planner-session');
    let edits;
    if (request.method === 'PATCH') {
      try {
        const body = await request.json();
        if (!Array.isArray(body.changes) || !body.changes.length || body.changes.length > 1000) {
          throw new Error('Invalid changes');
        }
        const ids = new Set();
        edits = body.changes.map(({ before, after }) => {
          const next = task(after);
          const prior = before === null ? null : task(before);
          if (ids.has(next.id) || (prior && prior.id !== next.id)) throw new Error('Invalid task ID');
          ids.add(next.id);
          return { before: prior, after: next };
        });
      } catch { return json({ error: 'Invalid task changes' }, 400); }
    }

    return this.storage.transaction(async tx => {
      const dynamicId = request.headers.get('x-planner-integration-token');
      const grants = await tx.get('connectorGrants') ?? [];
      const grant = dynamicId && grants.find(g => g.id === dynamicId && g.keyVersion === keyVersion && (!g.expires || g.expires>Date.now()));
      if (dynamicId && !grant) return json({ error: 'Unauthorized' }, 401);
      const integration = grant ? grant.permission : request.headers.get('x-planner-integration');
      const allowedIntegration = path === '/api/tasks' && (
        integration === 'write' || (integration === 'read' && request.method === 'GET'));
      if (integration && !allowedIntegration) return json({ error: 'Forbidden' }, 403);
      if(allowedIntegration&&grant?.kind==='oauth'&&request.method==='GET')await connectionEvent(tx,keyVersion,'task_accessed');
      const sessions = allowedIntegration ? [] : await tx.get('sessions') ?? [];
      const session = sessions.find(session => session.id === id && session.keyVersion === keyVersion && session.expires > now && (session.issued ?? now) + absoluteLifetime > now);
      if (!session && !allowedIntegration) {
        return json({ error: 'Session expired. Sign in again.' }, 401);
      }
      if (path === '/api/logout') {
        await tx.put('sessions', sessions.filter(session => session.id !== id));
        return json({ signedIn: false }, 200, { 'Set-Cookie': sessionCookie('', 0) });
      }

      if (path === '/api/connectors') {
        if (request.method === 'DELETE') {
          await tx.put('connectorGrants', []);
          await tx.put('oauthCodes', []);
          await tx.put('oauthPending', []);
          await connectionEvent(tx,keyVersion,'revoked');
          return json({ revoked: true });
        }
        if (request.method === 'GET') {
          const requestId=new URL(request.url).searchParams.get('request');
          const pending=(await tx.get('oauthPending')??[]).find(p=>p.request_id===requestId&&p.keyVersion===keyVersion&&p.expires>Date.now());
          const events=(await tx.get('oauthEvents')??[]).filter(e=>e.keyVersion===keyVersion).map(({stage,at,reason})=>({stage,at,...(reason?{reason}:{})}));
          const active=grants.filter(g=>g.keyVersion===keyVersion&&g.kind==='oauth'&&g.refreshExpires>Date.now()).length;
          const lastTime=(items,ttl)=>{const times=items.filter(p=>p.keyVersion===keyVersion).map(p=>p.expires-ttl);return times.length?new Date(Math.max(...times)).toISOString():null;};
          const lastApprovalAt=lastTime(await tx.get('oauthCodes')??[],300000);
          const lastRequestAt=lastTime(await tx.get('oauthPending')??[],600000);
          return json({grants:grants.filter(g=>g.keyVersion===keyVersion).map(({id,permission,createdAt})=>({id,permission,createdAt})),pending:pending?{request_id:pending.request_id,permission:pending.permission}:null,connection:{active,events,lastApprovalAt,lastRequestAt}});
        }
        const body=await request.json();
        if(body.request_id) return approveOAuth(tx,body,keyVersion,digest,json,new URL(request.url).origin);
        let permission;
        try { ({permission}=body); } catch { return json({error:'Invalid connector request'},400); }
        if (!['read','write'].includes(permission)) return json({error:'Choose read or write permission'},400);
        if (grants.length >= 10) return json({error:'Revoke old connector keys before adding more'},409);
        const token = crypto.randomUUID().replaceAll('-','') + crypto.randomUUID().replaceAll('-','');
        await tx.put('connectorGrants',[...grants,{id:await digest(token),keyVersion,permission,createdAt:new Date().toISOString()}]);
        return json({ key:token, permission });
      }

      // Upgrade unexpired legacy sessions; otherwise renew at most once per day.
      let renewal = {};
      if (session && (!session.issued || !session.renewed || now - session.renewed >= renewalInterval)) {
        const issued = session.issued ?? now;
        const expires = Math.min(now + lifetime, issued + absoluteLifetime);
        await tx.put('sessions', sessions.map(s => s.id === id ? { ...s, issued, renewed: now, expires } : s));
        renewal = { 'x-planner-renew': String(expires - now) };
      }
      const old = await tx.get('snapshot') ?? { revision: 0, tasks: [] };
      if (!edits) return json(old, 200, renewal);
      const result = merge(taskList(old.tasks), edits, old.revision + 1);
      if (result.conflicts.length) return json({ ...old, conflicts: result.conflicts }, 409, renewal);
      if (!result.changed) return json(old, 200, renewal);
      let tasks;
      try { tasks = taskList(result.tasks); }
      catch (error) { return json({ error: error.message }, 422, renewal); }
      const next = { revision: old.revision + 1, tasks };
      await tx.put('snapshot', next);
      return json(next, 200, renewal);
    });
  }
}
