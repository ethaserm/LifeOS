// Builds the data pack sent with every AI question.
//
// This is a SUMMARY, never a raw dump. JARVIS's whole quota problem came from
// resending everything on every call; the fix was doing the arithmetic in plain
// code first so the model only ever sees small, already-computed facts.
//
// Everything here is derived locally from the same docs the tabs render, so the
// AI can never claim a number the app itself doesn't show.

import { dayKey, addDays } from '../ui.js';

const P = 'pushups_';
const num = (v, fb = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };
const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;

function pushupSummary(store) {
  const blob = store.get('pushups', {}) || {};
  const days = Object.entries(blob).filter(([k]) => k !== P + 'goal');
  if (!days.length) return null;

  const byDay = Object.fromEntries(days.map(([k, v]) => [k.slice(P.length), num(v, 0)]));
  const last = n => {
    let total = 0;
    for (let i = 0; i < n; i++) total += byDay[addDays(dayKey(), -i)] || 0;
    return total;
  };
  const values = Object.values(byDay);
  return {
    goal: num(blob[P + 'goal'], 50),
    today: byDay[dayKey()] || 0,
    last7: last(7),
    last30: last(30),
    allTime: values.reduce((s, v) => s + v, 0),
    bestDay: Math.max(...values),
    daysLogged: values.length
  };
}

function workoutSummary(store) {
  const log = store.get('workoutLog', []) || [];
  if (!log.length) return null;
  const cutoff30 = addDays(dayKey(), -29);
  const recent = log.filter(s => s.date >= cutoff30);
  const exerciseCounts = {};
  recent.forEach(s => s.exercises.forEach(e => { exerciseCounts[e.name] = (exerciseCounts[e.name] || 0) + 1; }));
  const top = Object.entries(exerciseCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    totalSessions: log.length,
    sessionsLast30: recent.length,
    lastSession: log[0]?.date || null,
    mostTrained: top.map(([name, n]) => `${name} (${n}x)`)
  };
}

function prSummary(store) {
  const pbs = store.get('personalBests', {}) || {};
  const rows = Object.entries(pbs);
  if (!rows.length) return null;
  return {
    count: rows.length,
    heaviest: rows.sort((a, b) => b[1].kg - a[1].kg).slice(0, 5)
      .map(([name, pb]) => `${name}: ${pb.kg}kg x ${pb.reps} (${pb.date})`)
  };
}

function weightSummary(store) {
  const log = (store.get('weightLog', []) || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!log.length) return null;
  const latest = log[log.length - 1];
  const first = log[0];
  const monthAgo = log.filter(e => e.date <= addDays(dayKey(), -30)).pop();
  return {
    latest: `${latest.kg}kg on ${latest.date}`,
    entries: log.length,
    changeSinceFirst: round(latest.kg - first.kg),
    changeLast30: monthAgo ? round(latest.kg - monthAgo.kg) : null
  };
}

function habitSummary(store) {
  const d = store.get('habits', null);
  if (!d || !d.items?.length) return null;
  const names = d.items.map(h => h.name);
  let hitDays = 0, partialDays = 0;
  for (let i = 0; i < 30; i++) {
    const day = addDays(dayKey(), -i);
    const done = (d.done?.[day] || []).length;
    if (done >= d.items.length) hitDays++;
    else if (done > 0) partialDays++;
  }
  return {
    tracking: names,
    doneToday: (d.done?.[dayKey()] || []).length,
    outOf: d.items.length,
    fullDaysLast30: hitDays,
    partialDaysLast30: partialDays
  };
}

function focusSummary(store) {
  const d = store.get('focus', null);
  if (!d?.sessions?.length) return null;
  const cutoff = addDays(dayKey(), -29);
  const recent = d.sessions.filter(s => s.start.slice(0, 10) >= cutoff);
  const byProject = {};
  recent.forEach(s => { byProject[s.project || 'untagged'] = (byProject[s.project || 'untagged'] || 0) + s.minutes; });
  return {
    minutesLast30: recent.reduce((n, s) => n + s.minutes, 0),
    byProject: Object.fromEntries(Object.entries(byProject).map(([k, v]) => [k, `${round(v / 60)}h`])),
    sessionsLast30: recent.length,
    currentlyRunning: d.running ? (d.running.project || 'untagged') : null
  };
}

