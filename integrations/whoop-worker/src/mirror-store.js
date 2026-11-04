import { mergeMirror } from './mirror-merge.js';
export function mirrorStore(env) {
  if (!env.PERSONAL_OS_MIRROR) throw new Error('Safe mirror storage is not configured; sync refused to protect existing records.');
  return env.PERSONAL_OS_MIRROR.get(env.PERSONAL_OS_MIRROR.idFromName('personal-os-owner'));
}
// One named Durable Object serializes all devices. Transactions prevent lost
// updates; chunking avoids per-value storage limits. The original KV mirror is
// retained unchanged as the migration source until the first successful upsert.
export class PersonalOsMirror {
  constructor(state, env) { this.state = state; this.env = env; }
  async load(storage) {
    const meta = await storage.get('snapshot');
    if (meta === undefined) return this.env.WHOOP_AUTH.get('personal-os-mirror', 'json');
    if (meta.chunks === 0) return null;
    let encoded = '';
    for (let i = 0; i < meta.chunks; i++) {
      const chunk = await storage.get('chunk:'+i);
      if (typeof chunk !== 'string') throw new Error('Mirror storage is incomplete; no data was changed.');
      encoded += chunk;
    }
    return JSON.parse(encoded);
  }
  async fetch(request) {
    try {
      if (request.method === 'GET') {
        const mirror = await this.state.storage.transaction(storage => this.load(storage));
        return Response.json(mirror);
      }
      if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
      const payload = await request.json();
      const mirror = await this.state.storage.transaction(async storage => {
        const merged = mergeMirror(await this.load(storage), payload);
        const encoded = JSON.stringify(merged);
        if (new TextEncoder().encode(encoded).byteLength > 20_000_000) throw new Error('Personal OS mirror is too large; no data was changed.');
        const chunks = Math.ceil(encoded.length / 16000);
        for (let i = 0; i < chunks; i++) await storage.put('chunk:'+i, encoded.slice(i*16000, (i+1)*16000));
        await storage.put('snapshot', { chunks });
        return merged;
      });
      return Response.json({ ok: true, syncedAt: mirror.syncedAt, recordCount: mirror.records.length, rangeStart: mirror.rangeStart, rangeEnd: mirror.rangeEnd, counts: mirror.counts, diagnostics: mirror.lastSync });
    } catch { return Response.json({ error: 'Safe mirror merge failed; existing data was preserved.' }, { status: 503 }); }
  }
}
