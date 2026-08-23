// Habits + Focus + Screen time.
//
// habits doc:  { items: [{id, name}], done: { "<date>": [habitId, ...] } }
// focus doc:   { running: null | {project, startedAt}, sessions: [{id, project, start, end, minutes}] }
// screentime:  { "<date>": { "<appName>": minutes } } — written by the Dynamic Island,
//              not yet wired (that's the island-side half of P2). Shows a plain
//              "not connected yet" message until that doc has anything in it.
//
// No streaks, no XP — per Ethan's "just the numbers", the ring only ever shows
// a %-complete for today, and the grid below is a plain heatmap, not a badge system.

import { h, card, ring, dayKey, sparkline, editableText, toast } from '../ui.js';

const SEED = ['Worked on a project', 'Shipped something', 'Learned something new'];

function habitsDoc(store) {
  const d = store.get('habits', null);
  if (d && d.items) return d;
  const seeded = { items: SEED.map((name, i) => ({ id: Date.now() + i, name })), done: {} };
  store.set('habits', seeded);
  return seeded;
}

function toggleToday(store, id) {
  store.update('habits', d => {
    const next = { items: d.items, done: { ...d.done } };
    const day = dayKey();
    const list = next.done[day] || [];
    next.done[day] = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    return next;
  }, habitsDoc(store));
}

