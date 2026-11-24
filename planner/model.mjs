export const states = ['Inbox', 'Next action', 'Scheduled', 'Waiting', 'Delegated', 'Done', 'Archived'];
export const maxBytes = 524288;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const utf8 = new TextEncoder();

function iso(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function task(value) {
  const { id, title, status, project = '', deadline = '', createdAt, updatedAt, version } = value ?? {};
  if (!uuid.test(id) || typeof id !== 'string' || typeof title !== 'string' || !title.trim()
    || title.length > 500 || !states.includes(status) || typeof project !== 'string' || project.length > 200
    || (deadline !== '' && (typeof deadline !== 'string' || !iso(deadline + 'T00:00:00.000Z')))
    || (createdAt !== undefined && !iso(createdAt)) || (updatedAt !== undefined && !iso(updatedAt))
    || (version !== undefined && (!Number.isSafeInteger(version) || version < 1))) {
    throw new Error('Invalid task');
  }
  return { id, title, status, project, deadline, createdAt, updatedAt, version };
}

export function taskList(values) {
  if (!Array.isArray(values) || values.length > 1000) throw new Error('Limit of 1,000 tasks');
  const tasks = values.map(task);
  if (new Set(tasks.map(t => t.id)).size !== tasks.length) throw new Error('Duplicate task IDs');
  if (utf8.encode(JSON.stringify(tasks)).length > maxBytes) throw new Error('Planner storage limit reached');
  return tasks;
}

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function changes(base, draft) {
  const original = new Map(base.map(t => [t.id, t]));
  return draft.filter(t => !same(t, original.get(t.id)))
    .map(after => ({ before: original.get(after.id) ?? null, after }));
}

export function merge(current, edits, version) {
  const byId = new Map(current.map(t => [t.id, t]));
  const conflicts = [];
  let changed = false;
  for (const { before, after } of edits) {
    const remote = byId.get(after.id) ?? null;
    if (remote && same({ ...remote, version: undefined }, { ...after, version: undefined })) continue;
    if (!same(remote, before)) {
      conflicts.push(after.id);
      continue;
    }
    byId.set(after.id, version === undefined ? after : { ...after, version });
    changed = true;
  }
  return { tasks: [...byId.values()], conflicts, changed };
}
