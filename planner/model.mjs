export const states = ['Inbox', 'Next action', 'In progress', 'Scheduled', 'Waiting', 'Delegated', 'Done', 'Archived'];
export const maxBytes = 524288;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const utf8 = new TextEncoder();

function iso(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export const responsibilities = ['', 'Me', 'ChatGPT', 'Collaborative', 'Someone else'];
export const commitmentTypes = ['flexible', 'fixed'];
export const areas = ['', 'Personal', 'Hangar47', 'Personal Training'];
const dateValid = value => value === '' || (typeof value === 'string' && iso(value + 'T00:00:00.000Z'));
const shortText = (value, limit) => typeof value === 'string' && value.length <= limit;
const linkValid = value => {
  if (value === '') return true;
  if (!shortText(value, 2048)) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
};

export function task(value) {
  const { id, title, status, project = '', deadline = '', createdAt, updatedAt, version, plannedDate = '', durationMinutes = null, responsibility = '', commitmentType = 'flexible', area = '', notes = '', progressNotes = '', conversationUrl = '', resourceUrl = '' } = value ?? {};
  if (!uuid.test(id) || typeof id !== 'string' || typeof title !== 'string' || !title.trim()
    || title.length > 500 || !states.includes(status) || typeof project !== 'string' || project.length > 200
    || (deadline !== '' && (typeof deadline !== 'string' || !iso(deadline + 'T00:00:00.000Z')))
    || !dateValid(plannedDate)
    || (durationMinutes !== null && (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080))
    || !responsibilities.includes(responsibility) || !commitmentTypes.includes(commitmentType) || !areas.includes(area)
    || !shortText(notes, 4000) || !shortText(progressNotes, 4000)
    || !linkValid(conversationUrl) || !linkValid(resourceUrl)
    || (createdAt !== undefined && !iso(createdAt)) || (updatedAt !== undefined && !iso(updatedAt))
    || (version !== undefined && (!Number.isSafeInteger(version) || version < 1))) {
    throw new Error('Invalid task');
  }
  return { id, title, status, project, deadline, createdAt, updatedAt, version, plannedDate, durationMinutes, responsibility, commitmentType, area, notes, progressNotes, conversationUrl, resourceUrl };
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
  for (const edit of edits) {
    let { before, after } = edit;
    const remote = byId.get(after.id) ?? null;
    if (remote && edit.preserveFields?.length) {
      before = { ...before, ...Object.fromEntries(edit.preserveFields.map(field => [field, remote[field]])) };
      after = { ...after, ...Object.fromEntries(edit.preserveFields.map(field => [field, remote[field]])) };
    }
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
