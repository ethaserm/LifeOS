// Today — the home screen. Pushup ring + quick log, agenda, and to-dos due
// today plus anything still outstanding.

import { h, card, hero, ring, tile, tiles, list, listRow, emptyState,
         dayKey, toast, iconEl } from '../ui.js';
import * as tasks from '../tasks.js';

const P = 'pushups_';
const num = (v, fb = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; };

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

export async function render(mount, { store, go }) {
  const goal = goalOf(store);
  const r = ring(countOn(store, dayKey()), goal, `of ${goal}`);

  const btn = (n, cls) => h('button', {
    class: `btn ${cls}`, type: 'button',
    onclick: () => { addPushups(store, n); toast(`+${n} pushups`); refreshRing(); }
  }, `+${n}`);

  const refreshRing = () => r.set(countOn(store, dayKey()), goalOf(store));

  const heroCard = hero('Pushups today',
    h('div', { class: 'ring-wrap' },
      r.el,
      h('div', { style: 'flex:1;min-width:180px' },
        h('div', { class: 'row wrap', style: 'gap:8px' },
          btn(1, ''), btn(5, ''), btn(10, 'primary'),
          h('button', {
            class: 'btn ghost icon', type: 'button', title: 'Remove one',
            style: 'border-color:rgba(255,255,255,.18);color:rgba(255,255,255,.75)',
            onclick: () => { if (countOn(store, dayKey()) > 0) { addPushups(store, -1); refreshRing(); } }
          }, iconEl('minus', 16))),
        h('button', {
          class: 'btn ghost', type: 'button',
          style: 'margin-top:12px;border-color:rgba(255,255,255,.18);color:rgba(255,255,255,.75)',
          onclick: () => go('body')
        }, 'Open Body')))
  );

  const agendaHost = h('div', {});
  const taskHost = h('div', {});

  mount.append(h('div', { class: 'cols' },
    h('div', { class: 'span' }, heroCard),
    card('Agenda', agendaHost),
    card('To-do', taskHost)
  ));

  paintAgenda();
  paintTasks();

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
      h('span', { class: 'mono', style: 'width:56px;color:var(--muted)' }, e.allDay ? 'all day' : e.time),
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
      taskHost.append(emptyState('check', 'Nothing on the list. Nice.'));
      return;
    }

    if (overdue.length) {
      taskHost.append(h('div', { class: 'card-label', style: 'color:var(--accent);margin-bottom:8px' }, 'Still outstanding'));
      taskHost.append(list(...overdue.map(taskRow)));
    }
    if (due.length) {
      taskHost.append(h('div', {
        class: 'card-label',
        style: `margin-bottom:8px;${overdue.length ? 'margin-top:18px' : ''}`
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
      t.project ? h('span', { style: 'color:var(--muted);font-size:12.5px' }, t.project) : null,
      h('span', { class: 'spacer' }),
      h('button', {
        class: 'btn ghost icon', type: 'button', title: 'Delete',
        onclick: () => { tasks.remove(store, t.id); paintTasks(); }
      }, iconEl('trash', 15))
    );
  }

  const offA = store.onChange('pushups', refreshRing);
  const offB = store.onChange('tasks', paintTasks);
  const offC = store.onChange('calendar', paintAgenda);
  return () => { offA(); offB(); offC(); };
}
