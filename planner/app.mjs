import { changes, merge, same, states, responsibilities, commitmentTypes, taskList } from './model.mjs';

const $ = id => document.getElementById(id);
const key = 'personal-planner-sync-v1';
const legacyKey = 'personal-planner-prototype-v1';
let state;
let view = 'Inbox';
const expanded = new Set();
let signedIn = false;
let busy = false;
let conflict = null;
let timer;
let lastAttempt = 0;
let probeAllowed = true;
let syncRequested = false;
const connectionRequest=new URLSearchParams(location.search).get('connect_request');
let approvalLoaded=false;
let approvalReady=false;
if(connectionRequest) $('login').closest('details').open=true;
async function loadApproval() {
  const {pending}=await api('connectors?request='+encodeURIComponent(connectionRequest));
  if(!pending) {message('Connection request expired. Restart Connect from ChatGPT.');return;}
  $('oauth-permission').value=pending.permission;
  $('oauth-permission').querySelector('[value="write"]').disabled=pending.permission!=='write';
  approvalReady=true;
  $('oauth-approval').hidden=false;
  $('oauth-approval').closest('details').open=true;
}

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
  finally { busy = false; render(); if (syncRequested) { syncRequested = false; scheduleSync(); } }
}

function scheduleSync(force = false) {
  clearTimeout(timer);
  if ((!signedIn && !probeAllowed) || conflict || !navigator.onLine) return;
  timer = setTimeout(() => {
    if (busy) { syncRequested = true; return; }
    run(sync);
  }, force ? 650 : Math.max(650, 5000 - (Date.now() - lastAttempt)));
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
  if (response.status === 401) { signedIn = false; probeAllowed = false; }
  if (!response.ok && response.status !== 409) {
    const error = new Error(data.error ?? 'Cloud request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

async function sync() {
  lastAttempt = Date.now();
  // Never upload pending edits before establishing the current session.
  if (!signedIn) { await api('tasks'); signedIn = true; probeAllowed = true; }
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
  $('connector-settings').hidden = !signedIn;
  $('oauth-approval').hidden=!signedIn||!approvalReady;
  if(signedIn&&connectionRequest&&!approvalLoaded) {approvalLoaded=true;void loadApproval().catch(e=>message(e.message));}
  if (!signedIn) { $('connector-key').value=''; $('connector-key-label').hidden=true; $('connector-reveal').hidden=true; }
  $('account-status').textContent = signedIn ? 'Signed in · automatic sync enabled' : 'Sign in to sync across devices';
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
      const summary = t => t ? JSON.stringify(t, null, 2) : 'Missing';
      item.append(el('strong', 'This device'), el('pre', summary(local.get(id))),
        el('strong', 'Cloud'), el('pre', summary(remote.get(id))));
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
    ? !['Done', 'Archived'].includes(t.status) && (t.plannedDate === today || (t.deadline && t.deadline <= today)) : t.status === view));
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
    const details = el('details');
    details.className = 'task-details';
    details.open = expanded.has(t.id);
    details.ontoggle = () => { if (details.open) expanded.add(t.id); else expanded.delete(t.id); };
    details.append(el('summary', 'Planning and notes'));
    const field = (label, control) => {
      const wrapper = el('label', label);
      control.setAttribute('aria-label', label);
      wrapper.append(control);
      details.append(wrapper);
      control.disabled = busy;
      return control;
    };
    const input = (label, name, type = 'text', limit = 2048) => {
      const control = field(label, el('input'));
      control.type = type;
      if (type === 'text' || type === 'url') control.maxLength = limit;
      control.value = t[name] ?? '';
      if (type === 'number') { control.min = '1'; control.max = '10080'; control.step = '1'; }
      control.onchange = () => {
        if (!control.reportValidity()) return;
        edit(t.id, { [name]: type === 'number' ? (control.value === '' ? null : Number(control.value)) : control.value.trim() });
      };
      return control;
    };
    const select = (label, name, values) => {
      const control = field(label, el('select'));
      for (const value of values) { const option = el('option', value || 'Unspecified'); option.value = value; control.append(option); }
      control.value = t[name];
      control.onchange = () => edit(t.id, { [name]: control.value });
    };
    const note = (label, name) => {
      const control = field(label, el('textarea'));
      control.maxLength = 4000;
      control.rows = 3;
      control.value = t[name];
      control.onchange = () => edit(t.id, { [name]: control.value });
    };
    input('Planned working date', 'plannedDate', 'date');
    input('Estimated minutes (optional)', 'durationMinutes', 'number');
    select('Responsibility', 'responsibility', responsibilities);
    select('Commitment type', 'commitmentType', commitmentTypes);
    note('Task notes', 'notes');
    note('Progress notes', 'progressNotes');
    for (const [label, name] of [['Conversation link', 'conversationUrl'], ['Resource link', 'resourceUrl']]) {
      input(label, name, 'url');
      if (t[name]) { const link = el('a', 'Open ' + label.toLowerCase()); link.href = t[name]; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link); }
    }
    row.append(el('strong', t.title), rename, status, date, project,
      button(t.status === 'Done' ? 'Reopen' : 'Complete',
        () => edit(t.id, { status: t.status === 'Done' ? 'Next action' : 'Done' })));
    row.append(details);
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
    probeAllowed = true;
    await sync();
  });
};
$('sync').onclick = () => run(sync);
for(const [id,approved] of [['oauth-allow',true],['oauth-deny',false]]) $(id).onclick=()=>run(async()=>{
  const response=await api('connectors','POST',{request_id:connectionRequest,approved,permission:$('oauth-permission').value});
  location.assign(response.redirectUrl);
});
$('connector-create').onclick = () => run(async () => {
  const response=await api('connectors','POST',{permission:$('connector-permission').value});
  $('connector-key').value=response.key;
  $('connector-key').type='password';
  $('connector-key-label').hidden=false;
  $('connector-reveal').hidden=false;
  $('connector-status').textContent='Key created for an advanced integration. ChatGPT connects through the Personal Planner plugin instead.';
});
$('connector-reveal').onclick = () => { $('connector-key').type=$('connector-key').type==='password'?'text':'password'; };
$('connector-check').onclick=async()=>{
 const control=$('connector-check');control.disabled=true;
 try {
   const {connection}=await api('connectors');
   $('connector-health').textContent=connection.active?'Planner has issued a ChatGPT connection.':'ChatGPT has not completed a connection with Planner.';
   $('connector-diagnostics').textContent=[connection.lastRequestAt?'Last unfinished request: '+connection.lastRequestAt:'',connection.lastApprovalAt?'Last unexchanged approval: '+connection.lastApprovalAt:'',...connection.events.map(e=>e.at+' — '+e.stage+(e.reason?' ('+e.reason+')':''))].filter(Boolean).join('\n')||'No recent connection steps recorded. Restart Connect from Personal Planner Bridge.';
 }catch(e){$('connector-health').textContent=e.message;}
 finally{control.disabled=false;}
};
$('connector-revoke').onclick = () => run(async () => {
  await api('connectors','DELETE');
  $('connector-key').value=''; $('connector-key-label').hidden=true; $('connector-reveal').hidden=true;
  $('connector-status').textContent='Connection keys revoked. Your owner login and tasks are unchanged.';
});
$('logout').onclick = () => run(async () => {
  if (changes(state.base, state.draft).length) {
    message('Sync your pending changes before signing out. You can also export a backup.');
    return;
  }
  await api('logout', 'POST');
  signedIn = false;
  probeAllowed = false;
  syncRequested = false;
  clearTimeout(timer);
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
function resume() { if (!document.hidden && Date.now() - lastAttempt >= 5000) scheduleSync(); }
window.addEventListener('focus', resume);
document.addEventListener('visibilitychange', resume);
window.addEventListener('online', () => scheduleSync(true));
// Pick up assistant/other-device edits even when this tab stays open.
// Visible signed-in tabs poll at most once a minute; existing locks serialize edits.
setInterval(() => { if (signedIn) resume(); }, 60000);

try {
  state = read();
  render();
  // Probe session before uploading local changes.
  run(async () => {
    lastAttempt = Date.now();
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