function addHabit(store, name) {
  store.update('habits', d => ({ items: [...d.items, { id: Date.now(), name }], done: d.done }), habitsDoc(store));
}
function renameHabit(store, id, name) {
  store.update('habits', d => ({ items: d.items.map(h => h.id === id ? { ...h, name } : h), done: d.done }), habitsDoc(store));
}
function removeHabit(store, id) {
  store.update('habits', d => ({ items: d.items.filter(h => h.id !== id), done: d.done }), habitsDoc(store));
}
function moveHabit(store, id, dir) {
  store.update('habits', d => {
    const items = d.items.slice();
    const i = items.findIndex(h => h.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return d;
    [items[i], items[j]] = [items[j], items[i]];
    return { items, done: d.done };
  }, habitsDoc(store));
}

export async function render(mount, { store }) {
  const habitsHost = h('div', {});
  const focusHost = h('div', {});
  const screenHost = h('div', {});
  mount.append(card('Habits', habitsHost), card('Focus', focusHost), card('Screen time', screenHost));

  let tick = null;

  paintHabits();
  paintFocus();
  paintScreen();

  function paintHabits() {
    habitsHost.innerHTML = '';
    const d = habitsDoc(store);
    const today = dayKey();
    const doneToday = d.done[today] || [];
    const pct = d.items.length ? Math.round((doneToday.length / d.items.length) * 100) : 0;

    const r = ring(doneToday.length, d.items.length || 1, `${pct}%`);
    const list = h('div', { style: 'margin-top:14px' });
    d.items.forEach((it, i) => {
      const on = doneToday.includes(it.id);
      list.append(h('div', { class: 'row', style: 'padding:7px 0;border-top:1px solid var(--line);gap:10px' },
        h('input', { type: 'checkbox', checked: on, onchange: () => { toggleToday(store, it.id); paintHabits(); } }),
        editableText(it.name, { onCommit: v => renameHabit(store, it.id, v) }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn ghost', type: 'button', style: 'padding:3px 8px', disabled: i === 0, onclick: () => { moveHabit(store, it.id, -1); paintHabits(); } }, '↑'),
        h('button', { class: 'btn ghost', type: 'button', style: 'padding:3px 8px', disabled: i === d.items.length - 1, onclick: () => { moveHabit(store, it.id, 1); paintHabits(); } }, '↓'),
        h('button', { class: 'btn ghost', type: 'button', style: 'padding:3px 8px', onclick: () => { removeHabit(store, it.id); paintHabits(); } }, '×')
      ));
    });

    const addInput = h('input', { type: 'text', placeholder: 'Add a habit…', style: 'flex:1;min-width:140px' });
    const addNow = () => { const v = addInput.value.trim(); if (v) { addHabit(store, v); addInput.value = ''; paintHabits(); } };
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });

    habitsHost.append(
      h('div', { class: 'ring-wrap' }, r.el, h('div', { class: 'l' }, `${doneToday.length} of ${d.items.length} today`)),
      list,
      h('div', { class: 'row', style: 'gap:8px;margin-top:12px' }, addInput, h('button', { class: 'btn primary', type: 'button', onclick: addNow }, 'Add')),
      h('div', { style: 'margin-top:16px' }, heatmap(d))
    );
  }

  function heatmap(d) {
    const cells = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = dayKey(dt);
      const doneCount = (d.done[key] || []).length;
      const ratio = d.items.length ? doneCount / d.items.length : 0;
      cells.push(h('div', {
        title: `${key}: ${doneCount}/${d.items.length}`,
        style: `width:100%;aspect-ratio:1;border-radius:5px;background:var(--accent);opacity:${ratio === 0 ? 0.08 : 0.25 + ratio * 0.75};${i === 0 ? 'outline:2px solid var(--accent);outline-offset:1px' : ''}`
      }));
    }
    return h('div', { style: 'display:grid;grid-template-columns:repeat(10,1fr);gap:5px' }, ...cells);
  }

  // ---------------- Focus ----------------

  function focusDoc() { return store.get('focus', null) || { running: null, sessions: [] }; }

  function paintFocus() {
    focusHost.innerHTML = '';
    clearInterval(tick);
    const d = focusDoc();

    const today = dayKey();
    const todaySessions = d.sessions.filter(s => s.start.slice(0, 10) === today);
    let todayMins = todaySessions.reduce((n, s) => n + s.minutes, 0);

    const liveEl = h('div', { class: 'stat' },
      h('div', { class: 'n', id: 'focus-live' }, fmtMins(todayMins)),
      h('div', { class: 'l' }, 'focused today'));

    if (d.running) {
      const projInput = h('span', {}, d.running.project || '(untagged)');
      focusHost.append(
        h('div', { class: 'row', style: 'gap:14px' }, liveEl,
          h('div', { class: 'stat' }, h('div', { class: 'n', style: 'font-size:18px' }, projInput), h('div', { class: 'l' }, 'running')),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn primary', type: 'button', onclick: () => stopFocus() }, 'Stop')));

      const startedAt = d.running.startedAt;
      tick = setInterval(() => {
        const liveMins = todayMins + Math.floor((Date.now() - startedAt) / 60000);
        const el = document.getElementById('focus-live');
        if (el) el.textContent = fmtMins(liveMins); else clearInterval(tick);
      }, 1000);
    } else {
      const projInput = h('input', { type: 'text', list: 'lifeos-projects', placeholder: 'Project (optional)', style: 'width:160px' });
      focusHost.append(
        h('div', { class: 'row', style: 'gap:14px' }, liveEl,
          h('span', { class: 'spacer' }), projInput,
          h('button', { class: 'btn primary', type: 'button', onclick: () => startFocus(projInput.value.trim()) }, 'Start')));
    }

    const datalist = h('datalist', { id: 'lifeos-projects' });
    datalist.append(...['Roblox', 'Videos', 'Life OS'].map(n => h('option', { value: n })));
    focusHost.append(datalist);

    if (todaySessions.length) {
      focusHost.append(h('div', { style: 'margin-top:12px' }, ...todaySessions.slice().reverse().map(s =>
        h('div', { class: 'row', style: 'padding:6px 0;border-top:1px solid var(--line)' },
          h('span', {}, s.project || '(untagged)'), h('span', { class: 'spacer' }), h('span', { class: 'l' }, fmtMins(s.minutes))))));
    }
  }

  function startFocus(project) {
    store.update('focus', d => ({ ...(d || { sessions: [] }), running: { project, startedAt: Date.now() } }), focusDoc());
    paintFocus();
  }
  function stopFocus() {
    store.update('focus', d => {
      if (!d.running) return d;
      const minutes = Math.max(1, Math.round((Date.now() - d.running.startedAt) / 60000));
      const session = { id: Date.now(), project: d.running.project, start: new Date(d.running.startedAt).toISOString(), end: new Date().toISOString(), minutes };
      return { running: null, sessions: [...(d.sessions || []), session] };
    }, focusDoc());
    toast('Focus session saved');
    paintFocus();
  }

  function fmtMins(m) { return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; }

  // ---------------- Screen time ----------------

  function paintScreen() {
    screenHost.innerHTML = '';
    const all = store.get('screentime', {}) || {};
    const today = all[dayKey()];
    if (!today || !Object.keys(today).length) {
      screenHost.append(h('p', { class: 'empty' }, 'Not connected yet — pairs with the Dynamic Island app on your PC.'));
      return;
    }
    const rows = Object.entries(today).sort((a, b) => b[1] - a[1]).slice(0, 8);
    screenHost.append(...rows.map(([app, mins]) => h('div', { class: 'row', style: 'padding:6px 0;border-top:1px solid var(--line)' },
      h('span', {}, app), h('span', { class: 'spacer' }), h('span', { class: 'l' }, fmtMins(mins)))));
  }

  const offs = ['habits', 'focus', 'screentime'].map(doc => store.onChange(doc, () => {
    if (doc === 'habits') paintHabits(); else if (doc === 'focus') paintFocus(); else paintScreen();
  }));
  return () => { clearInterval(tick); offs.forEach(fn => fn()); };
}
