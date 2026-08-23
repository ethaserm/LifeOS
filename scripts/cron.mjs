// Runs hourly in GitHub Actions. Two jobs:
//
//   1. Every run: fetch the secret Google iCal URL, expand today's events, write
//      them to the `calendar` doc. Browsers can't fetch that URL directly (no
//      CORS headers) and committing it to a public repo would expose the
//      calendar, so it goes into Firestore where only the signed-in user reads it.
//
//   2. At the configured hour, UK local: work out what's still outstanding today
//      and push a notification if anything is. Silent when the day is clear.
//
// Auth reuses the same refresh token the island and JARVIS use. All secrets come
// from the repo's Actions secrets, never from a committed file.

const API_KEY = process.env.FIREBASE_API_KEY;
const REFRESH_TOKEN = process.env.FIREBASE_REFRESH_TOKEN;
const UID = process.env.FIREBASE_UID;
const ICAL_URL = process.env.GOOGLE_ICAL_URL;
const FCM_KEY = process.env.FCM_SERVER_KEY;
const FORCE = process.env.FORCE_REMINDER === 'true';
const PROJECT = 'workouttracker-17830';

const LEGACY = new Set(['pushups', 'workoutLog', 'personalBests', 'weightLog', 'userRoutine', 'restNotes', 'missed', 'photos']);

function ukNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

async function idToken() {
  const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(REFRESH_TOKEN)}`
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  return (await res.json()).id_token;
}

const docUrl = doc =>
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/users/${UID}/data/${doc}`;

