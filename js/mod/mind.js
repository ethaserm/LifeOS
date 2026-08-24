// Mind — sleep, mood, energy. Two taps in the morning, per the agreed design.
//
// sleep doc: { "<date>": { bed: "23:30", wake: "07:15", hours: 7.75, mood: 7, energy: 6 } }
//
// The date key is the WAKE day — "how did I sleep last night" belongs to the
// morning you woke up, which is also the day whose mood/energy it explains.

import { h, card, dayKey, addDays, sparkline, toast,
         hero, tile, tiles, list, listRow, emptyState, iconEl } from '../ui.js';

const DOC = 'sleep';

const all = store => store.get(DOC, {}) || {};
const entryFor = (store, day) => all(store)[day] || null;

// Handles the overnight wrap: bed 23:30 -> wake 07:15 is 7.75h, not -16.25h.
function hoursBetween(bed, wake) {
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

function save(store, day, patch) {
  store.update(DOC, d => {
    const next = { ...(d || {}) };
    next[day] = { ...(next[day] || {}), ...patch };
    if (next[day].bed && next[day].wake) next[day].hours = hoursBetween(next[day].bed, next[day].wake);
    return next;
  }, {});
}

export async function render(mount, { store }) {
  const todayHost = h('div', {});
  const trendHost = h('div', {});
  const historyHost = h('div', {});

  mount.append(
    card('Last night', todayHost),
    card('Trends', trendHost),
    card('History', historyHost)
  );

  paint();

  function paint() { paintToday(); paintTrends(); paintHistory(); }

  function paintToday() {
    todayHost.innerHTML = '';
    const day = dayKey();
    const e = entryFor(store, day) || {};

    const bed = h('input', { type: 'time', value: e.bed || '' });
    const wake = h('input', { type: 'time', value: e.wake || '' });

    const commit = () => {
      if (!bed.value || !wake.value) return;
      save(store, day, { bed: bed.value, wake: wake.value });
      paint();
    };
    bed.addEventListener('change', commit);
    wake.addEventListener('change', commit);

    const hoursText = e.hours != null
      ? h('div', { class: 'stat' }, h('div', { class: 'n' }, `${e.hours}h`), h('div', { class: 'l' }, 'slept'))
      : h('p', { class: 'empty' }, 'Set both times to get hours.');

    todayHost.append(
      h('div', { class: 'row wrap', style: 'gap:14px;align-items:flex-end' },
        h('div', {}, h('div', { class: 'l', style: 'margin-bottom:4px' }, 'Bed'), bed),
        h('div', {}, h('div', { class: 'l', style: 'margin-bottom:4px' }, 'Wake'), wake),
        h('span', { class: 'spacer' }), hoursText),
      slider('Mood', e.mood, v => { save(store, day, { mood: v }); paint(); }),
      slider('Energy', e.energy, v => { save(store, day, { energy: v }); paint(); })
    );
  }

  function slider(label, value, onChange) {
    const out = h('span', { class: 'l', style: 'width:28px;text-align:right' }, value != null ? String(value) : '–');
    const input = h('input', {
      type: 'range', min: '1', max: '10', step: '1', value: value != null ? String(value) : '5',
      style: 'flex:1', oninput: e => { out.textContent = e.target.value; }
    });
    input.addEventListener('change', e => onChange(Number(e.target.value)));
    return h('div', { class: 'row', style: 'gap:12px;margin-top:14px' },
      h('span', { style: 'width:56px' }, label), input, out);
  }

  function seriesFor(key, days = 30) {
    const data = all(store);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = addDays(dayKey(), -i);
      const e = data[day];
      if (e && e[key] != null) out.push({ x: day.slice(5), y: e[key] });
    }
    return out;
  }

  function paintTrends() {
    trendHost.innerHTML = '';
    const hours = seriesFor('hours');
    const mood = seriesFor('mood');
    const energy = seriesFor('energy');

    trendHost.append(
      h('div', { class: 'l', style: 'margin-bottom:6px' }, 'Hours slept'), sparkline(hours),
      h('div', { class: 'l', style: 'margin:14px 0 6px' }, 'Mood'), sparkline(mood),
      h('div', { class: 'l', style: 'margin:14px 0 6px' }, 'Energy'), sparkline(energy)
    );

    if (hours.length >= 3) {
      const avg = hours.reduce((s, p) => s + p.y, 0) / hours.length;
      trendHost.append(h('p', { class: 'empty', style: 'margin-top:12px' },
        `Averaging ${Math.round(avg * 10) / 10}h across ${hours.length} nights logged.`));
    }
  }

  function paintHistory() {
    historyHost.innerHTML = '';
    const data = all(store);
    const days = Object.keys(data).sort().reverse().slice(0, 14);
    if (!days.length) { historyHost.append(h('p', { class: 'empty' }, 'Nothing logged yet.')); return; }

    days.forEach(day => {
      const e = data[day];
      historyHost.append(h('div', { class: 'list-row' },
        h('span', { style: 'width:88px' }, day),
        h('span', { class: 'l' }, e.hours != null ? `${e.hours}h` : '–'),
        h('span', { class: 'spacer' }),
        h('span', { class: 'l' }, `mood ${e.mood ?? '–'} · energy ${e.energy ?? '–'}`),
        h('button', {
          class: 'btn ghost', type: 'button', style: 'padding:3px 9px',
          onclick: () => {
            if (!confirm(`Delete the ${day} entry?`)) return;
            store.update(DOC, d => { const n = { ...(d || {}) }; delete n[day]; return n; }, {});
            paint();
          }
        }, '×')));
    });
  }

  return store.onChange(DOC, paint);
}
