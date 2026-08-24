// Learning — books/courses, a daily "what I learned" line, and knowledge notes.
//
// learning doc: {
//   items: [{id, title, kind: 'book'|'course', done, total, finished}],
//   daily: { "<date>": "one line" },
//   notes: [{id, title, body, tag}]
// }
//
// The notes section is the spine of the old YouTube Knowledge Hub. That app kept
// its data in localStorage keys (`yt-channels`, `channel-data:<id>`) inside the
// JARVIS webview and never synced anywhere, so there's an import button rather
// than an assumption that the data is reachable — it only works when Life OS is
// opened in a browser that has those keys.

import { h, card, dayKey, toast } from '../ui.js';

const DOC = 'learning';

const doc = store => {
  const d = store.get(DOC, null) || {};
  return { items: d.items || [], daily: d.daily || {}, notes: d.notes || [] };
};

const save = (store, patch) => store.update(DOC, cur => ({ ...doc(store), ...patch }), doc(store));

export async function render(mount, { store }) {
  const dailyHost = h('div', {});
  const itemsHost = h('div', {});
  const notesHost = h('div', {});

  mount.append(
    card('What I learned today', dailyHost),
    card('Books and courses', itemsHost),
    card('Notes', notesHost)
  );

  paint();
  function paint() { paintDaily(); paintItems(); paintNotes(); }

  function paintDaily() {
    dailyHost.innerHTML = '';
    const d = doc(store);
    const today = dayKey();

    const ta = h('textarea', { rows: '2', placeholder: 'One line is enough…', style: 'width:100%;resize:vertical' });
    ta.value = d.daily[today] || '';
    let t;
    ta.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => save(store, { daily: { ...doc(store).daily, [today]: ta.value } }), 600);
    });
    dailyHost.append(ta);

    const past = Object.keys(d.daily).filter(k => k !== today && d.daily[k].trim()).sort().reverse().slice(0, 7);
    if (past.length) {
      dailyHost.append(h('div', { style: 'margin-top:14px' },
        ...past.map(day => h('div', { style: 'padding:7px 0;border-top:1px solid var(--line)' },
          h('div', { class: 'l' }, day), h('div', {}, d.daily[day])))));
    }
  }

  function paintItems() {
    itemsHost.innerHTML = '';
    const d = doc(store);

    const title = h('input', { type: 'text', placeholder: 'Title', style: 'flex:1;min-width:140px' });
    const kind = h('select', { style: 'width:160px' },
      h('option', { value: 'book' }, 'Book'), h('option', { value: 'course' }, 'Course'));
    const total = h('input', { type: 'number', min: '1', placeholder: 'pages/lessons', style: 'width:130px' });

    const addNow = () => {
      const t = title.value.trim();
      if (!t) return;
      save(store, { items: [...d.items, { id: Date.now(), title: t, kind: kind.value, done: 0, total: parseInt(total.value, 10) || 0, finished: false }] });
      title.value = ''; total.value = '';
      paintItems();
    };
    title.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });

    itemsHost.append(h('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:14px' },
      title, kind, total, h('button', { class: 'btn primary', type: 'button', onclick: addNow }, 'Add')));

    const active = d.items.filter(i => !i.finished);
    const finished = d.items.filter(i => i.finished);

    if (!d.items.length) { itemsHost.append(h('p', { class: 'empty' }, 'Nothing on the go.')); return; }

    active.forEach(it => itemsHost.append(itemRow(it)));
    if (finished.length) {
      itemsHost.append(h('p', { class: 'l', style: 'margin:14px 0 4px' }, `Finished (${finished.length})`));
      finished.forEach(it => itemsHost.append(itemRow(it)));
    }
  }

  function itemRow(it) {
    const pct = it.total > 0 ? Math.min(100, Math.round((it.done / it.total) * 100)) : 0;
    const bump = n => {
      const d = doc(store);
      save(store, {
        items: d.items.map(x => x.id === it.id
          ? { ...x, done: Math.max(0, x.done + n), finished: x.total > 0 && x.done + n >= x.total }
          : x)
      });
      paintItems();
    };

    return h('div', { style: 'padding:10px 0;border-top:1px solid var(--line)' },
      h('div', { class: 'row', style: 'gap:10px' },
        h('span', { style: it.finished ? 'color:var(--muted);text-decoration:line-through' : '' }, it.title),
        h('span', { class: 'l' }, it.kind),
        h('span', { class: 'spacer' }),
        it.total > 0 ? h('span', { class: 'l' }, `${it.done}/${it.total}`) : null,
        h('button', { class: 'btn ghost', type: 'button', style: 'padding:3px 9px', onclick: () => bump(-1) }, '−'),
        h('button', { class: 'btn ghost', type: 'button', style: 'padding:3px 9px', onclick: () => bump(1) }, '+'),
        h('button', {
          class: 'btn ghost', type: 'button', style: 'padding:3px 9px',
          onclick: () => {
            if (!confirm(`Remove "${it.title}"?`)) return;
            save(store, { items: doc(store).items.filter(x => x.id !== it.id) });
            paintItems();
          }
        }, '×')),
      it.total > 0
        ? h('div', { style: 'margin-top:6px;height:6px;border-radius:999px;background:var(--accent-soft);overflow:hidden' },
            h('div', { style: `height:100%;width:${pct}%;background:var(--accent)` }))
        : null);
  }

  function paintNotes() {
    notesHost.innerHTML = '';
    const d = doc(store);

    const title = h('input', { type: 'text', placeholder: 'Note title', style: 'flex:1;min-width:140px' });
    const tag = h('input', { type: 'text', placeholder: 'Tag (optional)', style: 'width:130px' });
    const addNow = () => {
      const t = title.value.trim();
      if (!t) return;
      save(store, { notes: [{ id: Date.now(), title: t, body: '', tag: tag.value.trim() }, ...d.notes] });
      title.value = ''; tag.value = '';
      paintNotes();
    };
    title.addEventListener('keydown', e => { if (e.key === 'Enter') addNow(); });

    notesHost.append(h('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:12px' },
      title, tag,
      h('button', { class: 'btn primary', type: 'button', onclick: addNow }, 'Add'),
      h('button', { class: 'btn ghost', type: 'button', onclick: importHub }, 'Import old hub')));

    if (!d.notes.length) { notesHost.append(h('p', { class: 'empty' }, 'No notes yet.')); return; }

    d.notes.forEach(n => {
      const body = h('textarea', { rows: '2', placeholder: 'Write here…', style: 'width:100%;resize:vertical;margin-top:6px' });
      body.value = n.body || '';
      let t;
      body.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => save(store, { notes: doc(store).notes.map(x => x.id === n.id ? { ...x, body: body.value } : x) }), 600);
      });

      notesHost.append(h('div', { style: 'padding:10px 0;border-top:1px solid var(--line)' },
        h('div', { class: 'row', style: 'gap:8px' },
          h('strong', {}, n.title),
          n.tag ? h('span', { class: 'l' }, `· ${n.tag}`) : null,
          h('span', { class: 'spacer' }),
          h('button', {
            class: 'btn ghost', type: 'button', style: 'padding:3px 9px',
            onclick: () => {
              if (!confirm(`Delete "${n.title}"?`)) return;
              save(store, { notes: doc(store).notes.filter(x => x.id !== n.id) });
              paintNotes();
            }
          }, '×')),
        body));
    });
  }

  // Reads the old hub's localStorage keys if they exist in THIS browser. They
  // lived in the JARVIS webview, so this usually finds nothing when Life OS is
  // opened anywhere else — it says so rather than failing silently.
  function importHub() {
    let channels = [];
    try { channels = JSON.parse(localStorage.getItem('yt-channels') || '[]'); } catch {}
    if (!channels.length) {
      toast('No old hub data in this browser');
      return;
    }
    const imported = [];
    channels.forEach(ch => {
      let data;
      try { data = JSON.parse(localStorage.getItem('channel-data:' + ch.id) || 'null'); } catch { return; }
      if (!data) return;
      (data.notes || []).forEach(n => imported.push({ id: Date.now() + Math.random(), title: n.title, body: n.body || '', tag: ch.name }));
    });
    if (!imported.length) { toast('Found channels but no notes'); return; }
    save(store, { notes: [...imported, ...doc(store).notes] });
    toast(`Imported ${imported.length} notes`);
    paintNotes();
  }

  return store.onChange(DOC, paint);
}
