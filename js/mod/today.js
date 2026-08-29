// Today — the day at a glance.
//
// This is the screen that has to earn opening the app. It answers one question
// before anything else ("how is today going?") with a single number derived
// from every pillar, then breaks that number down into the pillars that fed it,
// then gets out of the way so the two things with real input (pushups, tasks)
// can be used without navigating.
//
// The day score is honest arithmetic, not a vibe: each pillar contributes a
// 0-1 ratio and the score is their mean. A pillar only counts when it applies
// today — a rest day contributes nothing rather than scoring zero for a workout
// that was never scheduled, which would punish the routine for working.

import { h, card, hero, ring, bar, list, listRow, emptyState,
         dayKey, toast, iconEl } from '../ui.js';
import * as tasks from '../tasks.js';

const P = 'pushups_';
const num = (v, fb = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; };
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const blob = store => store.get('pushups', {}) || {};
const goalOf = store => Math.max(1, num(blob(store)[P + 'goal'], 50));
const countOn = (store, day) => Math.max(0, num(blob(store)[P + day], 0));

function addPushups(store, n) {
  return store.update('pushups', b => {
    const next = { ...(b || {}) };
    const d = dayKey();
    next[P + d] = String(Math.max(0, num(next[P + d], 0) + n));
    if (!next[P + 'goal']) next[P + 'goal'] = '50';
    return next;
  }, {});
}

// Each pillar reports { ratio 0-1, label, detail, tab } or null when it doesn't
// apply today. Returning null is the "rest day" case — excluded from the score
// rather than counted as a miss.
function pillars(store) {
  const today = dayKey();
  const out = [];

  const goal = goalOf(store);
  const done = countOn(store, today);
  out.push({
    id: 'pushups', tab: 'body', icon: 'body', label: 'Pushups',
    ratio: Math.min(1, done / goal),
    detail: `${done} of ${goal}`
  });

  const habits = store.get('habits', null);
  if (habits?.items?.length) {
    const ticked = (habits.done?.[today] || []).length;
    out.push({
      id: 'habits', tab: 'habits', icon: 'habits', label: 'Habits',
      ratio: ticked / habits.items.length,
      detail: `${ticked} of ${habits.items.length}`
    });
  }

  // Only scored on days the routine actually schedules training.
  const routine = store.get('userRoutine', null);
  const dow = DAY_KEYS[new Date().getDay()];
  const scheduled = routine?.[dow];
  if (scheduled?.length) {
    const trained = (store.get('workoutLog', []) || []).some(s => s.date === today);
    out.push({
      id: 'workout', tab: 'body', icon: 'trophy', label: 'Workout',
      ratio: trained ? 1 : 0,
      detail: trained ? 'logged' : scheduled.join(', ')
    });
  }

  const sleep = store.get('sleep', {})?.[today];
  out.push({
    id: 'sleep', tab: 'mind', icon: 'mind', label: 'Sleep',
    ratio: sleep?.hours != null ? 1 : 0,
    detail: sleep?.hours != null ? `${sleep.hours}h` : 'not logged'
  });

  // Daily share of the weekly focus target set in Settings.
  const weeklyGoal = store.get('settings', {})?.weeklyFocusGoal ?? 12;
  const dailyTargetMins = (weeklyGoal / 7) * 60;
  const focusMins = (store.get('focus', null)?.sessions || [])
    .filter(s => s.start.slice(0, 10) === today)
    .reduce((sum, s) => sum + s.minutes, 0);
  out.push({
    id: 'focus', tab: 'habits', icon: 'clock', label: 'Focus',
    ratio: dailyTargetMins > 0 ? Math.min(1, focusMins / dailyTargetMins) : 0,
    detail: focusMins ? fmtMins(focusMins) : 'none yet'
  });

  return out;
}

