// Money — quick-add spending, category breakdown, month total.
//
// money doc: { entries: [{id, date, amount, category, note}], categories: [string] }
//
// Amounts are stored in pence as integers. Floats accumulate rounding error the
// moment you sum them (0.1 + 0.2 !== 0.3), and a money tracker that drifts by a
// penny a month is worse than useless.

import { h, card, dayKey, donut, toast } from '../ui.js';

const DOC = 'money';
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Games', 'Subscriptions', 'Clothes', 'Other'];

const doc = store => {
  const d = store.get(DOC, null);
  if (d && d.entries) return d;
  return { entries: [], categories: DEFAULT_CATEGORIES };
};

const pence = str => Math.round(parseFloat(str) * 100);
const money = p => `£${(p / 100).toFixed(2)}`;
const monthOf = date => date.slice(0, 7);

export async function render(mount, { store }) {
  const addHost = h('div', {});
  const summaryHost = h('div', {});
  const listHost = h('div', {});

  mount.append(
    card('Add spend', addHost),
    card('This month', summaryHost),
    card('Recent', listHost)
  );

  paint();
  function paint() { paintAdd(); paintSummary(); paintList(); }

  function paintAdd() {
    addHost.innerHTML = '';
    const d = doc(store);

    const amount = h('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00', style: 'width:110px' });
    const category = h('select', { style: 'padding:9px;border:1px solid var(--line);border-radius:12px;background:var(--card)' });
    d.categories.forEach(c => category.append(h('option', { value: c }, c)));
    const note = h('input', { type: 'text', placeholder: 'Note (optional)', style: 'flex:1;min-width:130px' });
    const date = h('input', { type: 'date', value: dayKey() });

    const addNow = () => {
      const p = pence(amount.value);
      if (!Number.isFinite(p) || p <= 0) { toast('Enter an amount'); return; }
      store.update(DOC, cur => {
        const base = cur && cur.entries ? cur : { entries: [], categories: DEFAULT_CATEGORIES };
        return {
          ...base,
          entries: [{ id: Date.now(), date: date.value || dayKey(), amount: p, category: category.value, note: note.value.trim() }, ...base.entries]
        };
      }, d);
      amount.value = '';
      note.value = '';
      toast('Logged');
      paint();
    };
    amount.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });
    note.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });

    addHost.append(
      h('div', { class: 'row wrap', style: 'gap:10px' },
        h('span', { style: 'font-size:19px;font-weight:600' }, '£'), amount, category, note, date,
        h('button', { class: 'btn primary', type: 'button', onclick: addNow }, 'Add'))
    );
  }

  function paintSummary() {
    summaryHost.innerHTML = '';
    const d = doc(store);
    const thisMonth = monthOf(dayKey());
    const entries = d.entries.filter(e => monthOf(e.date) === thisMonth);
    const total = entries.reduce((s, e) => s + e.amount, 0);

    const byCategory = {};
    entries.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const segments = Object.entries(byCategory).map(([label, value]) => ({ label, value, display: money(value) }));

    const days = new Date().getDate();
    summaryHost.append(
      h('div', { class: 'row wrap', style: 'gap:24px;margin-bottom:16px' },
        h('div', { class: 'stat' }, h('div', { class: 'n' }, money(total)), h('div', { class: 'l' }, 'spent this month')),
        h('div', { class: 'stat' }, h('div', { class: 'n' }, money(Math.round(total / days))), h('div', { class: 'l' }, 'per day average'))),
      donut(segments)
    );
  }

  function paintList() {
    listHost.innerHTML = '';
    const d = doc(store);
    const recent = d.entries.slice(0, 30);
    if (!recent.length) { listHost.append(h('p', { class: 'empty' }, 'Nothing logged yet.')); return; }

    recent.forEach(e => {
      listHost.append(h('div', { class: 'row', style: 'padding:8px 0;border-top:1px solid var(--line);gap:10px' },
        h('span', { style: 'width:82px' }, e.date.slice(5)),
        h('span', {}, e.category),
        e.note ? h('span', { class: 'l' }, `· ${e.note}`) : null,
        h('span', { class: 'spacer' }),
        h('strong', {}, money(e.amount)),
        h('button', {
          class: 'btn ghost', type: 'button', style: 'padding:3px 9px',
          onclick: () => {
            if (!confirm(`Delete ${money(e.amount)} — ${e.category}?`)) return;
            store.update(DOC, cur => ({ ...cur, entries: cur.entries.filter(x => x.id !== e.id) }), d);
            paint();
          }
        }, '×')));
    });
  }

  return store.onChange(DOC, paint);
}
