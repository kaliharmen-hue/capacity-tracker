import { changes, merge, same, states, taskList } from './model.mjs';

const $ = id => document.getElementById(id);
const key = 'personal-planner-sync-v1';
const legacyKey = 'personal-planner-prototype-v1';
let state;
let view = 'Inbox';
let signedIn = false;
let busy = false;
let conflict = null;
let timer;

function read() {
  const raw = localStorage.getItem(key);
  if (!raw) return { base: [], draft: taskList(JSON.parse(localStorage.getItem(legacyKey) ?? '[]')) };
  const value = JSON.parse(raw);
  return { base: taskList(value.base), draft: taskList(value.draft) };
}

function message(text) {
  $('notice').textContent = text;
}

function persist(base, draft) {
  const next = { base: taskList(base), draft: taskList(draft) };
  localStorage.setItem(key, JSON.stringify(next));
  state = next;
}

function locked(action, refresh = true) {
  const run = async () => {
    if (refresh) state = read();
    return action();
  };
  return navigator.locks ? navigator.locks.request(key, run) : run();
}

async function run(action) {
  if (busy) return;
  busy = true;
  render();
  try { await locked(action); }
  catch (error) { message(error.message || 'Planner could not complete the request.'); }
  finally { busy = false; render(); }
}

function scheduleSync() {
  clearTimeout(timer);
  if (signedIn && !conflict) timer = setTimeout(() => run(sync), 650);
}

function edit(id, patch) {
  return run(() => {
    const draft = state.draft.map(t => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t);
    persist(state.base, draft);
    message('Saved on this device.');
    scheduleSync();
  });
}

