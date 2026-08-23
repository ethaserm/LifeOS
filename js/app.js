// Shell: nav, routing, accent switching, sync chip. Modules do the actual work.

import { initAuth, signIn, signOutNow, currentUser } from './auth.js';
import * as store from './store.js';
import { h, prettyDate } from './ui.js';

const ICONS = {
  today:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  body:     '<path d="M4 9v6M20 9v6M7 6.5v11M17 6.5v11M7 12h10"/>',
  habits:   '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M8 12.4l2.7 2.7L16 9.8"/>',
  mind:     '<path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2z"/>',
  money:    '<circle cx="12" cy="12" r="8.5"/><path d="M14 9.2c-2.4-1.4-4.3 0-4.3 2.1V16M9.2 12.6h3.6M8.8 16h6.4"/>',
  projects: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  learning: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>',
  ai:       '<path d="M12 3.5l1.85 5.15L19 10.5l-5.15 1.85L12 17.5l-1.85-5.15L5 10.5l5.15-1.85z"/><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>',
  settings: '<path d="M4 7h9M19 7h1M4 17h5M15 17h5"/><circle cx="16" cy="7" r="2.4"/><circle cx="12" cy="17" r="2.4"/>',
  more:     '<circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/>'
};

const icon = name => `<svg class="ico" viewBox="0 0 24 24" width="22" height="22" fill="none"
  stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">${ICONS[name] || ''}</svg>`;

// Single source of truth for navigation. `phase` marks what isn't built yet.
const TABS = [
  { id: 'today',    name: 'Today',    pinned: true,  load: () => import('./mod/today.js') },
  { id: 'body',     name: 'Body',     pinned: true,  load: () => import('./mod/body.js') },
  { id: 'habits',   name: 'Habits',   pinned: true,  load: () => import('./mod/habits.js') },
  { id: 'money',    name: 'Money',    pinned: true,  load: () => import('./mod/money.js') },
  { id: 'mind',     name: 'Mind',     load: () => import('./mod/mind.js') },
  { id: 'projects', name: 'Projects', phase: 'P4' },
  { id: 'learning', name: 'Learning', phase: 'P4' },
  { id: 'ai',       name: 'AI',       phase: 'P5' },
  { id: 'settings', name: 'Settings', phase: 'P6' }
];

const byId = id => TABS.find(t => t.id === id);
const view = document.getElementById('view');
const titleEl = document.getElementById('view-title');
const subEl = document.getElementById('view-sub');

let active = null;
let cleanup = null;

// ---------- navigation ----------

function buildNav() {
  const side = document.getElementById('sidenav');
  side.innerHTML = '';
  for (const t of TABS) {
    side.append(h('button', {
      class: 'side-item', 'data-nav': t.id, type: 'button',
      onclick: () => go(t.id)
    }, elFromHTML(icon(t.id)), h('span', { class: 'lbl' }, t.name)));
  }

  const bar = document.getElementById('tabbar');
  bar.innerHTML = '';
  for (const t of TABS.filter(x => x.pinned)) {
    bar.append(h('button', {
      class: 'tab', 'data-nav': t.id, type: 'button', onclick: () => go(t.id)
    }, elFromHTML(icon(t.id)), h('span', {}, t.name)));
  }
  bar.append(h('button', {
    class: 'tab', id: 'more-btn', type: 'button', onclick: openSheet
  }, elFromHTML(icon('more')), h('span', {}, 'More')));

  const items = document.getElementById('sheet-items');
  items.innerHTML = '';
  for (const t of TABS.filter(x => !x.pinned)) {
    items.append(h('button', {
      class: 'tab', type: 'button', onclick: () => { closeSheet(); go(t.id); }
    }, elFromHTML(icon(t.id)), h('span', {}, t.name)));
  }
}

function elFromHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html.trim();
  return tmp.firstElementChild;
}

function markActive(id) {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-nav') === id);
  });
}

const sheet = document.getElementById('sheet');
const scrim = document.getElementById('sheet-scrim');
function openSheet() { sheet.hidden = false; scrim.hidden = false; }
function closeSheet() { sheet.hidden = true; scrim.hidden = true; }
scrim.addEventListener('click', closeSheet);

// ---------- routing ----------

async function go(id) {
  const tab = byId(id) || TABS[0];
  if (active === tab.id) return;
  active = tab.id;

  if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
  cleanup = null;

  document.body.setAttribute('data-tab', tab.id);   // swaps the accent colour
  location.hash = `#/${tab.id}`;
  titleEl.textContent = tab.name;
  subEl.textContent = tab.id === 'today' ? prettyDate() : '';
  markActive(tab.id);
  view.innerHTML = '';

  if (tab.load) {
    const mod = await tab.load();
    cleanup = await mod.render(view, { store, go });
  } else {
    view.append(placeholder(tab));
  }
  view.focus({ preventScroll: true });
}

function placeholder(tab) {
  return h('div', { class: 'card' },
    h('div', { class: 'card-label' }, tab.name),
    h('p', { class: 'empty' }, `Arrives in ${tab.phase}. Nothing here yet — this tab exists so the shell is real.`)
  );
}

window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#/', '') || 'today';
  if (id !== active) go(id);
});

// ---------- sync chip ----------

const chip = document.getElementById('sync-chip');
const chipText = document.getElementById('sync-text');

function paintChip() {
  const user = currentUser();
  const status = store.getStatus();
  chip.className = 'chip';
  if (!user) { chipText.textContent = 'Sign in to sync'; return; }
  if (status === 'syncing') { chip.classList.add('busy'); chipText.textContent = 'Syncing…'; return; }
  if (status === 'error') { chip.classList.add('err'); chipText.textContent = 'Sync failed — tap'; return; }
  chip.classList.add('on');
  chipText.textContent = 'Synced';
}

chip.addEventListener('click', async () => {
  const user = currentUser();
  if (!user) { try { await signIn(); } catch (e) { alert('Sign-in failed: ' + e.message); } return; }
  await store.pullAll(store.DOCS);
});

// Long-press / right-click the chip to sign out. Deliberately not a big button.
chip.addEventListener('contextmenu', async e => {
  e.preventDefault();
  if (currentUser() && confirm('Sign out of Life OS? Your data stays on this device.')) await signOutNow();
});

store.onStatus(paintChip);

// ---------- boot ----------

buildNav();
go(location.hash.replace('#/', '') || 'today');

initAuth(async user => {
  paintChip();
  if (user) {
    await store.pullAll(store.DOCS);
    // Re-render whatever's on screen now that real data landed.
    const current = active; active = null; go(current);
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('[sw]', err.message));
  });
}
