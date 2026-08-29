// Weekly review — what the week actually looked like, computed from the docs.
//
// The numbers are always plain arithmetic. The AI write-up is optional and sits
// underneath them: if the model is unavailable, or wrong, the figures above it
// still stand on their own.

import { h, card, titledCard, dayKey, addDays, toast, hero,
         tile, tiles, list, listRow, emptyState, iconEl } from '../ui.js';
import { buildContext } from '../ai/context.js';
import * as brain from '../ai/brain.js';

const num = (v, fb = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };
const round = (n, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
const fmtMins = m => (m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`);

// Monday-started week containing `ref`, as [start, end] date strings.
function weekBounds(ref = dayKey(), weeksBack = 0) {
  const [y, m, d] = ref.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7;              // Monday = 0
  const start = addDays(ref, -dow - weeksBack * 7);
  return [start, addDays(start, 6)];
}

const inWeek = (day, [a, b]) => day >= a && day <= b;

function weekStats(store, bounds) {
  const pushBlob = store.get('pushups', {}) || {};
  const pushups = Object.entries(pushBlob)
    .filter(([k]) => k !== 'pushups_goal' && inWeek(k.slice('pushups_'.length), bounds))
    .reduce((s, [, v]) => s + num(v), 0);

  const workouts = (store.get('workoutLog', []) || []).filter(s => inWeek(s.date, bounds));

  const focus = (store.get('focus', null)?.sessions || []).filter(s => inWeek(s.start.slice(0, 10), bounds));
  const focusMins = focus.reduce((s, x) => s + x.minutes, 0);
  const byProject = {};
  focus.forEach(s => { byProject[s.project || 'untagged'] = (byProject[s.project || 'untagged'] || 0) + s.minutes; });

  const money = (store.get('money', null)?.entries || []).filter(e => inWeek(e.date, bounds));
  const spent = money.reduce((s, e) => s + e.amount, 0);
  const byCat = {};
  money.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });

  const sleepDoc = store.get('sleep', {}) || {};
  const nights = Object.entries(sleepDoc).filter(([day]) => inWeek(day, bounds)).map(([, e]) => e);
  const hours = nights.filter(n => n.hours != null).map(n => n.hours);
  const moods = nights.filter(n => n.mood != null).map(n => n.mood);

  const habitDoc = store.get('habits', null);
  let habitHits = 0, habitPossible = 0;
  if (habitDoc?.items?.length) {
    for (let i = 0; i < 7; i++) {
      const day = addDays(bounds[0], i);
      if (day > dayKey()) break;
      habitHits += (habitDoc.done?.[day] || []).length;
      habitPossible += habitDoc.items.length;
    }
  }

  const tasksDone = (store.get('tasks', []) || []).filter(t => t.done).length;

  return {
    pushups,
    workouts: workouts.length,
    focusMins,
    focusByProject: byProject,
    spentPence: spent,
    spendByCategory: byCat,
    nightsLogged: hours.length,
    avgSleep: hours.length ? round(hours.reduce((s, v) => s + v, 0) / hours.length) : null,
    avgMood: moods.length ? round(moods.reduce((s, v) => s + v, 0) / moods.length) : null,
    habitHits,
    habitPossible,
    tasksDone
  };
}

export async function render(mount, { store }) {
  let weeksBack = 0;
  const host = h('div', {});
  const aiHost = h('div', {});
  mount.append(host, card('Write-up', aiHost));
  paint();
  paintAI();

  function paint() {
    host.innerHTML = '';
    const bounds = weekBounds(dayKey(), weeksBack);
    const s = weekStats(store, bounds);
    const prev = weekStats(store, weekBounds(dayKey(), weeksBack + 1));

    // fmt takes the absolute difference so currency can put the sign outside
    // the symbol — "-£37.65", not "-37.65£".
    const delta = (now, before, fmt = n => String(round(n))) => {
      if (before === 0 && now === 0) return null;
      const diff = now - before;
      if (Math.abs(diff) < 0.05) return h('span', { class: 'l' }, 'same as last week');
      const sign = diff > 0 ? '+' : '−';
      return h('span', { class: 'l' }, `${sign}${fmt(Math.abs(diff))} vs last week`);
    };
    const asHours = n => `${round(n)}h`;
    const asMoney = n => `£${n.toFixed(2)}`;

    const nav = h('div', { class: 'row', style: 'gap:8px;margin-bottom:14px' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { weeksBack++; paint(); } }, '← earlier'),
      h('span', { class: 'spacer' }),
      h('strong', {}, weeksBack === 0 ? 'This week' : `${bounds[0]} → ${bounds[1]}`),
      h('span', { class: 'spacer' }),
      weeksBack > 0 ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { weeksBack--; paint(); } }, 'later →') : null);

    // Deltas are rendered as plain text under each tile rather than as coloured
    // up/down chips: "spent less" is good and "trained less" is bad, so a single
    // colour convention for +/- would be actively misleading here.
    const deltaText = el => (el ? el.textContent : null);

    host.append(
      nav,
      hero('This week',
        h('div', { class: 'row wrap', style: 'gap:36px;align-items:flex-end' },
          h('div', {},
            h('div', { class: 'big' }, String(s.pushups)),
            h('div', { class: 'sub' }, 'pushups' + (deltaText(delta(s.pushups, prev.pushups)) ? ` · ${deltaText(delta(s.pushups, prev.pushups))}` : ''))),
          h('div', {},
            h('div', { class: 'big sm' }, String(s.workouts)),
            h('div', { class: 'sub' }, s.workouts === 1 ? 'workout' : 'workouts')),
          h('div', {},
            h('div', { class: 'big sm' }, fmtMins(s.focusMins)),
            h('div', { class: 'sub' }, 'focused')))),
      titledCard('The week in numbers',
        tiles(
          tile(`£${(s.spentPence / 100).toFixed(2)}`, 'spent', deltaText(delta(s.spentPence / 100, prev.spentPence / 100, asMoney))),
          tile(s.avgSleep != null ? `${s.avgSleep}h` : '–', `average sleep${s.nightsLogged ? ` (${s.nightsLogged} nights)` : ''}`, deltaText(s.avgSleep != null && prev.avgSleep != null ? delta(s.avgSleep, prev.avgSleep, asHours) : null)),
          tile(s.habitPossible ? `${Math.round((s.habitHits / s.habitPossible) * 100)}%` : '–', 'habits hit'),
          tile(s.avgMood != null ? String(s.avgMood) : '–', 'average mood'),
          tile(String(s.tasksDone), 'tasks done'))));

    const focusRows = Object.entries(s.focusByProject).sort((a, b) => b[1] - a[1]);
    if (focusRows.length) {
      host.append(card('Where the focus went',
        list(...focusRows.map(([p, m]) => listRow(
          h('span', { class: 'name' }, p), h('span', { class: 'spacer' }), h('span', { class: 'val' }, fmtMins(m)))))));
    }

    const catRows = Object.entries(s.spendByCategory).sort((a, b) => b[1] - a[1]);
    if (catRows.length) {
      host.append(card('Where the money went',
        list(...catRows.map(([c, p]) => listRow(
          h('span', { class: 'name' }, c), h('span', { class: 'spacer' }), h('span', { class: 'val' }, `£${(p / 100).toFixed(2)}`)))))); 
    }
  }

  function paintAI() {
    aiHost.innerHTML = '';
    const out = h('div', { style: 'white-space:pre-wrap;margin-top:10px' });
    aiHost.append(
      h('p', { class: 'empty' }, 'Optional — the numbers above are computed, this just reads them back as a summary.'),
      h('button', {
        class: 'btn primary', type: 'button', style: 'margin-top:10px',
        onclick: async e => {
          const btn = e.target;
          btn.textContent = 'Thinking…';
          out.textContent = '';
          try {
            const bounds = weekBounds(dayKey(), weeksBack);
            const stats = weekStats(store, bounds);
            const { text } = await brain.ask({
              question: `Here are this week's totals (${bounds[0]} to ${bounds[1]}): ${JSON.stringify(stats)}.\n\nWrite a short weekly review: what improved, what slipped, and one specific thing to fix next week. Three or four sentences, no bullet points, no preamble.`,
              context: buildContext(store),
              brain: 'auto',
              onToken: t => { out.textContent = t; }
            });
            out.textContent = text;
          } catch (err) {
            out.textContent = err.message;
          }
          btn.textContent = 'Write it up';
        }
      }, 'Write it up'),
      out);
  }

  const offs = ['pushups', 'workoutLog', 'focus', 'money', 'sleep', 'habits', 'tasks'].map(d => store.onChange(d, paint));
  return () => offs.forEach(fn => fn());
}
