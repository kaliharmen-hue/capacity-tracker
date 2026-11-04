import { db, type MealPhotoDraft } from './db';

const API = (import.meta.env.PUBLIC_PERSONAL_OS_API_BASE || 'https://capacity-tracker.kaliharmen.workers.dev').replace(/\/$/, '') + '/api/meal-photos';
interface Photo { id: string; date: string; time: string; note: string; state: string; reviewedAt: string | null }

export async function compressMealPhoto(file: Blob): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Photo processing is unavailable in this browser.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Re-encoding pixels discards the source EXIF and GPS metadata.
    for (const quality of [0.8, 0.65, 0.5]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 750_000) return blob;
    }
    throw new Error('Please choose a simpler or smaller picture; the compressed photo exceeds 750 KB.');
  } finally { URL.revokeObjectURL(url); }
}

async function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
}

export function initMealPhotos(getDate: () => string) {
  const root = document.querySelector<HTMLElement>('#v2-food-section')!;
  const input = root.querySelector<HTMLInputElement>('#v2-food-image')!;
  const camera = root.querySelector<HTMLInputElement>('#v2-food-camera')!;
  const time = root.querySelector<HTMLInputElement>('#v2-food-time')!;
  const note = root.querySelector<HTMLTextAreaElement>('#v2-food-note')!;
  const consent = root.querySelector<HTMLInputElement>('#v2-food-consent')!;
  const cleanup = root.querySelector<HTMLInputElement>('#v2-photo-cleanup')!;
  const save = root.querySelector<HTMLButtonElement>('#v2-food-save')!;
  const preview = root.querySelector<HTMLImageElement>('#v2-food-preview')!;
  const list = root.querySelector<HTMLElement>('#v2-meal-list')!;
  const status = root.querySelector<HTMLElement>('#v2-food-status')!;
  const usage = root.querySelector<HTMLElement>('#v2-photo-usage')!;
  let selected: File | undefined;
  let selectedUrl = '';
  let photoUrls: string[] = [];
  let renderVersion = 0;
  const session = () => localStorage.getItem('personal-os-whoop-session');
  const message = (value: string) => { status.textContent = value; };
  async function api(path: string, body?: unknown) {
    const token = session();
    if (!token) throw new Error('Connect WHOOP in Capacity Building to use private photo storage.');
    const response = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Photo service needs retrying.'); }
    return response;
  }
  function choose(file?: File) {
    selected = file;
    if (selectedUrl) URL.revokeObjectURL(selectedUrl);
    selectedUrl = file ? URL.createObjectURL(file) : '';
    preview.hidden = !file;
    if (file) preview.src = selectedUrl;
  }
  input.addEventListener('change', () => choose(input.files?.[0]));
  camera.addEventListener('change', () => choose(camera.files?.[0]));

  async function upload(draft: MealPhotoDraft) {
    const image = await dataUrl(draft.image);
    await api('/upload', { id: draft.id, date: draft.date, time: draft.time, note: draft.note, image, consent: true });
    await db.mealPhotoDrafts.delete(draft.id);
  }
  async function refresh() {
    const version = ++renderVersion;
    const date = getDate();
    const drafts = await db.mealPhotoDrafts.where('date').equals(date).toArray();
    let photos: Photo[] = [];
    try {
      const result = await (await api('/list?start=' + date + '&end=' + date)).json();
      photos = result.photos;
      if (version !== renderVersion) return;
      cleanup.checked = result.cleanupEnabled;
      usage.textContent = (result.bytesUsed / 1_000_000).toFixed(1) + ' MB stored privately';
    } catch (error) { if (version === renderVersion) message(error instanceof Error ? error.message : 'Photos could not be loaded.'); }
    if (version !== renderVersion) return;
    photoUrls.forEach(url => URL.revokeObjectURL(url)); photoUrls = [];
    list.replaceChildren();
    const append = (photo: Photo | MealPhotoDraft, state: string) => {
      const article = document.createElement('article'); article.className = 'meal-card';
      const heading = document.createElement('strong'); heading.textContent = photo.time || 'Time not recorded';
      const p = document.createElement('p'); p.textContent = photo.note;
      const caption = document.createElement('small'); caption.textContent = state;
      article.append(heading, p, caption); list.append(article);
      return article;
    };
    for (const photo of photos) {
      const article = append(photo, photo.state === 'deleted' ? 'Photo removed after review; meal details retained' : photo.reviewedAt ? 'Reviewed; awaiting automatic cleanup' : 'Available for ChatGPT review');
      if (photo.state !== 'available') continue;
      try {
        const blob = await (await api('/image?id=' + encodeURIComponent(photo.id))).blob();
        if (version !== renderVersion) return;
        const url = URL.createObjectURL(blob); photoUrls.push(url);
        const img = document.createElement('img'); img.src = url; img.alt = 'Meal recorded on ' + photo.date; article.prepend(img);
      } catch { /* Keep meal details visible if an image cannot be loaded. */ }
    }
    for (const draft of drafts.filter(d => !photos.some(p => p.id === d.id))) {
      const article = append(draft, 'Saved on this phone; upload pending');
      const url = URL.createObjectURL(draft.image); photoUrls.push(url);
      const img = document.createElement('img'); img.src = url; img.alt = 'Meal awaiting upload'; article.prepend(img);
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-button'; retry.textContent = 'Retry upload';
      retry.addEventListener('click', async () => { retry.disabled = true; try { await upload(draft); await refresh(); } catch (e) { message(e instanceof Error ? e.message : 'Upload failed.'); retry.disabled = false; } });
      article.append(retry);
    }
  }
  save.addEventListener('click', async () => {
    if (!selected) { message('Choose or take a meal photo first.'); return; }
    if (!consent.checked) { message('Please agree to private photo storage and ChatGPT retrieval before saving.'); return; }
    const date = getDate(), file = selected, mealTime = time.value, mealNote = note.value;
    save.disabled = true;
    try {
      const image = await compressMealPhoto(file);
      const draft: MealPhotoDraft = { id: crypto.randomUUID(), date, time: mealTime, note: mealNote, image, createdAt: new Date().toISOString() };
      await db.mealPhotoDrafts.put(draft);
      choose(); input.value = ''; camera.value = ''; note.value = '';
      try { await upload(draft); message('Meal photo saved privately for ' + date + '.'); }
      catch (error) { message('Saved on this phone. ' + (error instanceof Error ? error.message : 'Upload needs retrying.')); }
      await refresh();
    } catch (error) { message(error instanceof Error ? error.message : 'Photo could not be saved.'); }
    finally { save.disabled = false; }
  });
  cleanup.addEventListener('change', async () => {
    const enabled = cleanup.checked; cleanup.disabled = true;
    try { await api('/settings', { enabled }); message(enabled ? 'Reviewed photos will be removed after seven days.' : 'Automatic cleanup paused.'); }
    catch (error) { cleanup.checked = !enabled; message(error instanceof Error ? error.message : 'Could not save cleanup setting.'); }
    finally { cleanup.disabled = false; }
  });
  return { refresh };
}
