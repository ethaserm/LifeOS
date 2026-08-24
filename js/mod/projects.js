// Projects — where your time actually went, per project.
//
// projects doc: { roblox: [...], robloxScannedAt, list: [{id, name}] }
//   `roblox` and `robloxScannedAt` are written by the Dynamic Island (cloud.js),
//   not by this page — the published https site can't scan local .rbxl files.
// watched doc:  [{id, date, title, channel, note}]
//
// Hours come from the focus doc's sessions, tagged by project.

import { h, card, dayKey, addDays, toast, hero,
         tile, tiles, list, listRow, emptyState, iconEl } from '../ui.js';
import * as tasks from '../tasks.js';

const DOC = 'projects';
const DEFAULT_PROJECTS = ['Roblox', 'Videos', 'Life OS'];

const doc = store => {
  const d = store.get(DOC, null) || {};
  return { roblox: d.roblox || [], robloxScannedAt: d.robloxScannedAt || null, list: d.list || DEFAULT_PROJECTS };
};

const fmtMins = m => (m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`);

// Minutes per project across the last `days`, from focus sessions.
function hoursByProject(store, days = 30) {
  const focus = store.get('focus', null) || { sessions: [] };
  const cutoff = addDays(dayKey(), -(days - 1));
  const out = {};
  (focus.sessions || []).forEach(s => {
    const day = s.start.slice(0, 10);
    if (day < cutoff) return;
    const key = s.project || '(untagged)';
    out[key] = (out[key] || 0) + s.minutes;
  });
  return out;
}

export async function render(mount, { store }) {
  const hoursHost = h('div', {});
  const robloxHost = h('div', {});
  const todoHost = h('div', {});
  const watchedHost = h('div', {});

  mount.append(
    card('Hours — last 30 days', hoursHost),
    card('Roblox games', robloxHost),
    card('Project to-dos', todoHost),
    card('Watched', watchedHost)
  );

  paint();
  function paint() { paintHours(); paintRoblox(); paintTodos(); paintWatched(); }

  function paintHours() {
    hoursHost.innerHTML = '';
    const mins = hoursByProject(store);
    const rows = Object.entries(mins).sort((a, b) => b[1] - a[1]);
    if (!rows.length) {
      hoursHost.append(h('p', { class: 'empty' }, 'No focus sessions yet — start the timer on the Habits tab and tag it with a project.'));
      return;
    }
    const max = rows[0][1];
    rows.forEach(([name, m]) => {
      hoursHost.append(h('div', { class: 'list-row', style: 'display:block' },
        h('div', { class: 'row' }, h('span', {}, name), h('span', { class: 'spacer' }), h('strong', {}, fmtMins(m))),
        h('div', { style: 'margin-top:5px;height:6px;border-radius:999px;background:var(--accent-soft);overflow:hidden' },
          h('div', { style: `height:100%;width:${Math.round((m / max) * 100)}%;background:var(--accent)` }))));
    });
  }

  function paintRoblox() {
    robloxHost.innerHTML = '';
    const d = doc(store);
    if (!d.roblox.length) {
      robloxHost.append(h('p', { class: 'empty' },
        'No scan yet. The Dynamic Island app on your PC scans your .rbxl files and syncs the list here — it needs to have run at least once.'));
      return;
    }
    d.roblox.slice(0, 12).forEach(g => {
      robloxHost.append(h('div', { class: 'list-row' },
        h('span', {}, g.name),
        h('span', { class: 'spacer' }),
        h('span', { class: 'l' }, `${g.sizeMb} MB`),
        h('span', { class: 'l', style: 'width:86px;text-align:right' }, new Date(g.modified).toLocaleDateString('en-GB'))));
    });
    if (d.robloxScannedAt) {
      robloxHost.append(h('p', { class: 'empty', style: 'margin-top:10px' },
        `${d.roblox.length} files · scanned ${new Date(d.robloxScannedAt).toLocaleString('en-GB')}`));
    }
  }

  function paintTodos() {
    todoHost.innerHTML = '';
    const d = doc(store);
    const open = tasks.all(store).filter(t => !t.done && t.project);

    const text = h('input', { type: 'text', placeholder: 'Task…', style: 'flex:1;min-width:140px' });
    const proj = h('select', { style: 'width:160px' });
    d.list.forEach(p => proj.append(h('option', { value: p }, p)));
    const addNow = () => {
      const v = text.value.trim();
      if (!v) return;
      tasks.add(store, { text: v, project: proj.value });
      text.value = '';
      paintTodos();
    };
    text.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });

    todoHost.append(h('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:12px' },
      text, proj, h('button', { class: 'btn primary', type: 'button', onclick: addNow }, 'Add')));

    if (!open.length) { todoHost.append(emptyState('check', 'No project tasks open.')); return; }

    d.list.forEach(p => {
      const mine = open.filter(t => t.project === p);
      if (!mine.length) return;
      todoHost.append(h('p', { class: 'l', style: 'margin:10px 0 4px' }, p));
      mine.forEach(t => todoHost.append(h('div', { class: 'list-row' },
        h('input', { type: 'checkbox', onchange: () => { tasks.toggle(store, t.id); paintTodos(); } }),
        h('span', {}, t.text),
        t.due ? h('span', { class: 'l' }, `· due ${t.due.slice(5)}`) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn ghost', type: 'button', style: 'padding:3px 9px', onclick: () => { tasks.remove(store, t.id); paintTodos(); } }, '×'))));
    });
  }

  function paintWatched() {
    watchedHost.innerHTML = '';
    const list = store.get('watched', []) || [];

    const title = h('input', { type: 'text', placeholder: 'Video title', style: 'flex:1;min-width:150px' });
    const channel = h('input', { type: 'text', placeholder: 'Channel', style: 'width:130px' });
    const addNow = () => {
      const t = title.value.trim();
      if (!t) return;
      store.update('watched', arr => [{ id: Date.now(), date: dayKey(), title: t, channel: channel.value.trim(), note: '' }, ...(arr || [])], []);
      title.value = ''; channel.value = '';
      toast('Added');
      paintWatched();
    };
    title.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });

    watchedHost.append(h('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:12px' },
      title, channel, h('button', { class: 'btn primary', type: 'button', onclick: addNow }, 'Add')));

    if (!list.length) { watchedHost.append(emptyState('film', 'Nothing logged yet.')); return; }
    list.slice(0, 20).forEach(v => {
      watchedHost.append(h('div', { class: 'list-row' },
        h('span', { class: 'l', style: 'width:52px' }, v.date.slice(5)),
        h('span', {}, v.title),
        v.channel ? h('span', { class: 'l' }, `· ${v.channel}`) : null,
        h('span', { class: 'spacer' }),
        h('button', {
          class: 'btn ghost', type: 'button', style: 'padding:3px 9px',
          onclick: () => { store.update('watched', arr => (arr || []).filter(x => x.id !== v.id), []); paintWatched(); }
        }, '×')));
    });
  }

  const offs = ['projects', 'focus', 'tasks', 'watched'].map(d => store.onChange(d, paint));
  return () => offs.forEach(fn => fn());
}
