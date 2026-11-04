export const PHOTO_LIMIT = 750_000;
export const STORAGE_LIMIT = 250_000_000;
export const GRACE_MS = 7 * 86400000;

export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function cleanupCandidates(photos, now) {
  return photos.filter(p => p.state === 'available' && p.reviewedAt && Date.parse(p.reviewedAt) + GRACE_MS <= now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function validatePhoto(body) {
  if (!validDate(body.date) || !/^[0-9a-f-]{36}$/i.test(body.id || '')) throw new Error('Invalid photo date or ID.');
  if (body.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.time)) throw new Error('Invalid meal time.');
  if (typeof body.note !== 'string' || body.note.length > 2000) throw new Error('Meal note is too long.');
  if (body.consent !== true || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image || '')) throw new Error('A JPEG and consent are required.');
  const bytes = Uint8Array.from(atob(body.image.split(',')[1]), c => c.charCodeAt(0));
  if (bytes.length < 4 || bytes.length > PHOTO_LIMIT || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error('Photo must be a JPEG smaller than 750 KB.');
  return bytes;
}

// All mutations run through a single named object, including uploads and cleanup.
export class PhotoLibraryStorage {
  constructor(state, env) { this.state = state; this.env = env; this.tail = Promise.resolve(); }
  fetch(request) {
    const operation = this.tail.then(() => this.handle(request));
    this.tail = operation.catch(() => {});
    return operation.catch(error => Response.json({ error: error.message }, { status: 400 }));
  }
  async photos() { return [...(await this.state.storage.list({ prefix: 'photo:' })).values()]; }
  async cleanup() {
    if (!await this.state.storage.get('cleanupEnabled')) return;
    for (const p of cleanupCandidates(await this.photos(), Date.now())) {
      await this.state.storage.transaction(async storage => {
        await storage.delete(`image:${p.id}`);
        await storage.put(`photo:${p.id}`, { ...p, state: 'deleted', deletedAt: new Date().toISOString() });
      });
    }
  }
  async handle(request) {
    const url = new URL(request.url);
    if (url.pathname === '/cleanup') { await this.cleanup(); return Response.json({ ok: true }); }
    if (url.pathname === '/settings' && request.method === 'POST') {
      const body = await request.json();
      await this.state.storage.put('cleanupEnabled', body.enabled === true);
      return Response.json({ enabled: body.enabled === true });
    }
    if (url.pathname === '/upload' && request.method === 'POST') {
      const body = await request.json();
      const bytes = validatePhoto(body);
      const previous = await this.state.storage.get(`photo:${body.id}`);
      if (previous?.state === 'available') return Response.json(previous);
      if (previous?.state === 'deleted') throw new Error('This photo ID has already been deleted.');
      await this.cleanup();
      const total = (await this.photos()).filter(p => p.state !== 'deleted').reduce((sum, p) => sum + p.bytes, 0);
      // Keep unreviewed images when the quota is reached. Do not silently evict them.
      if (total + (previous ? 0 : bytes.length) >= STORAGE_LIMIT) return Response.json({ error: 'Photo storage is full. Review older photos before adding more.' }, { status: 409 });
      const photo = { id: body.id, date: body.date, time: body.time || '', note: body.note, bytes: bytes.length, createdAt: new Date().toISOString(), state: 'available', reviewedAt: null };
      await this.state.storage.transaction(async storage => {
        await storage.put(`image:${photo.id}`, bytes);
        await storage.put(`photo:${photo.id}`, photo);
      });
      return Response.json(photo);
    }
    if (url.pathname === '/receipt' && request.method === 'POST') {
      const body = await request.json();
      if (!Array.isArray(body.photo_ids) || body.photo_ids.length < 1 || body.photo_ids.length > 100 || new Set(body.photo_ids).size !== body.photo_ids.length || typeof body.review_reference !== 'string' || !body.review_reference.trim() || body.review_reference.length > 1000) throw new Error('Provide exact photo IDs and the saved review reference.');
      const photos = await Promise.all(body.photo_ids.map(id => this.state.storage.get(`photo:${id}`)));
      if (photos.some(p => !p || p.state !== 'available' || !p.retrievedAt)) throw new Error('Every photo must have been retrieved for review before it can be acknowledged.');
      const reviewedAt = new Date().toISOString();
      for (const p of photos) if (!p.reviewedAt) await this.state.storage.put(`photo:${p.id}`, { ...p, reviewedAt, reviewReference: body.review_reference });
      return Response.json({ acknowledged: body.photo_ids, reviewedAt, deletionAfter: new Date(Date.now() + GRACE_MS).toISOString() });
    }
    if (url.pathname === '/image') {
      const photo = await this.state.storage.get(`photo:${url.searchParams.get('id')}`);
      if (!photo || photo.state !== 'available') return Response.json({ error: 'Photo is unavailable or has been removed.' }, { status: 404 });
      const object = await this.state.storage.get(`image:${photo.id}`);
      if (!object) return Response.json({ error: 'Photo is unavailable.' }, { status: 404 });
      if (url.searchParams.get('review') === 'true') await this.state.storage.put(`photo:${photo.id}`, { ...photo, retrievedAt: new Date().toISOString() });
      return new Response(object, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
    }
    const all = await this.photos();
    const start = url.searchParams.get('start'), end = url.searchParams.get('end');
    const selected = all.filter(p => (!start || p.date >= start) && (!end || p.date <= end)).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    return Response.json({ photos: selected, bytesUsed: all.filter(p => p.state !== 'deleted').reduce((sum, p) => sum + p.bytes, 0), limitBytes: STORAGE_LIMIT, cleanupEnabled: Boolean(await this.state.storage.get('cleanupEnabled')) });
  }
}

export function photoLibrary(env) {
  if (!env.PHOTO_LIBRARY) throw new Error('Private photo storage needs to be enabled in Cloudflare.');
  return env.PHOTO_LIBRARY.get(env.PHOTO_LIBRARY.idFromName('owner-meal-photos'));
}
