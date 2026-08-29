// Settings — sign-in, export/import, reminder times, and the raw doc list.

import { h, card, titledCard, toast, hero, tile, tiles, list, listRow, emptyState, iconEl } from '../ui.js';
import { signIn, signOutNow, currentUser } from '../auth.js';
import * as brain from '../ai/brain.js';

const SETTINGS_DOC = 'settings';

const settings = store => {
  const d = store.get(SETTINGS_DOC, null) || {};
  return { reminderHour: d.reminderHour ?? 20, reminderOn: d.reminderOn !== false, weeklyFocusGoal: d.weeklyFocusGoal ?? 12, ...d };
};

export async function render(mount, { store }) {
  const accountHost = h('div', {});
  const goalHost = h('div', {});
  const remindHost = h('div', {});
  const dataHost = h('div', {});
  const aboutHost = h('div', {});

  mount.append(
    titledCard('Account', accountHost),
    card('Week goal', goalHost),
    card('Reminders', remindHost),
    card('Your data', dataHost),
    card('About', aboutHost)
  );

  paintAccount();
  paintGoal();
  paintReminders();
  paintData();
  paintAbout();

  function paintGoal() {
    goalHost.innerHTML = '';
    const s = settings(store);
    const input = h('input', { type: 'number', min: '1', max: '80', value: String(s.weeklyFocusGoal), style: 'width:80px' });
    input.addEventListener('change', () => {
      const hrs = Math.min(80, Math.max(1, parseInt(input.value, 10) || 12));
      store.update(SETTINGS_DOC, cur => ({ ...(cur || {}), weeklyFocusGoal: hrs }), {});
      toast('Saved');
    });
    goalHost.append(
      h('div', { class: 'row', style: 'gap:10px' }, h('span', {}, 'Focus hours target'), input, h('span', { class: 'l' }, 'per week')),
      h('p', { class: 'empty', style: 'margin-top:10px' }, 'Shown as the ring at the bottom of the sidebar on desktop.')
    );
  }

  function paintAccount() {
    accountHost.innerHTML = '';
    const user = currentUser();
    if (user) {
      accountHost.append(
        h('p', {}, `Signed in as ${user.email}`),
        h('p', { class: 'empty', style: 'margin-top:4px' }, 'Your data syncs between this device and your phone.'),
        h('button', {
          class: 'btn ghost', type: 'button', style: 'margin-top:12px',
          onclick: async () => {
            if (!confirm('Sign out? Your data stays on this device and in the cloud.')) return;
            await signOutNow();
            paintAccount();
          }
        }, 'Sign out'));
    } else {
      accountHost.append(
        h('p', { class: 'empty' }, 'Not signed in. Life OS works fine like this, but nothing syncs to your phone.'),
        h('button', {
          class: 'btn primary', type: 'button', style: 'margin-top:12px',
          onclick: async () => { try { await signIn(); paintAccount(); } catch (e) { alert(e.message); } }
        }, 'Sign in with Google'));
    }
  }

  function paintReminders() {
    remindHost.innerHTML = '';
    const s = settings(store);

    const hour = h('input', { type: 'number', min: '0', max: '23', value: String(s.reminderHour), style: 'width:80px' });
    const on = h('input', { type: 'checkbox', checked: s.reminderOn });

    const save = () => {
      store.update(SETTINGS_DOC, cur => ({
        ...(cur || {}),
        reminderHour: Math.min(23, Math.max(0, parseInt(hour.value, 10) || 20)),
        reminderOn: on.checked
      }), {});
      toast('Saved');
    };
    hour.addEventListener('change', save);
    on.addEventListener('change', save);

    remindHost.append(
      h('div', { class: 'row', style: 'gap:10px' }, on, h('span', {}, 'Remind me if the day is unlogged')),
      h('div', { class: 'row', style: 'gap:10px;margin-top:10px' }, h('span', {}, 'At'), hour, h('span', { class: 'l' }, ':00, UK time')),
      h('p', { class: 'empty', style: 'margin-top:10px' },
        'Sent from a scheduled job, so your PC does not need to be on. It stays quiet on days you have already logged something. Needs the phone push setup to be finished.')
    );
  }

  function paintData() {
    dataHost.innerHTML = '';

    const exportNow = () => {
      const dump = {};
      store.DOCS.forEach(doc => { const v = store.get(doc); if (v != null) dump[doc] = v; });
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `lifeos-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const file = h('input', { type: 'file', accept: 'application/json', style: 'display:none' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      let data;
      try { data = JSON.parse(await f.text()); } catch { toast('That file is not valid JSON'); return; }
      const docs = Object.keys(data).filter(k => store.DOCS.includes(k));
      if (!docs.length) { toast('No Life OS data in that file'); return; }
      if (!confirm(`Import ${docs.length} sections? This REPLACES what is currently in: ${docs.join(', ')}.`)) return;
      docs.forEach(doc => store.set(doc, data[doc]));
      toast(`Imported ${docs.length} sections`);
    });

    const counts = store.DOCS
      .map(doc => [doc, store.get(doc)])
      .filter(([, v]) => v != null)
      .map(([doc, v]) => {
        const n = Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 1);
        return h('div', { class: 'list-row' },
          h('span', { class: 'mono' }, doc), h('span', { class: 'spacer' }), h('span', { class: 'l' }, `${n} entries`));
      });

    dataHost.append(
      h('div', { class: 'row wrap', style: 'gap:8px' },
        h('button', { class: 'btn primary', type: 'button', onclick: exportNow }, 'Export everything'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => file.click() }, 'Import from file'),
        file),
      h('p', { class: 'empty', style: 'margin-top:10px' },
        'The Dynamic Island app also writes a full backup to OneDrive\\Claude\\lifeos-backups every week.'),
      counts.length ? h('div', { style: 'margin-top:14px' }, ...counts) : h('p', { class: 'empty', style: 'margin-top:14px' }, 'No data yet.')
    );
  }

  function paintAbout() {
    aboutHost.innerHTML = '';
    aboutHost.append(
      h('p', { class: 'empty' }, `AI brain on this device: ${brain.isLocalHost() ? 'local Ollama available' : 'cloud only (published site cannot reach localhost)'}.`),
      h('p', { class: 'empty', style: 'margin-top:6px' }, 'Data lives in your own Firebase project, shared with the older workout and pushup apps so both stay in sync.')
    );
  }

  return () => {};
}
