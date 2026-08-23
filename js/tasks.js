// To-do engine. Kept deliberately simple for P1: due date + project tag, no
// repeat rules yet — a task engine that mishandles recurrence is worse than one
// that doesn't have it, so that's a follow-up once there's real usage to test against.
//
// "Rollover" isn't a scheduled job that mutates due dates — it's just a query.
// A task with no due date, or a due date on or before today, counts as outstanding
// until it's done. That can't silently lose a task the way a cron-style bump could.

import { dayKey } from './ui.js';

const DOC = 'tasks';

export function all(store) { return store.get(DOC, []) || []; }

export function add(store, { text, due = null, project = null }) {
  const task = { id: Date.now(), text: text.trim(), done: false, due, project, createdAt: Date.now() };
  store.update(DOC, list => [...(list || []), task], []);
  return task;
}

export function toggle(store, id) {
  store.update(DOC, list => (list || []).map(t => t.id === id ? { ...t, done: !t.done } : t), []);
}

export function remove(store, id) {
  store.update(DOC, list => (list || []).filter(t => t.id !== id), []);
}

export function outstanding(store, today = dayKey()) {
  return all(store).filter(t => !t.done && (!t.due || t.due <= today));
}

export function forToday(store, today = dayKey()) {
  return all(store).filter(t => t.due === today);
}