async function api(path, method = 'GET', body) {
  const response = await fetch('/api/' + path, {
    method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (response.status === 401) signedIn = false;
  if (!response.ok && response.status !== 409) {
    const error = new Error(data.error ?? 'Cloud request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function sync() {
  const base = state.base;
  const draft = state.draft;
  const edits = changes(base, draft);
  const remote = await api('tasks', edits.length ? 'PATCH' : 'GET', edits.length ? { changes: edits } : undefined);
  signedIn = true;
  const latest = read();
  if (!same(latest, { base, draft })) {
    state = latest;
    scheduleSync();
    return;
  }
  const tasks = taskList(remote.tasks);
  if (remote.conflicts?.length) {
    conflict = { tasks, ids: remote.conflicts };
    message('The same task changed on another device. Choose which version to keep for the listed tasks.');
    return;
  }
  persist(tasks, tasks);
  conflict = null;
  message('Synced at ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '.');
}

function resolve(keepLocal) {
  return run(async () => {
    const remote = await api('tasks');
    const tasks = taskList(remote.tasks);
    const edits = changes(state.base, state.draft);
    const detected = merge(tasks, edits);
    if (!same(conflict.tasks, tasks)) {
      conflict = { tasks, ids: detected.conflicts };
      if (detected.conflicts.length) {
        message('Cloud tasks changed again. Review the conflicts before choosing a version.');
        return;
      }
    }
    const remoteById = new Map(tasks.map(t => [t.id, t]));
    const problem = new Set(detected.conflicts);
  const resolved = edits.filter(change => keepLocal || !problem.has(change.after.id)).map(change =>
    problem.has(change.after.id) ? { ...change, before: remoteById.get(change.after.id) ?? null } : change);
    persist(tasks, merge(tasks, resolved).tasks);
    conflict = null;
    await sync();
  });
}

function el(tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label, action) {
  const control = el('button', label);
  control.type = 'button';
  control.onclick = action;
  control.disabled = busy;
  return control;
}

function render() {
  $('login').hidden = signedIn;
  $('cloud').hidden = !signedIn;
  $('login-submit').disabled = $('capture-submit').disabled = $('sync').disabled = $('logout').disabled = busy;
  $('restore').disabled = busy;
  $('conflict').hidden = !conflict || !signedIn;
  $('conflict').replaceChildren();
  if (conflict && signedIn) {
    const remote = new Map(conflict.tasks.map(t => [t.id, t]));
    const local = new Map(state.draft.map(t => [t.id, t]));
    const list = el('ul');
    for (const id of conflict.ids) {
      const item = el('li');
      const summary = t => t ? [t.title, t.status, t.project, t.deadline].filter(Boolean).join(' · ') : 'Missing';
      item.append(el('strong', 'This device'), el('p', summary(local.get(id))),
        el('strong', 'Cloud'), el('p', summary(remote.get(id))));
      list.append(item);
    }
    $('conflict').append(list, button('Keep this device’s versions', () => resolve(true)),
      button('Keep cloud versions', () => resolve(false)));
  }

  $('views').replaceChildren();
  for (const name of ['Today', 'All', ...states]) {
    const control = button(name, () => { view = name; render(); });
    control.setAttribute('aria-pressed', String(view === name));
    $('views').append(control);
  }
  $('heading').textContent = view;
  const root = $('tasks');
  root.replaceChildren();
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const tasks = state.draft.filter(t => view === 'All' || (view === 'Today'
    ? t.deadline && t.deadline <= today && !['Done', 'Archived'].includes(t.status) : t.status === view));
  if (!tasks.length) root.append(el('p', 'Nothing in this view.'));
  for (const t of tasks) {
    const row = el('div');
    row.className = 'task';
    const rename = button('Edit', () => {
      const title = prompt('Task title', t.title);
      if (title?.trim()) edit(t.id, { title: title.trim().slice(0, 500) });
    });
    const status = el('select');
    status.setAttribute('aria-label', 'Status');
    for (const name of states) status.append(el('option', name));
    status.value = t.status;
    status.onchange = () => edit(t.id, { status: status.value });

    const date = el('input');
    date.type = 'date';
    date.value = t.deadline;
    date.setAttribute('aria-label', 'Optional deadline');
    date.onchange = () => edit(t.id, { deadline: date.value });

    const project = el('input');
    project.placeholder = 'Project (optional)';
    project.maxLength = 200;
    project.value = t.project;
    project.setAttribute('aria-label', 'Project');
    project.onchange = () => edit(t.id, { project: project.value });

    status.disabled = date.disabled = project.disabled = busy;
    row.append(el('strong', t.title), rename, status, date, project,
      button(t.status === 'Done' ? 'Reopen' : 'Complete',
        () => edit(t.id, { status: t.status === 'Done' ? 'Next action' : 'Done' })));
    root.append(row);
  }
}

$('capture').onsubmit = event => {
  event.preventDefault();
  const title = $('title').value.trim();
  if (!title) return;
  run(() => {
    const time = new Date().toISOString();
    persist(state.base, [...state.draft, { id: crypto.randomUUID(), title, status: 'Inbox', createdAt: time, updatedAt: time }]);
    $('title').value = '';
    message('Saved on this device.');
    scheduleSync();
  });
};

$('login').onsubmit = event => {
  event.preventDefault();
  const ownerKey = $('owner-key').value.trim();
  $('owner-key').value = '';
  run(async () => {
    await api('login', 'POST', { key: ownerKey });
    signedIn = true;
    await sync();
  });
};
$('sync').onclick = () => run(sync);
$('logout').onclick = () => run(async () => {
  if (changes(state.base, state.draft).length) {
    message('Sync your pending changes before signing out. You can also export a backup.');
    return;
  }
  await api('logout', 'POST');
  signedIn = false;
  conflict = null;
  persist([], []);
  localStorage.removeItem(legacyKey);
  message('Signed out and cleared this browser’s planner cache.');
});
$('export').onclick = () => {
  const tasks = read().draft.map(({ version, ...record }) => record);
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, tasks }, null, 2)], { type: 'application/json' }));
  const link = el('a');
  link.href = url;
  link.download = 'planner-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('restore').onchange = () => {
  const file = $('restore').files[0];
  $('restore').value = '';
  if (!file) return;
  run(async () => {
    if (file.size > 2 * 1024 * 1024) throw new Error('Backup is too large.');
    const backup = JSON.parse(await file.text());
    if (backup.version !== 1) throw new Error('Unsupported backup version.');
    const result = merge(state.draft, changes([], taskList(backup.tasks)));
    if (result.conflicts.length) throw new Error('A backup task differs from an existing task with the same ID. No tasks were imported.');
    persist(state.base, result.tasks);
    message('Backup imported.');
    scheduleSync();
  });
};

window.addEventListener('storage', event => {
  if (event.key !== key || busy) return;
  state = read();
  conflict = null;
  render();
});
window.addEventListener('focus', () => { if (signedIn && !conflict) run(sync); });
window.addEventListener('online', () => { if (signedIn && !conflict) run(sync); });

try {
  state = read();
  render();
  // Probe session before uploading local changes.
  run(async () => {
    try { await api('tasks'); } catch (error) {
      if (error.status === 401) message('Sign in to sync. Tasks can be saved on this device.');
      else if (error.status === 503) message(error.message + '. Tasks can be saved on this device.');
      else message('Cloud sync is unavailable. Tasks can be saved on this device.');
      return;
    }
    signedIn = true;
    await sync();
  });
} catch {
  for (const control of document.querySelectorAll('button, input')) control.disabled = true;
  message('Saved planner data could not be read. Changes are disabled.');
}
