// Money — quick-add spending, category breakdown, month total.
//
// money doc: { entries: [{id, date, amount, category, note}], categories: [string] }
//
// Amounts are stored in pence as integers. Floats accumulate rounding error the
// moment you sum them (0.1 + 0.2 !== 0.3), and a money tracker that drifts by a
// penny a month is worse than useless.

import { h, card, titledCard, hero, bigStat, tile, tiles, list, listRow, emptyState,
         dayKey, donut, toast, iconEl } from '../ui.js';

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
  const heroHost = hero('This month');
  const addHost = h('div', {});
  const breakdownHost = h('div', {});
  const listHost = h('div', {});

  const cols = h('div', { class: 'cols' },
    h('div', { class: 'span' }, heroHost),
    titledCard('Add spend', addHost),
    card('By category', breakdownHost),
    h('div', { class: 'span' }, card('Recent', listHost))
  );
  mount.append(cols);

  paint();
  function paint() { paintHero(); paintAdd(); paintBreakdown(); paintList(); }

  function monthEntries() {
    return doc(store).entries.filter(e => monthOf(e.date) === monthOf(dayKey()));
  }

  function paintHero() {
    heroHost.querySelectorAll(':scope > *:not(.card-label)').forEach(n => n.remove());
    const entries = monthEntries();
    const total = entries.reduce((s, e) => s + e.amount, 0);
    const days = new Date().getDate();
    const biggest = entries.slice().sort((a, b) => b.amount - a.amount)[0];

    heroHost.append(
      h('div', { class: 'row wrap', style: 'gap:36px;align-items:flex-end' },
        bigStat(money(total), `across ${entries.length} ${entries.length === 1 ? 'purchase' : 'purchases'}`),
        h('div', {},
          h('div', { class: 'big sm' }, money(Math.round(total / days))),
          h('div', { class: 'sub' }, 'a day so far')),
        biggest
          ? h('div', {},
              h('div', { class: 'big sm' }, money(biggest.amount)),
              h('div', { class: 'sub' }, `biggest · ${biggest.category}`))
          : null)
    );
  }

  function paintAdd() {
    addHost.innerHTML = '';
    const d = doc(store);

    const amount = h('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00', style: 'width:118px' });
    const category = h('select', { style: 'width:150px' });
    d.categories.forEach(c => category.append(h('option', { value: c }, c)));
    const note = h('input', { type: 'text', placeholder: 'Note (optional)', style: 'flex:1;min-width:140px' });
    const date = h('input', { type: 'date', value: dayKey(), style: 'width:158px' });

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
        h('span', { class: 'num', style: 'font-size:20px;font-weight:600;color:var(--muted)' }, '£'),
        amount, category),
      h('div', { class: 'row wrap', style: 'gap:10px;margin-top:10px' },
        note, date,
        h('button', { class: 'btn primary', type: 'button', onclick: addNow }, iconEl('plus', 17), 'Add'))
    );
  }

  function paintBreakdown() {
    breakdownHost.innerHTML = '';
    const entries = monthEntries();
    if (!entries.length) {
      breakdownHost.append(emptyState('money', 'Log a purchase and the category split appears here.'));
      return;
    }
    const byCategory = {};
    entries.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const segments = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value, display: money(value) }));
    breakdownHost.append(donut(segments));
  }

  function paintList() {
    listHost.innerHTML = '';
    const d = doc(store);
    const recent = d.entries.slice(0, 30);
    if (!recent.length) {
      listHost.append(emptyState('inbox', 'Your most recent purchases will list here.'));
      return;
    }

    const rows = recent.map(e => listRow(
      h('span', { class: 'mono', style: 'width:52px;color:var(--muted)' }, e.date.slice(5)),
      h('span', { class: 'name' }, e.category),
      e.note ? h('span', { style: 'color:var(--muted);font-size:13px' }, e.note) : null,
      h('span', { class: 'spacer' }),
      h('span', { class: 'val' }, money(e.amount)),
      h('button', {
        class: 'btn ghost icon', type: 'button', title: 'Delete',
        onclick: () => {
          if (!confirm(`Delete ${money(e.amount)} — ${e.category}?`)) return;
          store.update(DOC, cur => ({ ...cur, entries: cur.entries.filter(x => x.id !== e.id) }), d);
          paint();
        }
      }, iconEl('trash', 15))
    ));
    listHost.append(list(...rows));
  }

  return store.onChange(DOC, paint);
}