const fmtMins = m => (m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`);

export async function render(mount, { store, go }) {
  const pillarHost = h('div', { class: 'pillars' });
  const dayRing = ring(0, 100, 'day score');

  const heroCard = hero(null,
    h('div', { class: 'ring-wrap', style: 'align-items:flex-start' },
      dayRing.el,
      h('div', { style: 'flex:1;min-width:200px' }, pillarHost))
  );

  const quickHost = h('div', {});
  const agendaHost = h('div', {});
  const taskHost = h('div', {});

  mount.append(h('div', { class: 'cols' },
    h('div', { class: 'span' }, heroCard),
    h('div', { class: 'span' }, card(null, quickHost)),
    card('Agenda', agendaHost),
    card('To-do', taskHost)
  ));

  paintDay();
  paintQuick();
  paintAgenda();
  paintTasks();

  function paintDay() {
    const ps = pillars(store);
    const pct = ps.length ? Math.round((ps.reduce((s, p) => s + p.ratio, 0) / ps.length) * 100) : 0;
    dayRing.set(pct, 100);

    pillarHost.innerHTML = '';
    ps.forEach(p => {
      const b = bar(p.ratio * 100);
      pillarHost.append(h('button', {
        class: 'pillar', type: 'button', onclick: () => go(p.tab),
        title: `Open ${p.label}`
      },
        h('div', { class: 'row', style: 'gap:9px' },
          iconEl(p.icon, 15),
          h('span', { class: 'pillar-name' }, p.label),
          h('span', { class: 'spacer' }),
          h('span', { class: 'pillar-detail' }, p.detail)),
        b.el));
    });
  }

  // The two logs worth doing without leaving this screen. Everything else is a
  // tap away via the pillar rows above, which is cheaper than duplicating each
  // pillar's real form here and letting the two drift apart.
  function paintQuick() {
    quickHost.innerHTML = '';
    const pushBtn = n => h('button', {
      class: 'btn', type: 'button',
      onclick: () => { addPushups(store, n); toast(`+${n} pushups`); }
    }, `+${n}`);

    quickHost.append(h('div', { class: 'row wrap', style: 'gap:9px' },
      h('span', { class: 'quick-label' }, 'Pushups'),
      pushBtn(1), pushBtn(5), pushBtn(10),
      h('button', {
        class: 'btn ghost icon', type: 'button', title: 'Remove one',
        onclick: () => { if (countOn(store, dayKey()) > 0) addPushups(store, -1); }
      }, iconEl('minus', 16)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => go('habits') },
        iconEl('play', 15), 'Start focus')));
  }

  function paintAgenda() {
    agendaHost.innerHTML = '';
    const cal = store.get('calendar', null);
    const events = cal?.date === dayKey() ? (cal.events || []) : [];

    if (!cal) {
      agendaHost.append(emptyState('calendar',
        'Calendar syncs from Google once the scheduled job is set up.'));
      return;
    }
    if (!events.length) {
      agendaHost.append(emptyState('calendar', 'Nothing in the calendar today.'));
      return;
    }
    agendaHost.append(list(...events.map(e => listRow(
      h('span', { class: 'mono', style: 'width:56px' }, e.allDay ? 'all day' : e.time),
      h('span', { class: 'name' }, e.title)))));
  }

  function paintTasks() {
    taskHost.innerHTML = '';
    const due = tasks.forToday(store);
    const overdue = tasks.outstanding(store).filter(t => !due.some(d => d.id === t.id));

    const input = h('input', { type: 'text', placeholder: 'Add something for today', style: 'flex:1;min-width:150px' });
    const addNow = () => {
      const text = input.value.trim();
      if (!text) return;
      tasks.add(store, { text, due: dayKey() });
      input.value = '';
      paintTasks();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });

    taskHost.append(h('div', { class: 'row', style: 'gap:9px;margin-bottom:14px' },
      input, h('button', { class: 'btn primary', type: 'button', onclick: addNow }, iconEl('plus', 17))));

    if (!due.length && !overdue.length) {
      taskHost.append(emptyState('check', 'Nothing due. Add one above if today needs a plan.'));
      return;
    }

    if (overdue.length) {
      taskHost.append(h('div', { class: 'group-label overdue' }, `Still outstanding · ${overdue.length}`));
      taskHost.append(list(...overdue.map(taskRow)));
    }
    if (due.length) {
      taskHost.append(h('div', {
        class: 'group-label',
        style: overdue.length ? 'margin-top:18px' : ''
      }, 'Due today'));
      taskHost.append(list(...due.map(taskRow)));
    }
  }

  function taskRow(t) {
    return listRow(
      h('input', {
        type: 'checkbox', checked: t.done || false,
        onchange: () => { tasks.toggle(store, t.id); paintTasks(); }
      }),
      h('span', { class: 'name', style: t.done ? 'text-decoration:line-through;color:var(--muted)' : '' }, t.text),
      t.project ? h('span', { class: 'tag muted' }, t.project) : null,
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn ghost icon', type: 'button', title: 'Delete',
        onclick: () => { tasks.remove(store, t.id); paintTasks(); }
      }, iconEl('trash', 15))
    );
  }

  const docs = ['pushups', 'habits', 'workoutLog', 'userRoutine', 'sleep', 'focus', 'settings'];
  const offs = docs.map(d => store.onChange(d, paintDay));
  offs.push(store.onChange('tasks', paintTasks));
  offs.push(store.onChange('calendar', paintAgenda));
  return () => offs.forEach(fn => fn());
}
