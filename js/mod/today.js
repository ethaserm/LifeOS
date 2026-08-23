// Today — the home screen. Pushup ring + quick log, plus to-dos due today and
// anything still outstanding from before. Calendar (Google, read-only) arrives
// in P6 once the cloud cron exists to fetch it — nothing here fakes that yet.

import { h, card, ring, dayKey, toast } from '../ui.js';
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

  const btn = n => h('button', {
    class: 'btn' + (n === 10 ? ' primary' : ''), type: 'button',
    onclick: () => { addPushups(store, n); toast(`+${n} pushups`); r.set(countOn(store, dayKey()), goalOf(store)); }
  }, `+${n}`);

  const pushCard = card('Pushups today',
    h('div', { class: 'ring-wrap' }, r.el,
      h('div', { class: 'row wrap', style: 'gap:8px' }, btn(1), btn(5), btn(10),
        h('button', {
          class: 'btn ghost', type: 'button',
          onclick: () => { if (countOn(store, dayKey()) > 0) { addPushups(store, -1); r.set(countOn(store, dayKey()), goalOf(store)); } }
        }, '−1'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => go('body') }, 'Open Body →'))
    )
  );

  const agendaHost = h('div', {});
  const agendaCard = card('Agenda', agendaHost);
  const taskHost = h('div', {});
  const taskCard = card('Today', taskHost);
  mount.append(pushCard, agendaCard, taskCard);
  paintAgenda();
  paintTasks();

  function paintAgenda() {
    agendaHost.innerHTML = '';
    const cal = store.get('calendar', null);
    const events = cal?.date === dayKey() ? (cal.events || []) : [];

    if (!cal) {
      agendaHost.append(h('p', { class: 'empty' },
        'Calendar not connected yet — it syncs from Google once the scheduled job is set up.'));
      return;
    }
    if (!events.length) {
      agendaHost.append(h('p', { class: 'empty' }, 'Nothing in the calendar today.'));
      return;
    }
    events.forEach(e => agendaHost.append(
      h('div', { class: 'row', style: 'padding:7px 0;border-top:1px solid var(--line);gap:12px' },
        h('span', { class: 'l', style: 'width:54px' }, e.allDay ? 'all day' : e.time),
        h('span', {}, e.title))));
  }

  function paintTasks() {
    taskHost.innerHTML = '';
    const due = tasks.forToday(store);
    const overdue = tasks.outstanding(store).filter(t => !due.some(d => d.id === t.id));

    const input = h('input', { type: 'text', placeholder: 'Add something for today…', style: 'flex:1;min-width:160px' });
    const addNow = () => {
      const text = input.value.trim();
      if (!text) return;
      tasks.add(store, { text, due: dayKey() });
      input.value = '';
      paintTasks();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });

    taskHost.append(h('div', { class: 'row', style: 'gap:8px;margin-bottom:12px' },
      input, h('button', { class: 'btn primary', type: 'button', onclick: addNow }, 'Add')));

    if (overdue.length) {
      taskHost.append(h('p', { class: 'l', style: 'margin-bottom:6px;color:var(--accent)' }, 'Still outstanding'));
      overdue.forEach(t => taskHost.append(taskRow(t)));
    }
    if (due.length) {
      if (overdue.length) taskHost.append(h('p', { class: 'l', style: 'margin:10px 0 6px' }, 'Due today'));
      due.forEach(t => taskHost.append(taskRow(t)));
    }
    if (!due.length && !overdue.length) taskHost.append(h('p', { class: 'empty' }, 'Nothing on the list. Nice.'));
  }

  function taskRow(t) {
    return h('div', { class: 'row', style: 'padding:7px 0;border-top:1px solid var(--line);gap:10px' },
      h('input', {
        type: 'checkbox', checked: t.done || false,
        onchange: () => { tasks.toggle(store, t.id); paintTasks(); }
      }),
      h('span', { style: t.done ? 'text-decoration:line-through;color:var(--muted)' : '' }, t.text),
      t.project ? h('span', { class: 'l' }, `· ${t.project}`) : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost', type: 'button', style: 'padding:3px 9px', onclick: () => { tasks.remove(store, t.id); paintTasks(); } }, '×')
    );
  }

  const offA = store.onChange('pushups', () => { r.set(countOn(store, dayKey()), goalOf(store)); });
  const offB = store.onChange('tasks', paintTasks);
  const offC = store.onChange('calendar', paintAgenda);
  return () => { offA(); offB(); offC(); };
}
