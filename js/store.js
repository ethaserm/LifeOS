// The data layer everything else sits on.
//
// localStorage is what renders — instant, works offline, survives a dead connection.
// Firestore is only the sync channel between PC and phone.
//
// Wire format matches what JARVIS already writes, so the old pushup / workout apps
// and Life OS read and write the same documents:
//     users/{uid}/data/{doc}  ->  { fields: { value: { stringValue: "<json>" } } }

import { PROJECT_ID, idToken, uid } from './auth.js';

const LS = 'lifeos:';
const QUEUE_KEY = 'lifeos:queue';
const META_KEY = 'lifeos:meta';

// Documents the OLD apps already own. Their JSON is stored raw with no wrapper,
// exactly as My Routine / the pushup tracker write it. Never reshape these.
const LEGACY = new Set([
  'pushups', 'workoutLog', 'personalBests', 'weightLog',
  'userRoutine', 'restNotes', 'missed', 'photos'
]);

const subs = new Map();          // doc -> Set(fn)
const statusSubs = new Set();
let status = 'local';            // local | syncing | synced | error

// ---------- tiny helpers ----------

const readLS = (k, fb) => {
  try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
  catch { return fb; }
};
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const meta = () => readLS(META_KEY, {});
const setMeta = (doc, ts) => { const m = meta(); m[doc] = ts; writeLS(META_KEY, m); };

function setStatus(s) { status = s; statusSubs.forEach(fn => fn(s)); }
export function onStatus(fn) { statusSubs.add(fn); fn(status); return () => statusSubs.delete(fn); }
export function getStatus() { return status; }

function docUrl(userId, doc) {
  return `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
         `/databases/(default)/documents/users/${userId}/data/${doc}`;
}

// ---------- read / write ----------

export function get(doc, fallback = null) {
  const v = readLS(LS + doc, undefined);
  return v === undefined ? fallback : v;
}

export function set(doc, value) {
  writeLS(LS + doc, value);
  setMeta(doc, Date.now());
  (subs.get(doc) || []).forEach(fn => fn(value));
  queuePush(doc);
  return value;
}

export function onChange(doc, fn) {
  if (!subs.has(doc)) subs.set(doc, new Set());
  subs.get(doc).add(fn);
  return () => subs.get(doc).delete(fn);
}

// Read-modify-write in one step, so two quick taps can't clobber each other.
export function update(doc, fn, fallback = null) {
  return set(doc, fn(get(doc, fallback)));
}

// ---------- the wire format ----------

function encode(doc, value) {
  // Legacy docs go up exactly as the old apps expect. New docs carry their own
  // timestamp so the newer side wins when both devices edited while offline.
  return JSON.stringify(LEGACY.has(doc) ? value : { v: value, u: meta()[doc] || Date.now() });
}

function decode(doc, raw) {
  if (raw == null) return { value: null, stamp: 0 };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { value: null, stamp: 0 }; }
  if (LEGACY.has(doc)) return { value: parsed, stamp: 0 };
  if (parsed && typeof parsed === 'object' && 'v' in parsed) {
    return { value: parsed.v, stamp: Number(parsed.u) || 0 };
  }
  return { value: parsed, stamp: 0 };   // doc written before the wrapper existed
}

// ---------- push (debounced, queued) ----------

const timers = new Map();
const PUSH_DELAY = 1500;

function queuePush(doc) {
  clearTimeout(timers.get(doc));
  timers.set(doc, setTimeout(() => pushDoc(doc), PUSH_DELAY));
}

function pending() { return readLS(QUEUE_KEY, []); }
function addPending(doc) {
  const q = pending();
  if (!q.includes(doc)) { q.push(doc); writeLS(QUEUE_KEY, q); }
}
function clearPending(doc) {
  writeLS(QUEUE_KEY, pending().filter(d => d !== doc));
}

export async function pushDoc(doc) {
  const userId = uid();
  if (!userId) { addPending(doc); return false; }

  const token = await idToken();
  if (!token) { addPending(doc); return false; }

  setStatus('syncing');
  try {
    const res = await fetch(docUrl(userId, doc), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { value: { stringValue: encode(doc, get(doc)) } } })
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    clearPending(doc);
    setStatus('synced');
    return true;
  } catch (err) {
    console.warn('[store] push failed', doc, err.message);
    addPending(doc);
    setStatus('error');
    return false;
  }
}

export async function flushQueue() {
  const q = pending();
  for (const doc of q) await pushDoc(doc);
  return q.length;
}

// ---------- pull ----------

export async function pullDoc(doc, { preferRemote = true } = {}) {
  const userId = uid();
  const token = await idToken();
  if (!userId || !token) return null;

  const res = await fetch(docUrl(userId, doc), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;                    // never written yet
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const raw = (await res.json())?.fields?.value?.stringValue ?? null;
  const { value, stamp } = decode(doc, raw);
  if (value == null) return null;

  const localStamp = meta()[doc] || 0;
  const localHasEdit = pending().includes(doc);

  // A local edit that hasn't reached the cloud yet always wins — it's newer by
  // definition. Otherwise the newer timestamp wins; legacy docs have no stamp,
  // so at boot the cloud copy is treated as the truth.
  if (localHasEdit) return get(doc);
  if (!preferRemote && localStamp > stamp) return get(doc);

  writeLS(LS + doc, value);
  setMeta(doc, stamp || Date.now());
  (subs.get(doc) || []).forEach(fn => fn(value));
  return value;
}

export async function pullAll(docs) {
  if (!uid()) return { ok: false, reason: 'signed-out' };
  setStatus('syncing');
  const out = {};
  try {
    for (const doc of docs) out[doc] = await pullDoc(doc);
    await flushQueue();
    setStatus('synced');
    return { ok: true, docs: out };
  } catch (err) {
    console.warn('[store] pull failed', err.message);
    setStatus('error');
    return { ok: false, reason: err.message };
  }
}

// Every doc Life OS knows about. Existing ones first — those hold real history.
export const DOCS = [
  'pushups', 'workoutLog', 'personalBests', 'weightLog', 'userRoutine', 'restNotes', 'missed',
  'habits', 'focus', 'screentime', 'sleep', 'money', 'tasks',
  'projects', 'watched', 'learning', 'calendar', 'settings'
];

// Flush anything stranded the moment we're back online.
window.addEventListener('online', () => { flushQueue(); });