function sleepSummary(store) {
  const d = store.get('sleep', {}) || {};
  const days = Object.entries(d).sort((a, b) => a[0].localeCompare(b[0]));
  if (!days.length) return null;
  const withHours = days.filter(([, e]) => e.hours != null);
  const avg = arr => (arr.length ? round(arr.reduce((s, v) => s + v, 0) / arr.length) : null);
  const last7 = withHours.slice(-7).map(([, e]) => e.hours);
  const moods = days.filter(([, e]) => e.mood != null).slice(-7).map(([, e]) => e.mood);
  const energies = days.filter(([, e]) => e.energy != null).slice(-7).map(([, e]) => e.energy);
  return {
    nightsLogged: withHours.length,
    avgHoursLast7: avg(last7),
    avgHoursAllTime: avg(withHours.map(([, e]) => e.hours)),
    avgMoodLast7: avg(moods),
    avgEnergyLast7: avg(energies),
    lastNight: days[days.length - 1][1].hours ?? null
  };
}

function moneySummary(store) {
  const d = store.get('money', null);
  if (!d?.entries?.length) return null;
  const month = dayKey().slice(0, 7);
  const thisMonth = d.entries.filter(e => e.date.slice(0, 7) === month);
  const byCat = {};
  thisMonth.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const gbp = p => `£${(p / 100).toFixed(2)}`;
  return {
    spentThisMonth: gbp(thisMonth.reduce((s, e) => s + e.amount, 0)),
    byCategoryThisMonth: Object.fromEntries(Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, gbp(v)])),
    entriesThisMonth: thisMonth.length,
    biggestThisMonth: thisMonth.length
      ? (() => { const b = thisMonth.slice().sort((x, y) => y.amount - x.amount)[0]; return `${gbp(b.amount)} on ${b.category}${b.note ? ` (${b.note})` : ''}`; })()
      : null
  };
}

function taskSummary(store) {
  const list = store.get('tasks', []) || [];
  const open = list.filter(t => !t.done);
  if (!list.length) return null;
  return {
    open: open.length,
    dueToday: open.filter(t => t.due === dayKey()).map(t => t.text),
    overdue: open.filter(t => t.due && t.due < dayKey()).map(t => `${t.text} (due ${t.due})`),
    byProject: open.filter(t => t.project).map(t => `${t.project}: ${t.text}`)
  };
}

function learningSummary(store) {
  const d = store.get('learning', null);
  if (!d) return null;
  const items = d.items || [];
  const daily = d.daily || {};
  const recentNotes = Object.entries(daily).filter(([, v]) => v.trim()).sort().reverse().slice(0, 5);
  if (!items.length && !recentNotes.length) return null;
  return {
    inProgress: items.filter(i => !i.finished).map(i => `${i.title} (${i.done}/${i.total || '?'})`),
    finished: items.filter(i => i.finished).map(i => i.title),
    recentLearnings: recentNotes.map(([day, text]) => `${day}: ${text}`)
  };
}

function screenTimeSummary(store) {
  const all = store.get('screentime', {}) || {};
  const today = all[dayKey()];
  if (!today || !Object.keys(today).length) return null;
  const rows = Object.entries(today).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    todayTopApps: Object.fromEntries(rows.map(([app, m]) => [app, `${Math.round(m)}m`])),
    totalToday: `${Math.round(Object.values(today).reduce((s, v) => s + v, 0))}m`
  };
}

function projectSummary(store) {
  const d = store.get('projects', null);
  const watched = store.get('watched', []) || [];
  if (!d && !watched.length) return null;
  return {
    robloxFiles: d?.roblox?.length || 0,
    robloxNewest: d?.roblox?.[0]?.name || null,
    videosWatchedLogged: watched.length,
    recentlyWatched: watched.slice(0, 5).map(v => `${v.title}${v.channel ? ` — ${v.channel}` : ''}`)
  };
}

// Drops null sections so the model isn't handed a wall of "no data".
export function buildContext(store) {
  const raw = {
    today: dayKey(),
    pushups: pushupSummary(store),
    workouts: workoutSummary(store),
    personalBests: prSummary(store),
    weight: weightSummary(store),
    habits: habitSummary(store),
    focus: focusSummary(store),
    sleep: sleepSummary(store),
    money: moneySummary(store),
    tasks: taskSummary(store),
    learning: learningSummary(store),
    screenTime: screenTimeSummary(store),
    projects: projectSummary(store)
  };
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null));
}

export function contextSize(ctx) {
  return JSON.stringify(ctx).length;
}
