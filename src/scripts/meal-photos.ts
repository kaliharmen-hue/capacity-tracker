import { db, type MealPhotoDraft } from './db';
import { redeemPhoneConnectionCode } from './whoop-connection';
import { openCapacityDialog } from './capacity-ui';
import { createElement, Pencil, Trash, X, type IconNode } from 'lucide';

const API = (import.meta.env.PUBLIC_PERSONAL_OS_API_BASE || 'https://capacity-tracker.kaliharmen.workers.dev').replace(/\/$/, '') + '/api/meal-photos';
interface Photo { id: string; date: string; time: string; note: string; state: string; reviewedAt: string | null }
const CONSENT_KEY = 'personal-os-meal-photo-consent-v1';

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

export function initMealPhotos() {
  const root = document.querySelector<HTMLElement>('#v2-food-section')!;
  const input = root.querySelector<HTMLInputElement>('#v2-food-image')!;
  const camera = root.querySelector<HTMLInputElement>('#v2-food-camera')!;
  const selectedName = root.querySelector<HTMLElement>('#v2-food-selected')!;
  const time = root.querySelector<HTMLInputElement>('#v2-food-time')!;
  const note = root.querySelector<HTMLTextAreaElement>('#v2-food-note')!;
  const consent = document.querySelector<HTMLInputElement>('#v2-food-consent')!;
  const cleanup = document.querySelector<HTMLInputElement>('#v2-photo-cleanup')!;
  const save = root.querySelector<HTMLButtonElement>('#v2-food-save')!;
  const preview = root.querySelector<HTMLElement>('#v2-food-preview')!;
  const list = root.querySelector<HTMLElement>('#v2-meal-list')!;
  const status = root.querySelector<HTMLElement>('#v2-food-status')!;
  const usage = document.querySelector<HTMLElement>('#v2-photo-usage')!;
  const settingsStatus = document.querySelector<HTMLElement>('#v2-photo-settings-status');
  let selected: File[] = [];
  let selectedUrls: string[] = [];
  let photoUrls: string[] = [];
  let renderVersion = 0;
  let activeDate = '';
  const composers = new Map<string, { files: File[]; time: string; note: string }>();
  const busyPhotos = new Set<string>();
  const session = () => localStorage.getItem('personal-os-whoop-session');
  const message = (value: string) => {
    status.textContent = value;
    if (settingsStatus) settingsStatus.textContent = value;
  };
  try { consent.checked = localStorage.getItem(CONSENT_KEY) === 'yes'; }
  catch { message('This browser cannot remember photo permission.'); }
  consent.addEventListener('change', () => {
    try {
      localStorage.setItem(CONSENT_KEY, consent.checked ? 'yes' : 'no');
      message(consent.checked ? 'Photo permission remembered on this device.' : 'New photo uploads paused. Previously uploaded photos remain in my connected account.');
    } catch { message('Permission applies while this page is open, but could not be remembered.'); }
  });
  async function api(path: string, body?: unknown) {
    const token = session();
    if (!token) {
      document.querySelector<HTMLDetailsElement>('#v2-phone-connection')!.open = true;
      throw new Error('Open Photo settings to connect this phone. Your saved photo stays here.');
    }
    const response = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      if (response.status === 401) {
        document.querySelector<HTMLDetailsElement>('#v2-phone-connection')!.open = true;
        throw new Error('Open Photo settings to renew the connection. Your saved photo stays here.');
      }
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Photo service needs retrying.');
    }
    return response;
  }
  function iconButton(label: string, icon: IconNode) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'meal-icon-button';
    button.setAttribute('aria-label', label); button.title = label;
    button.append(createElement(icon, { width: 20, height: 20, 'aria-hidden': 'true' }));
    return button;
  }
  function choose(files: File[] = []) {
    selected = files;
    selectedUrls.forEach(url => URL.revokeObjectURL(url)); selectedUrls = [];
    preview.replaceChildren();
    preview.hidden = files.length === 0;
    selectedName.hidden = files.length === 0;
    selectedName.textContent = files.length === 1 ? files[0].name : files.length + ' photos selected';
    save.textContent = files.length > 1 ? 'Save meal photos' : 'Save meal photo';
    for (const file of files) {
      const item = document.createElement('div'); item.className = 'meal-selection-item';
      const url = URL.createObjectURL(file); selectedUrls.push(url);
      const img = document.createElement('img'); img.src = url; img.alt = file.name;
      const remove = iconButton('Remove selected photo: ' + file.name, X);
      remove.disabled = save.disabled;
      remove.addEventListener('click', () => choose(selected.filter(value => value !== file)));
      item.append(img, remove); preview.append(item);
    }
  }
  function addFiles(files: FileList | null) {
    const additions = Array.from(files ?? []).filter(file => !selected.some(previous =>
      previous.name === file.name && previous.size === file.size && previous.lastModified === file.lastModified));
    choose([...selected, ...additions]);
  }
  function forgetSavedFile(date: string, file: File) {
    if (activeDate === date) choose(selected.filter(value => value !== file));
    else {
      const composer = composers.get(date);
      if (composer) composer.files = composer.files.filter(value => value !== file);
    }
  }
  root.querySelector('#v2-food-library')!.addEventListener('click', () => input.click());
  root.querySelector('#v2-food-take')!.addEventListener('click', () => camera.click());
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  camera.addEventListener('change', () => { addFiles(camera.files); camera.value = ''; });

  function setPhotoBusy(id: string, busy: boolean) {
    if (busy) busyPhotos.add(id); else busyPhotos.delete(id);
    list.querySelectorAll<HTMLElement>('.meal-card').forEach(article => {
      if (article.dataset.photoId !== id) return;
      article.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>('input, button, textarea').forEach(control => { control.disabled = busy; });
    });
  }
  async function upload(draft: MealPhotoDraft) {
    try {
      const image = await dataUrl(draft.image);
      if (!consent.checked) throw new Error('Photo uploads are paused. Enable photo permission to upload.');
      const saved: Photo = await (await api('/upload', { id: draft.id, date: draft.date, time: draft.time, note: draft.note, image, consent: true })).json();
      // A previous request may have succeeded despite a network timeout.
      if (saved.time !== draft.time || saved.note !== draft.note) await api('/update', { id: draft.id, time: draft.time, note: draft.note });
      await db.mealPhotoDrafts.delete(draft.id);
    } catch (error) {
      const lastError = error instanceof Error ? error.message : 'Upload failed. Please retry.';
      await db.mealPhotoDrafts.update(draft.id, { lastError }).catch(() => {});
      throw error;
    }
  }
  function addControls(article: HTMLElement, photo: Photo | MealPhotoDraft, local: boolean) {
    article.dataset.photoId = photo.id;
    const actions = document.createElement('div'); actions.className = 'meal-photo-actions';
    const edit = iconButton('Edit photo details', Pencil);
    const remove = iconButton('Delete photo', Trash);
    actions.append(edit, remove); article.append(actions);
    const errorLine = document.createElement('p'); errorLine.setAttribute('role', 'alert'); errorLine.hidden = true;
    const editor = document.createElement('form'); editor.className = 'meal-photo-editor'; editor.hidden = true;
    editor.setAttribute('aria-label', 'Edit photo details');
    const timeLabel = document.createElement('label'); timeLabel.className = 'field-label'; timeLabel.textContent = 'Meal time';
    const editTime = document.createElement('input'); editTime.type = 'time'; editTime.value = photo.time;
    timeLabel.append(editTime);
    const noteLabel = document.createElement('label'); noteLabel.className = 'field-label'; noteLabel.textContent = 'Meal note';
    const editNote = document.createElement('textarea'); editNote.rows = 2; editNote.maxLength = 2000; editNote.value = photo.note;
    noteLabel.append(editNote);
    const buttons = document.createElement('div'); buttons.className = 'meal-photo-actions';
    const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'primary-button'; submit.textContent = 'Save changes';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary-button'; cancel.textContent = 'Cancel';
    buttons.append(submit, cancel); editor.append(timeLabel, noteLabel, buttons); article.append(editor, errorLine);
    edit.addEventListener('click', () => {
      if (editor.hidden) { editTime.value = photo.time; editNote.value = photo.note; }
      editor.hidden = !editor.hidden;
      article.classList.toggle('is-editing', !editor.hidden);
      edit.setAttribute('aria-expanded', String(!editor.hidden));
      if (!editor.hidden) editTime.focus();
    });
    cancel.addEventListener('click', () => { editor.hidden = true; article.classList.remove('is-editing'); edit.setAttribute('aria-expanded', 'false'); edit.focus(); });
    async function mutate(operation: () => Promise<void>) {
      if (busyPhotos.has(photo.id)) return;
      setPhotoBusy(photo.id, true); errorLine.hidden = true;
      try {
        await operation();
        if (activeDate === photo.date) await refresh();
      } catch (error) {
        errorLine.textContent = error instanceof Error ? error.message : 'Please retry.';
        errorLine.hidden = false;
      } finally {
        setPhotoBusy(photo.id, false);
      }
    }
    editor.addEventListener('submit', event => {
      event.preventDefault();
      if (!editor.reportValidity()) return;
      void mutate(async () => {
        const details = { time: editTime.value, note: editNote.value };
        if (local) await db.mealPhotoDrafts.update(photo.id, details);
        else await api('/update', { id: photo.id, ...details });
      });
    });
    remove.addEventListener('click', () => {
      if (!window.confirm('Delete this photo and its meal details? This cannot be undone.')) return;
      void mutate(async () => {
        // Confirm remotely first, including for pending uploads with an uncertain outcome.
        await api('/remove', { id: photo.id });
        await db.mealPhotoDrafts.delete(photo.id);
      });
    });
    if (busyPhotos.has(photo.id)) {
      article.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>('input, button, textarea').forEach(control => { control.disabled = true; });
    }
    return errorLine;
  }
  async function refresh() {
    if (!activeDate) return;
    const version = ++renderVersion;
    const date = activeDate;
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
    for (const photo of photos.filter(p => !drafts.some(d => d.id === p.id))) {
      const article = append(photo, photo.state === 'deleted' ? 'Photo removed after review; meal details retained' : photo.reviewedAt ? 'Reviewed; awaiting automatic cleanup' : 'Available for ChatGPT review');
      addControls(article, photo, false);
      if (photo.state !== 'available') continue;
      try {
        const blob = await (await api('/image?id=' + encodeURIComponent(photo.id))).blob();
        if (version !== renderVersion) return;
        const url = URL.createObjectURL(blob); photoUrls.push(url);
        const img = document.createElement('img'); img.src = url; img.alt = 'Meal recorded on ' + photo.date; article.prepend(img);
      } catch { /* Keep meal details visible if an image cannot be loaded. */ }
    }
    for (const draft of drafts) {
      const article = append(draft, 'Saved on this phone; upload pending');
      const url = URL.createObjectURL(draft.image); photoUrls.push(url);
      const img = document.createElement('img'); img.src = url; img.alt = 'Meal awaiting upload'; article.prepend(img);
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary-button'; retry.textContent = 'Retry upload';
      retry.disabled = busyPhotos.has(draft.id);
      const errorLine = addControls(article, draft, true);
      errorLine.hidden = !draft.lastError; errorLine.textContent = draft.lastError || '';
      retry.addEventListener('click', async () => {
        if (busyPhotos.has(draft.id)) return;
        setPhotoBusy(draft.id, true);
        try { await upload(draft); await refresh(); }
        catch (e) {
          const text = e instanceof Error ? e.message : 'Upload failed.';
          errorLine.textContent = text; errorLine.hidden = false;
          if (activeDate === draft.date) message(text);
        }
        finally {
          setPhotoBusy(draft.id, false);
        }
      });
      article.append(retry);
    }
  }
  function showDate(date: string) {
    if (date === activeDate) return;
    if (activeDate) {
      if (selected.length || time.value || note.value) composers.set(activeDate, { files: selected, time: time.value, note: note.value });
      else composers.delete(activeDate);
    }
    activeDate = date;
    const composer = composers.get(date);
    choose(composer?.files);
    input.value = ''; camera.value = '';
    time.value = composer?.time ?? ''; note.value = composer?.note ?? '';
    const noteDetails = note.closest('details');
    if (noteDetails) noteDetails.open = Boolean(note.value.trim());
    photoUrls.forEach(url => URL.revokeObjectURL(url)); photoUrls = [];
    list.replaceChildren();
    message('');
    void refresh().catch(() => { if (activeDate === date) message('Photos could not be loaded.'); });
  }
  save.addEventListener('click', async () => {
    if (save.disabled) return;
    if (!selected.length) { message('Choose or take a meal photo first.'); return; }
    if (!consent.checked) {
      message('Please choose whether to allow private photo storage and ChatGPT reviews, then return to save your photo.');
      openCapacityDialog('capacity-settings-dialog', 'photo-settings');
      consent.focus();
      return;
    }
    const date = activeDate, files = [...selected], mealTime = time.value, mealNote = note.value;
    save.disabled = true;
    const pickers = Array.from(root.querySelectorAll<HTMLButtonElement>('#v2-food-library, #v2-food-take'));
    pickers.forEach(button => { button.disabled = true; });
    choose(selected);
    try {
      let saved = 0, pending = 0;
      const failed: string[] = [];
      for (const file of files) {
        let draft: MealPhotoDraft | undefined;
        try {
          const image = await compressMealPhoto(file);
          draft = { id: crypto.randomUUID(), date, time: mealTime, note: mealNote, image, createdAt: new Date().toISOString() };
          setPhotoBusy(draft.id, true);
          await db.mealPhotoDrafts.put(draft);
          forgetSavedFile(date, file);
        } catch { if (draft) setPhotoBusy(draft.id, false); failed.push(file.name); continue; }
        try { await upload(draft); saved++; } catch { pending++; }
        finally { setPhotoBusy(draft.id, false); }
      }
      if (activeDate === date) {
        if (!selected.length && note.value === mealNote) note.value = '';
        message(saved + ' saved privately; ' + pending + ' saved on this phone awaiting upload.' + (failed.length ? ' Could not save: ' + failed.join(', ') + '. Please retry those photos.' : ''));
      }
      if (activeDate === date) await refresh();
    } catch (error) { if (activeDate === date) message(error instanceof Error ? error.message : 'Photos could not be saved.'); }
    finally {
      save.disabled = false;
      pickers.forEach(button => { button.disabled = false; });
      choose(selected);
    }
  });
  cleanup.addEventListener('change', async () => {
    const enabled = cleanup.checked; cleanup.disabled = true;
    try { await api('/settings', { enabled }); message(enabled ? 'Reviewed photos will be removed after seven days.' : 'Automatic cleanup paused.'); }
    catch (error) { cleanup.checked = !enabled; message(error instanceof Error ? error.message : 'Could not save cleanup setting.'); }
    finally { cleanup.disabled = false; }
  });
  document.querySelector<HTMLFormElement>('#v2-phone-connect-form')!.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const code = form.querySelector<HTMLInputElement>('#v2-phone-code')!;
    const button = form.querySelector<HTMLButtonElement>('button')!;
    button.disabled = true;
    try {
      const token = await redeemPhoneConnectionCode(API.replace(/\/api\/meal-photos$/, ''), code.value);
      localStorage.setItem('personal-os-whoop-session', token);
      code.value = '';
      window.dispatchEvent(new Event('personal-os-whoop-connected'));
      for (const draft of await db.mealPhotoDrafts.where('date').equals(activeDate).toArray()) {
        if (draft.lastError?.startsWith('Reconnect WHOOP') || draft.lastError?.startsWith('Photo connection needs renewing')) await db.mealPhotoDrafts.update(draft.id, { lastError: undefined });
      }
      message('Phone connection is ready. Retry the saved photo below.');
      await refresh();
    } catch (error) { message(error instanceof Error ? error.message : 'Could not connect this phone.'); }
    finally { button.disabled = false; }
  });
  return { showDate };
}
