// Today — P0 version. Enough to prove the whole chain works end to end:
// tap here, see the number change on the other device. Rings, agenda, tasks and
// the quick-log row proper arrive in P1.

import { h, card, stat, ring, dayKey, toast } from '../ui.js';

const P = 'pushups_';                       // the old tracker's localStorage prefix

const blob = store => store.get('pushups', {}) || {};
const num = (v, fb = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; };

const goalOf = store => num(blob(store)[P + 'goal'], 50);
const countOn = (store, day) => num(blob(store)[P + day], 0);

function addPushups(store, n) {
  const day = dayKey();
  return store.update('pushups', b => {
    const next = { ...(b || {}) };
    const cur = num(next[P + day], 0);
    next[P + day] = String(Math.max(0, cur + n));
    if (!next[P + 'goal']) next[P + 'goal'] = '50';
    return next;
  }, {});
}

// Counts entries whether a doc holds an array, an object or nothing yet.
function sizeOf(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

export async function render(mount, { store }) {
  const goal = goalOf(store);
  const r = ring(countOn(store, dayKey()), goal, `of ${goal}`);

  const repaint = () => {
    const g = goalOf(store);
    r.set(countOn(store, dayKey()), g);
    r.setLabel(`of ${g}`);
    week.replaceChildren(...weekBits(store));
    proof.replaceChildren(...proofBits(store));
  };

  const btn = n => h('button', {
    class: 'btn' + (n === 10 ? ' primary' : ''), type: 'button',
    onclick: () => { addPushups(store, n); toast(`+${n} pushups`); }
  }, `+${n}`);

  const pushCard = card('Pushups today',
    h('div', { class: 'ring-wrap' },
      r.el,
      h('div', { class: 'row wrap', style: 'gap:8px' }, btn(1), btn(5), btn(10),
        h('button', {
          class: 'btn ghost', type: 'button',
          onclick: () => { if (countOn(store, dayKey()) > 0) addPushups(store, -1); }
        }, '−1'))
    )
  );

  const week = h('div', { class: 'row wrap', style: 'gap:18px' }, ...weekBits(store));
  const weekCard = card('Last 7 days', week);

  const proof = h('div', { class: 'grid two' }, ...proofBits(store));
  const proofCard = card('What came down from the cloud', proof,
    h('p', { class: 'empty', style: 'margin-top:10px' },
      'Straight from your existing docs — the same ones the old pushup and workout apps write.')
  );

  mount.append(pushCard, weekCard, proofCard);

  const offA = store.onChange('pushups', repaint);
  const offB = store.onChange('workoutLog', repaint);
  return () => { offA(); offB(); };
}

function weekBits(store) {
  const out = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dayKey(d);
    const n = countOn(store, key);
    out.push(h('div', { class: 'stat' },
      h('div', { class: 'n', style: 'font-size:20px' }, String(n)),
      h('div', { class: 'l' }, d.toLocaleDateString('en-GB', { weekday: 'short' }))));
  }
  return out;
}

function proofBits(store) {
  const days = Object.keys(blob(store)).filter(k => k !== P + 'goal').length;
  return [
    stat(String(days), 'pushup days on record'),
    stat(String(sizeOf(store.get('workoutLog'))), 'workout log entries'),
    stat(String(sizeOf(store.get('personalBests'))), 'personal bests'),
    stat(String(sizeOf(store.get('weightLog'))), 'weight entries')
  ];
}
