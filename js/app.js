// Shell: nav, routing, accent switching, sync chip. Modules do the actual work.

import { initAuth, signIn, signOutNow, currentUser } from './auth.js';
import * as store from './store.js';
import { h, prettyDate, dayKey, addDays, ring } from './ui.js';
import { icon } from './icons.js';
import * as tasks from './tasks.js';

// Single source of truth for navigation. `group` sorts the sidebar into
// sections (matching the reference: day-to-day tracking vs. the build/creative
// side); settings has no group — it sits in the sidebar footer instead.
const TABS = [
  { id: 'today',    name: 'Today',    pinned: true, group: 'daily', load: () => import('./mod/today.js') },
  { id: 'body',     name: 'Body',     pinned: true, group: 'daily', load: () => import('./mod/body.js') },
  { id: 'habits',   name: 'Habits',   pinned: true, group: 'daily', load: () => import('./mod/habits.js') },
  { id: 'money',    name: 'Money',    pinned: true, group: 'daily', load: () => import('./mod/money.js') },
  { id: 'mind',     name: 'Mind',     group: 'daily', load: () => import('./mod/mind.js') },
  { id: 'projects', name: 'Projects', group: 'build', load: () => import('./mod/projects.js') },
  { id: 'learning', name: 'Learning', group: 'build', load: () => import('./mod/learning.js') },
  { id: 'ai',       name: 'AI',       group: 'build', load: () => import('./mod/ai.js') },
  { id: 'review',   name: 'Review',   group: 'build', load: () => import('./mod/review.js') },
  { id: 'settings', name: 'Settings', load: () => import('./mod/settings.js') }
];
const GROUP_LABEL = { daily: 'Daily', build: 'Build' };

// Live count next to a nav item — hidden automatically while that tab is
// active (the CSS swaps it for the active dot). Kept small on purpose: only
// the two counts the reference actually shows, not one per tab.
const BADGES = {
  today: s => { const n = tasks.outstanding(s).length; return n || null; },
  habits: s => { const n = (s.get('habits', null)?.items || []).length; return n || null; }
};

const byId = id => TABS.find(t => t.id === id);
const view = document.getElementById('view');
const titleEl = document.getElementById('view-title');
const subEl = document.getElementById('view-sub');

let active = null;
let cleanup = null;

// ---------- navigation ----------

function navItem(t) {
  const kids = [elFromHTML(icon(t.id)), h('span', { class: 'lbl' }, t.name)];
  if (BADGES[t.id]) kids.push(h('span', { class: 'count', 'data-badge': t.id }, ''));
  return h('button', { class: 'side-item', 'data-nav': t.id, type: 'button', onclick: () => go(t.id) }, ...kids);
}

function buildNav() {
  const side = document.getElementById('sidenav');
  side.innerHTML = '';

  for (const group of ['daily', 'build']) {
    side.append(h('div', { class: 'nav-group-label' }, GROUP_LABEL[group]));
    for (const t of TABS.filter(x => x.group === group)) side.append(navItem(t));
  }

  const settingsTab = byId('settings');
  side.append(h('div', { class: 'side-foot' }, weekGoalWidget(), navItem(settingsTab)));

  refreshBadges();

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

function refreshBadges() {
  for (const [id, fn] of Object.entries(BADGES)) {
    const el = document.querySelector(`[data-badge="${id}"]`);
    if (el) el.textContent = fn(store) ?? '';
  }
}

// This week's focus minutes vs. a target the user sets in Settings — the
// sidebar's one glanceable metric, per the reference's "week goal" widget.
function weekMinutes() {
  const focus = store.get('focus', null);
  if (!focus?.sessions?.length) return 0;
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // Monday = 0
  const monday = dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - dow));
  return focus.sessions
    .filter(s => s.start.slice(0, 10) >= monday)
    .reduce((sum, s) => sum + s.minutes, 0);
}

let weekGoalSet = null;
let weekGoalVal = null;

function weekGoalWidget() {
  const targetHours = store.get('settings', {})?.weeklyFocusGoal ?? 12;
  const doneHours = Math.round((weekMinutes() / 60) * 10) / 10;

  const r = ring(doneHours, targetHours, '');
  r.el.classList.add('sm');
  weekGoalSet = r.set;

  weekGoalVal = h('div', { class: 'val' }, `${doneHours} / ${targetHours}h`);
  return h('div', { class: 'side-goal' }, r.el,
    h('div', {}, h('div', { class: 'eyebrow' }, 'Week goal'), weekGoalVal));
}

function refreshWeekGoal() {
  const targetHours = store.get('settings', {})?.weeklyFocusGoal ?? 12;
  const doneHours = Math.round((weekMinutes() / 60) * 10) / 10;
  if (weekGoalSet) weekGoalSet(doneHours, targetHours);
  if (weekGoalVal) weekGoalVal.textContent = `${doneHours} / ${targetHours}h`;
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

store.onChange('tasks', refreshBadges);
store.onChange('habits', refreshBadges);
store.onChange('focus', refreshWeekGoal);
store.onChange('settings', refreshWeekGoal);

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