async function pull(token, doc) {
  const res = await fetch(docUrl(doc), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pull ${doc} failed: ${res.status}`);
  const raw = (await res.json())?.fields?.value?.stringValue;
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (LEGACY.has(doc)) return parsed;
  return parsed && typeof parsed === 'object' && 'v' in parsed ? parsed.v : parsed;
}

async function push(token, doc, value) {
  const payload = LEGACY.has(doc) ? value : { v: value, u: Date.now() };
  const res = await fetch(docUrl(doc), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { value: { stringValue: JSON.stringify(payload) } } })
  });
  if (!res.ok) throw new Error(`push ${doc} failed: ${res.status}`);
}

// ---------------------------------------------------------------------------
// iCal: only what's needed for "what's on today" — SUMMARY, DTSTART, DTEND, and
// simple daily/weekly RRULEs. Anything more exotic is skipped rather than
// guessed at, since a wrong event is worse than a missing one.
// ---------------------------------------------------------------------------

function unfold(text) { return text.replace(/\r\n[ \t]/g, '').split(/\r?\n/); }

function parseICalDate(value) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh = '00', mm = '00'] = m;
  return { date: `${y}-${mo}-${d}`, time: `${hh}:${mm}`, allDay: !m[4] };
}

function parseEvents(ical, todayStr) {
  const lines = unfold(ical);
  const events = [];
  let cur = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { cur = {}; continue; }
    if (line.startsWith('END:VEVENT')) { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    const val = line.slice(idx + 1);
    const name = key.split(';')[0];

    if (name === 'SUMMARY') cur.summary = val;
    else if (name === 'DTSTART') cur.start = parseICalDate(val);
    else if (name === 'DTEND') cur.end = parseICalDate(val);
    else if (name === 'RRULE') cur.rrule = val;
  }

  const today = new Date(todayStr + 'T12:00:00Z');
  const todayDow = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][today.getUTCDay()];

  return events.filter(e => {
    if (!e.start) return false;
    if (e.start.date === todayStr) return true;
    if (!e.rrule) return false;
    if (e.start.date > todayStr) return false;

    const until = e.rrule.match(/UNTIL=(\d{8})/);
    if (until) {
      const u = `${until[1].slice(0, 4)}-${until[1].slice(4, 6)}-${until[1].slice(6, 8)}`;
      if (todayStr > u) return false;
    }
    if (/FREQ=DAILY/.test(e.rrule)) return true;
    if (/FREQ=WEEKLY/.test(e.rrule)) {
      const byday = e.rrule.match(/BYDAY=([^;]+)/);
      if (byday) return byday[1].split(',').some(d => d.replace(/[-\d]/g, '') === todayDow);
      const startDow = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][new Date(e.start.date + 'T12:00:00Z').getUTCDay()];
      return startDow === todayDow;
    }
    return false;
  }).map(e => ({
    title: e.summary || '(no title)',
    time: e.start.allDay ? null : e.start.time,
    allDay: e.start.allDay
  })).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}

async function syncCalendar(token, today) {
  if (!ICAL_URL) { console.log('calendar: no GOOGLE_ICAL_URL secret, skipping'); return; }
  const res = await fetch(ICAL_URL);
  if (!res.ok) { console.log(`calendar: fetch failed ${res.status}`); return; }
  const events = parseEvents(await res.text(), today);
  await push(token, 'calendar', { date: today, events, syncedAt: Date.now() });
  console.log(`calendar: ${events.length} events for ${today}`);
}

// ---------------------------------------------------------------------------
// Reminder
// ---------------------------------------------------------------------------

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

async function buildOutstanding(token, today) {
  const [pushups, tasks, habits, workoutLog, routine, sleep] = await Promise.all(
    ['pushups', 'tasks', 'habits', 'workoutLog', 'userRoutine', 'sleep'].map(d => pull(token, d).catch(() => null))
  );

  const out = [];

  const goal = parseInt(pushups?.['pushups_goal'] ?? '50', 10);
  const done = parseInt(pushups?.[`pushups_${today}`] ?? '0', 10);
  if (done < goal) out.push(`pushups ${done}/${goal}`);

  const openTasks = (tasks || []).filter(t => !t.done && (!t.due || t.due <= today));
  if (openTasks.length) out.push(`${openTasks.length} task${openTasks.length > 1 ? 's' : ''} open`);

  if (habits?.items?.length) {
    const doneToday = (habits.done?.[today] || []).length;
    if (doneToday < habits.items.length) out.push(`habits ${doneToday}/${habits.items.length}`);
  }

  // Only nags about training on a day the routine actually schedules one.
  const dow = DAY_KEYS[new Date(today + 'T12:00:00Z').getUTCDay()];
  const scheduled = routine?.[dow];
  if (scheduled?.length) {
    const trained = (workoutLog || []).some(s => s.date === today);
    if (!trained) out.push('workout not logged');
  }

  if (!sleep?.[today]) out.push('sleep not logged');

  return out;
}

async function sendPush(token, items) {
  const tokens = (await pull(token, 'pushTokens').catch(() => null)) || [];
  if (!tokens.length) { console.log('reminder: no device tokens registered yet'); return; }
  if (!FCM_KEY) { console.log('reminder: no FCM_SERVER_KEY secret set'); return; }

  const body = items.join(' · ');
  for (const t of tokens) {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: { Authorization: `key=${FCM_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: t, notification: { title: 'Life OS', body }, webpush: { fcm_options: { link: 'https://ethaserm.github.io/LifeOS/' } } })
    });
    console.log(`reminder: push -> ${res.status}`);
  }
}

async function main() {
  if (!API_KEY || !REFRESH_TOKEN || !UID) {
    console.log('Missing Firebase secrets — set FIREBASE_API_KEY, FIREBASE_REFRESH_TOKEN, FIREBASE_UID.');
    process.exit(0);
  }

  const token = await idToken();
  const { date: today, hour } = ukNow();
  console.log(`UK time: ${today} ${hour}:00`);

  await syncCalendar(token, today);

  const settings = (await pull(token, 'settings').catch(() => null)) || {};
  const reminderHour = settings.reminderHour ?? 20;
  const reminderOn = settings.reminderOn !== false;

  if (!FORCE && (!reminderOn || hour !== reminderHour)) {
    console.log(`reminder: not the hour (want ${reminderHour}, on=${reminderOn})`);
    return;
  }

  const outstanding = await buildOutstanding(token, today);
  if (!outstanding.length) { console.log('reminder: day is clear, staying quiet'); return; }

  console.log('reminder: outstanding ->', outstanding.join(', '));
  await sendPush(token, outstanding);
}

main().catch(err => { console.error(err); process.exit(1); });
