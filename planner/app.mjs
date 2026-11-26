import { changes, merge, same, states, responsibilities, commitmentTypes, areas, taskList } from './model.mjs';

const $ = id => document.getElementById(id);
const key = 'personal-planner-sync-v1';
const legacyKey = 'personal-planner-prototype-v1';
let state;
let view = 'Today';
let scope = 'All';
const expanded = new Set();
const expandedProjects = new Set();
const expandedSections = new Set();
let signedIn = false;
let busy = false;
let editQueue = Promise.resolve();
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

for (const control of document.querySelectorAll('.copy-routine')) {
  control.addEventListener('click', async () => {
    const prompt = $(control.dataset.prompt);
    const status = $('routine-status');
    try {
      await navigator.clipboard.writeText(prompt.value);
      status.textContent = 'Prompt copied. Open your Personal Planner project in ChatGPT and paste it into a conversation.';
    } catch {
      prompt.closest('details').open = true;
      prompt.focus();
      prompt.select();
      status.textContent = 'Clipboard access is unavailable. The prompt is selected below so you can copy it manually.';
    }
  });
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
  editQueue = editQueue.then(async () => {
    while (busy) await new Promise(resolve => setTimeout(resolve, 10));
    await run(() => {
      const draft = state.draft.map(t => t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t);
      persist(state.base, draft);
      message('Saved on this device.');
      scheduleSync();
    });
  }).catch(error => message(error.message || 'Planner could not save this change.'));
  return editQueue;
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

function todayKey(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function taskScope(task) {
  if (task.area) return task.area;
  const project = task.project.toLowerCase();
  if (/hangar\s*47|h47/.test(project)) return 'Hangar47';
  if (/personal\s*training|training|pt client/.test(project)) return 'Personal Training';
  if (/personal/.test(project)) return 'Personal';
  return 'Uncategorised';
}

function renderTask(task) {
  const row = el('article');
  row.className = 'task';
  row.dataset.taskId = task.id;
  const status = el('select');
  status.setAttribute('aria-label', 'Status');
  for (const name of states) status.append(el('option', name));
  status.value = task.status;
  status.onchange = () => edit(task.id, { status: status.value });

  const deadline = el('input');
  deadline.type = 'date'; deadline.value = task.deadline;
  deadline.setAttribute('aria-label', 'Optional deadline');
  deadline.onchange = () => edit(task.id, { deadline: deadline.value });

  const project = el('input');
  project.placeholder = 'Project (optional)'; project.maxLength = 200; project.value = task.project;
  project.setAttribute('aria-label', 'Project');
  project.onchange = () => edit(task.id, { project: project.value });
  status.disabled = deadline.disabled = project.disabled = busy;

  const details = el('details');
  details.className = 'task-details'; details.open = expanded.has(task.id);
  details.ontoggle = () => { if (details.open) expanded.add(task.id); else expanded.delete(task.id); };
  details.append(el('summary', 'Planning and notes'));
  const field = (label, control) => {
    const wrapper = el('label', label);
    control.setAttribute('aria-label', label); wrapper.append(control); details.append(wrapper);
    control.disabled = busy; return control;
  };
  const input = (label, name, type = 'text', limit = 2048) => {
    const control = field(label, el('input')); control.type = type;
    if (type === 'text' || type === 'url') control.maxLength = limit;
    control.value = task[name] ?? '';
    if (type === 'number') { control.min = '1'; control.max = '10080'; control.step = '1'; }
    control.onchange = () => {
      if (!control.reportValidity()) return;
      edit(task.id, { [name]: type === 'number' ? (control.value === '' ? null : Number(control.value)) : control.value.trim() });
    };
    return control;
  };
  const select = (label, name, values) => {
    const control = field(label, el('select'));
    for (const value of values) { const option = el('option', value || 'Unspecified'); option.value = value; control.append(option); }
    control.value = task[name]; control.onchange = () => edit(task.id, { [name]: control.value });
  };
  const note = (label, name) => {
    const control = field(label, el('textarea')); control.maxLength = 4000; control.rows = 3;
    control.value = task[name]; control.onchange = () => edit(task.id, { [name]: control.value });
  };
  input('Planned working date', 'plannedDate', 'date');
  input('Estimated minutes (optional)', 'durationMinutes', 'number');
  select('Responsibility', 'responsibility', responsibilities);
  select('Commitment type', 'commitmentType', commitmentTypes);
  select('Area', 'area', areas);
  note('Task notes', 'notes'); note('Progress notes', 'progressNotes');
  for (const [label, name] of [['Conversation link', 'conversationUrl'], ['Resource link', 'resourceUrl']]) {
    input(label, name, 'url');
    if (task[name]) { const link = el('a', 'Open ' + label.toLowerCase()); link.href = task[name]; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link); }
  }
  const main = el('div'); main.className = 'task-main';
  main.append(el('strong', task.title));
  const badges = el('div'); badges.className = 'task-meta';
  badges.append(el('span', task.status));
  if (task.responsibility) { const badge = el('span', task.responsibility); badge.className = 'badge ' + (task.responsibility === 'ChatGPT' ? 'chatgpt' : ''); badges.append(badge); }
  { const badge = el('span', task.commitmentType === 'fixed' ? 'Fixed commitment' : 'Flexible'); badge.className = 'badge' + (task.commitmentType === 'fixed' ? ' fixed' : ''); badges.append(badge); }
  if (task.plannedDate) badges.append(el('span', 'Planned ' + task.plannedDate));
  if (task.deadline) badges.append(el('span', 'Deadline ' + task.deadline));
  if (task.durationMinutes) badges.append(el('span', task.durationMinutes + ' min'));
  main.append(badges);
  main.append(button('Edit title', () => {
    const title = prompt('Task title', task.title);
    if (title?.trim()) edit(task.id, { title: title.trim().slice(0, 500) });
  }));
  main.append(status, deadline, project, button(task.status === 'Done' ? 'Reopen' : 'Complete',
    () => edit(task.id, { status: task.status === 'Done' ? 'Next action' : 'Done' })));
  row.append(main, details);
  return row;
}

function taskListInto(container, tasks, emptyMessage = 'Nothing here.') {
  if (!tasks.length) { container.append(el('p', emptyMessage)); return; }
  for (const task of tasks) container.append(renderTask(task));
}

function section(title, tasks, options = {}) {
  const wrapper = el(options.collapsible ? 'details' : 'section');
  wrapper.className = 'dashboard-section' + (options.className ? ' ' + options.className : '');
  if (options.collapsible) {
    wrapper.dataset.section = title; wrapper.open = expandedSections.has(title);
    wrapper.ontoggle = () => { if (wrapper.open) expandedSections.add(title); else expandedSections.delete(title); };
    const summary = el('summary', title + ' · ' + tasks.length);
    wrapper.append(summary);
  } else {
    const heading = el('h2', title); wrapper.append(heading);
    if (options.description) wrapper.append(el('p', options.description));
  }
  const list = el('div'); list.className = 'task-list';
  taskListInto(list, tasks, options.emptyMessage);
  wrapper.append(list);
  return wrapper;
}

function render() {
  const activeElement = document.activeElement;
  const focusRef = activeElement && activeElement !== document.body ? {
    id: activeElement.id, taskId: activeElement.closest?.('.task')?.dataset.taskId,
    label: activeElement.getAttribute?.('aria-label'), tag: activeElement.tagName, value: 'value' in activeElement ? activeElement.value : undefined
  } : null;
  const scrollY = window.scrollY;
  for (const details of document.querySelectorAll('.task-details')) {
    const id = details.closest('.task')?.dataset.taskId;
    if (id) { if (details.open) expanded.add(id); else expanded.delete(id); }
  }
  for (const card of document.querySelectorAll('.project-card')) {
    if (card.dataset.project) { if (card.open) expandedProjects.add(card.dataset.project); else expandedProjects.delete(card.dataset.project); }
  }
  for (const details of document.querySelectorAll('.dashboard-section[data-section]')) {
    if (details.open) expandedSections.add(details.dataset.section); else expandedSections.delete(details.dataset.section);
  }
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
      item.append(el('strong', 'This device'), el('pre', summary(local.get(id))), el('strong', 'Cloud'), el('pre', summary(remote.get(id))));
      list.append(item);
    }
    $('conflict').append(list, button('Keep this device’s versions', () => resolve(true)), button('Keep cloud versions', () => resolve(false)));
  }

  $('views').replaceChildren();
  for (const name of ['Today', 'Upcoming', 'Projects', 'Inbox', 'In progress']) {
    const control = button(name, () => { view = name; render(); });
    control.setAttribute('aria-pressed', String(view === name));
    $('views').append(control);
  }
  const filter = $('scope-filters'); filter.replaceChildren();
  for (const name of ['All', 'Personal', 'Hangar47', 'Personal Training']) {
    const control = button(name, () => { scope = name; render(); });
    control.setAttribute('aria-pressed', String(scope === name));
    filter.append(control);
  }
  const root = $('tasks'); root.replaceChildren();
  const today = todayKey();
  const tomorrow = todayKey(1);
  const visible = state.draft.filter(t => t.status !== 'Archived');
  const scoped = visible.filter(t => scope === 'All' || taskScope(t) === scope);
  const active = scoped.filter(t => t.status !== 'Done');
  const focus = active.filter(t => t.plannedDate === today || (t.deadline && t.deadline <= today));
  const waiting = active.filter(t => t.status === 'Waiting');
  const tomorrowTasks = active.filter(t => t.plannedDate === tomorrow || t.deadline === tomorrow);
  const knownMinutes = focus.reduce((total, task) => total + (task.durationMinutes || 0), 0);
  const inFocus = el('section'); inFocus.className = 'focus-panel';
  inFocus.append(el('p', 'TODAY’S FOCUS'), el('h2', `${focus.length} ${focus.length === 1 ? 'priority' : 'priorities'}`));
  const durationLabel = knownMinutes < 60 ? `${knownMinutes}m` : `${Math.floor(knownMinutes / 60)}h${knownMinutes % 60 ? ` ${knownMinutes % 60}m` : ''}`;
  inFocus.append(el('p', knownMinutes ? `Known task time: ${durationLabel}` : 'Task durations are not set for today.'));
  taskListInto(inFocus, focus, 'No tasks are planned for today or past their deadline.');
  const preview = el('section'); preview.className = 'focus-panel tomorrow-panel';
  preview.append(el('h2', 'Tomorrow'), el('p', `${tomorrowTasks.length} planned or due · deadlines stay separate from planned work`));
  taskListInto(preview, tomorrowTasks, 'Nothing planned for or due tomorrow.');
  if (view === 'Today') {
    const top = el('div'); top.className = 'focus-layout'; top.append(inFocus, preview); root.append(top);
    root.append(section('Waiting for Others', waiting, { emptyMessage: 'Nothing is waiting for someone else.' }));
    const scheduled = new Set([...focus, ...waiting, ...tomorrowTasks].map(t => t.id));
    root.append(section('Unscheduled', active.filter(t => !t.plannedDate && !t.deadline && !scheduled.has(t.id) && !['Inbox', 'Next action'].includes(t.status)), { collapsible: true }));
    root.append(section('Backlog', active.filter(t => t.status === 'Inbox' || t.status === 'Next action').filter(t => !scheduled.has(t.id)), { collapsible: true }));
  } else if (view === 'Upcoming') {
    const upcoming = active.filter(t => (t.plannedDate > today || t.deadline > today) && t.plannedDate !== today && t.deadline !== today);
    root.append(section('Upcoming', upcoming, { description: 'Planned dates show intended work; deadlines remain actual due dates.' }));
    root.append(section('Waiting for Others', waiting));
  } else if (view === 'Inbox') {
    root.append(section('Inbox', active.filter(t => t.status === 'Inbox')));
  } else if (view === 'In progress') {
    root.append(section('In Progress', active.filter(t => t.status === 'In progress')));
  } else if (view === 'Projects') {
    const groups = new Map();
    for (const task of scoped) { const name = task.project.trim() || 'No project'; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(task); }
    if (!groups.size) root.append(el('p', 'No active projects yet. Add a project name to a task to group it here.'));
    for (const [name, tasks] of groups) {
      const card = el('details'); card.className = 'project-card'; card.dataset.project = name; card.open = expandedProjects.has(name);
      card.ontoggle = () => { if (card.open) expandedProjects.add(name); else expandedProjects.delete(name); };
      const activeCount = tasks.filter(t => t.status !== 'Done').length;
      const summary = el('summary', `${name} · ${activeCount} active`);
      card.append(summary);
      const progress = el('p', `${tasks.filter(t => t.status === 'Done').length} complete · ${tasks.filter(t => t.status === 'In progress').length} in progress`);
      card.append(progress);
      for (const task of tasks) card.append(renderTask(task));
      root.append(card);
    }
  }
  if (focusRef) {
    let candidate = focusRef.id ? document.getElementById(focusRef.id) : null;
    if (!candidate && focusRef.taskId && focusRef.label) {
      candidate = [...document.querySelectorAll('.task[data-task-id]')].find(row => row.dataset.taskId === focusRef.taskId)?.querySelectorAll('[aria-label]');
      candidate = candidate ? [...candidate].find(control => control.getAttribute('aria-label') === focusRef.label && control.tagName === focusRef.tag) : null;
    }
    if (candidate && !candidate.disabled) {
      if (focusRef.value !== undefined && candidate.value !== focusRef.value) candidate.value = focusRef.value;
      candidate.focus({ preventScroll: true });
    }
    window.scrollTo(0, scrollY);
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
