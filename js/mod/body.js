// Body — pushups, weight, workout log, PRs, routine.
//
// Rebuilt natively from my-routine-local.html and pushup-local.html, but every
// doc keeps its exact old shape so the two old apps and Life OS stay interchangeable:
//   pushups        { "pushups_<date>": "<n>", "pushups_goal": "<n>" }
//   weightLog      [{ date, kg }]
//   workoutLog     [{ id, date, note, exercises:[{name, sets:[{kg,reps}]}], duration }]
//   personalBests  { [exerciseName]: { kg, reps, date } }
//   userRoutine    { mon:[topicKey,...], tue:[...], ... }  (falls back to DEFAULT_ROUTINE)
//   missed         { "day-weekStartDate": { reason, date } }
//   restNotes      { "day-rest-weekStartDate": "text" }

import { h, card, ring, dayKey, addDays, sparkline, editableNumber, toast } from '../ui.js';

const P = 'pushups_';

const TOPICS = {
  chest:     { label: 'Chest',     exercises: ['Bench Press', 'Incline Bench Press', 'Low-to-High Flye', 'Push Up'] },
  back:      { label: 'Back',      exercises: ['Deadlift', 'Pull Up', 'Single Arm Dumbbell Row', 'Shrugs'] },
  legs:      { label: 'Legs',      exercises: ['Weighted Squats', 'Weighted Lunges', 'Romanian Deadlift (RDL)', 'Goblet Squat', 'Single Dumbbell Squat', 'Calf Raises'] },
  shoulders: { label: 'Shoulders', exercises: ['Overhead Press', 'Lateral Raises', 'Front Raises', 'Reverse Raises (Rear Delt Flye)'] },
  biceps:    { label: 'Biceps',    exercises: ['Bicep Curls', 'Preacher Curls', 'Cross Curls (Cross-body)', 'Single Arm Curls (Concentration)', 'Hammer Curls'] },
  triceps:   { label: 'Triceps',   exercises: ['Tricep Pushdown', 'Overhead Tricep Extension', 'Tricep Dips'] },
  abs:       { label: 'Abs',       exercises: ['Elbow-to-Knee Crunches', 'Leg Raises', 'V-Ups', 'Russian Twists'] },
  forearms:  { label: 'Forearms',  exercises: ['Inward Finger Rolls', 'Single Wrist Curls', 'Finger Curls'] }
};
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABEL = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const TRAINING_DAYS = ['mon', 'wed', 'thu', 'sat', 'sun'];
const DEFAULT_ROUTINE = { mon: ['chest', 'triceps', 'shoulders'], tue: [], wed: ['back', 'biceps', 'forearms'], thu: ['legs', 'abs'], fri: [], sat: ['chest', 'abs'], sun: ['shoulders', 'biceps', 'forearms'] };
const KNOWN_EXERCISES = [...new Set(Object.values(TOPICS).flatMap(t => t.exercises))].sort();

const num = (v, fb = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };
const todayIdx = () => (new Date().getDay() + 6) % 7; // Monday = 0
const dayKeyOf = i => ALL_DAYS[i];

// Same key math as the old app — matching it exactly keeps missed/restNotes
// entries readable by both apps.
function weekStartStr() {
  const now = new Date();
  const dow = now.getDay();
  const diff = (dow === 0 ? -6 : 1) - dow;
  return dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff));
}

const SUB_KEY = 'lifeos:body:sub';
const SUBS = [
  { id: 'pushups', label: 'Pushups' },
  { id: 'log', label: 'Log' },
  { id: 'prs', label: 'PRs' },
  { id: 'weight', label: 'Weight' },
  { id: 'routine', label: 'Routine' }
];

export async function render(mount, { store }) {
  let sub = localStorage.getItem(SUB_KEY) || 'pushups';
  if (!SUBS.some(s => s.id === sub)) sub = 'pushups';

  const nav = h('div', { class: 'row wrap', style: 'gap:6px;margin-bottom:14px' });
  const body = h('div', {});
  mount.append(nav, body);

  const paintNav = () => {
    nav.innerHTML = '';
    for (const s of SUBS) {
      nav.append(h('button', {
        class: 'btn' + (s.id === sub ? ' primary' : ' ghost'),
        type: 'button',
        onclick: () => { sub = s.id; localStorage.setItem(SUB_KEY, sub); paintNav(); paintBody(); }
      }, s.label));
    }
  };

  const renderers = {
    pushups: renderPushups, log: renderLog, prs: renderPRs, weight: renderWeight, routine: renderRoutine
  };

  let subCleanup = null;
  function paintBody() {
    if (typeof subCleanup === 'function') { try { subCleanup(); } catch {} }
    body.innerHTML = '';
    subCleanup = renderers[sub](body, store);
  }

  paintNav();
  paintBody();

  const docs = ['pushups', 'workoutLog', 'personalBests', 'weightLog', 'userRoutine', 'missed', 'restNotes'];
  const offs = docs.map(d => store.onChange(d, () => paintBody()));
  return () => { offs.forEach(fn => fn()); if (typeof subCleanup === 'function') subCleanup(); };
}

// ---------------- Pushups ----------------

function renderPushups(mount, store) {
  const blob = () => store.get('pushups', {}) || {};
  const goal = () => Math.max(1, parseInt(blob()[P + 'goal'], 10) || 50);
  const countOn = d => Math.max(0, parseInt(blob()[P + d], 10) || 0);

  const addToday = n => store.update('pushups', b => {
    const next = { ...(b || {}) };
    const d = dayKey();
    next[P + d] = String(Math.max(0, (parseInt(next[P + d], 10) || 0) + n));
    if (!next[P + 'goal']) next[P + 'goal'] = '50';
    return next;
  }, {});

  const r = ring(countOn(dayKey()), goal(), `of ${goal()}`);
  const goalEdit = editableNumber(goal(), {
    prefix: 'Goal: ',
    onCommit: n => store.update('pushups', b => ({ ...(b || {}), [P + 'goal']: String(n) }), {})
  });

  const btn = n => h('button', {
    class: 'btn' + (n === 10 ? ' primary' : ''), type: 'button',
    onclick: () => { addToday(n); toast(`+${n} pushups`); r.set(countOn(dayKey()), goal()); }
  }, `+${n}`);

  mount.append(
    card('Today',
      h('div', { class: 'ring-wrap' }, r.el,
        h('div', {}, h('div', { class: 'row wrap', style: 'gap:8px;margin-bottom:10px' },
          btn(1), btn(5), btn(10),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { addToday(-1); r.set(countOn(dayKey()), goal()); } }, '−1')
        ), goalEdit))
    ),
    card('Last 30 days', sparkline(last30(countOn))),
    card('This week', h('div', { class: 'row wrap', style: 'gap:16px' }, ...weekStats(countOn))),
    card('All time', h('div', { class: 'grid two' }, allTimeStats(blob())))
  );
}

function last30(countOn) {
  const out = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push({ x: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), y: countOn(dayKey(d)) });
  }
  return out;
}

function weekStats(countOn) {
  const today = new Date();
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    out.push(h('div', { class: 'stat' },
      h('div', { class: 'n', style: 'font-size:19px' }, String(countOn(dayKey(d)))),
      h('div', { class: 'l' }, d.toLocaleDateString('en-GB', { weekday: 'short' }))));
  }
  return out;
}

function allTimeStats(blob) {
  const days = Object.entries(blob).filter(([k]) => k !== P + 'goal');
  const total = days.reduce((s, [, v]) => s + (parseInt(v, 10) || 0), 0);
  const best = days.reduce((m, [, v]) => Math.max(m, parseInt(v, 10) || 0), 0);
  return [
    h('div', { class: 'stat' }, h('div', { class: 'n' }, String(total)), h('div', { class: 'l' }, 'total pushups')),
    h('div', { class: 'stat' }, h('div', { class: 'n' }, String(best)), h('div', { class: 'l' }, 'best day')),
    h('div', { class: 'stat' }, h('div', { class: 'n' }, String(days.length)), h('div', { class: 'l' }, 'days logged'))
  ];
}

// ---------------- Weight ----------------

function renderWeight(mount, store) {
  const log = () => (store.get('weightLog', []) || []).slice().sort((a, b) => a.date.localeCompare(b.date));

  const input = h('input', { type: 'number', step: '0.1', placeholder: 'kg', style: 'width:100px' });
  const dateInput = h('input', { type: 'date', value: dayKey() });

  const logIt = () => {
    const kg = num(input.value, NaN);
    if (!Number.isFinite(kg) || kg < 20 || kg > 400) { toast('Enter a real weight in kg'); return; }
    const date = dateInput.value || dayKey();
    store.update('weightLog', arr => {
      const next = (arr || []).slice();
      const idx = next.findIndex(e => e.date === date);
      if (idx >= 0) next[idx] = { date, kg }; else next.push({ date, kg });
      return next.sort((a, b) => a.date.localeCompare(b.date));
    }, []);
    input.value = '';
    toast('Weight logged');
  };

  const entries = log();
  const recent = entries.slice(-12).reverse();

  mount.append(
    card('Log weight',
      h('div', { class: 'row wrap', style: 'gap:10px' }, input, dateInput,
        h('button', { class: 'btn primary', type: 'button', onclick: logIt }, 'Save'))
    ),
    card('Last 30 days', sparkline(entries.slice(-30).map(e => ({ x: e.date.slice(5), y: e.kg })))),
    card('Entries',
      recent.length
        ? h('div', {}, ...recent.map(e => h('div', { class: 'row', style: 'padding:7px 0;border-top:1px solid var(--line)' },
            h('span', {}, e.date), h('span', { class: 'spacer' }), h('span', {}, `${e.kg} kg`),
            h('button', {
              class: 'btn ghost', type: 'button', style: 'padding:4px 10px',
              onclick: () => { if (confirm(`Delete the ${e.date} entry?`)) store.update('weightLog', arr => (arr || []).filter(x => x.date !== e.date), []); }
            }, '×'))))
        : h('p', { class: 'empty' }, 'No weight entries yet.')
    )
  );
}

// ---------------- Workout log ----------------

function renderLog(mount, store) {
  const sessions = () => (store.get('workoutLog', []) || []);
  const pbs = () => (store.get('personalBests', {}) || {});

  let open = false;
  let rows = [{ name: '', sets: [{ kg: '', reps: '' }] }];

  const formHost = h('div', {});
  const listHost = h('div', {});

  function paintForm() {
    formHost.innerHTML = '';
    if (!open) {
      formHost.append(h('button', { class: 'btn primary', type: 'button', onclick: () => { open = true; rows = [{ name: '', sets: [{ kg: '', reps: '' }] }]; paintForm(); } }, '+ Log session'));
      return;
    }
    const dateInput = h('input', { type: 'date', value: dayKey() });
    const noteInput = h('input', { type: 'text', placeholder: 'Note (optional)', style: 'flex:1;min-width:160px' });
    const exHost = h('div', {});

    function paintExercises() {
      exHost.innerHTML = '';
      rows.forEach((row, ri) => {
        const nameInput = h('input', {
          type: 'text', list: 'lifeos-exercises', placeholder: 'Exercise name', value: row.name,
          style: 'flex:1;min-width:160px', oninput: e => { row.name = e.target.value; }
        });
        const setRows = h('div', {}, ...row.sets.map((s, si) => h('div', { class: 'row', style: 'gap:8px;margin-top:6px' },
          h('input', { type: 'number', placeholder: 'kg', value: s.kg, style: 'width:80px', oninput: e => { s.kg = e.target.value; } }),
          h('input', { type: 'number', placeholder: 'reps', value: s.reps, style: 'width:80px', oninput: e => { s.reps = e.target.value; } }),
          h('button', { class: 'btn ghost', type: 'button', style: 'padding:4px 10px', onclick: () => { row.sets.splice(si, 1); if (!row.sets.length) row.sets.push({ kg: '', reps: '' }); paintExercises(); } }, '×')
        )));
        exHost.append(h('div', { class: 'card', style: 'background:var(--page);box-shadow:none;padding:12px;margin-bottom:10px' },
          h('div', { class: 'row', style: 'gap:8px' }, nameInput,
            h('button', { class: 'btn ghost', type: 'button', style: 'padding:4px 10px', onclick: () => { rows.splice(ri, 1); if (!rows.length) rows.push({ name: '', sets: [{ kg: '', reps: '' }] }); paintExercises(); } }, 'remove')),
          setRows,
          h('button', { class: 'btn ghost', type: 'button', style: 'margin-top:8px', onclick: () => { row.sets.push({ kg: '', reps: '' }); paintExercises(); } }, '+ set')
        ));
      });
    }
    paintExercises();

    formHost.append(h('div', { class: 'card', style: 'background:var(--page);box-shadow:none' },
      h('div', { class: 'row wrap', style: 'gap:10px;margin-bottom:10px' }, dateInput, noteInput),
      exHost,
      h('div', { class: 'row wrap', style: 'gap:8px' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { rows.push({ name: '', sets: [{ kg: '', reps: '' }] }); paintExercises(); } }, '+ exercise'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { open = false; paintForm(); } }, 'Cancel'),
        h('button', {
          class: 'btn primary', type: 'button',
          onclick: () => saveSession(store, dateInput.value, noteInput.value, rows, () => { open = false; paintForm(); paintList(); })
        }, 'Save session'))
    ));
  }

  function paintList() {
    listHost.innerHTML = '';
    const list = sessions();
    if (!list.length) { listHost.append(h('p', { class: 'empty' }, 'No sessions logged yet.')); return; }
    for (const s of list) {
      const setCount = s.exercises.reduce((n, ex) => n + ex.sets.length, 0);
      const isPR = s.exercises.some(ex => ex.sets.some(set => {
        const pb = pbs()[ex.name];
        return pb && pb.date === s.date && pb.kg === set.kg && pb.reps === set.reps;
      }));
      listHost.append(h('div', { class: 'card' },
        h('div', { class: 'row', style: 'margin-bottom:6px' },
          h('strong', {}, s.date), isPR ? h('span', { class: 'btn', style: 'padding:2px 8px;font-size:11px' }, 'PR') : null,
          h('span', { class: 'spacer' }),
          h('button', {
            class: 'btn ghost', type: 'button', style: 'padding:4px 10px',
            onclick: () => { if (confirm('Delete this session?')) { store.update('workoutLog', arr => (arr || []).filter(x => x.id !== s.id), []); paintList(); } }
          }, '×')),
        h('p', { class: 'empty' }, `${s.exercises.map(e => e.name).join(', ')} — ${setCount} sets`),
        s.note ? h('p', { class: 'empty' }, s.note) : null
      ));
    }
  }

  const datalist = h('datalist', { id: 'lifeos-exercises' });
  datalist.append(...KNOWN_EXERCISES.map(n => h('option', { value: n })));
  mount.append(datalist, card('Workout log', formHost, h('div', { style: 'margin-top:14px' }, listHost)));
  paintForm();
  paintList();
}

function saveSession(store, date, note, rows, done) {
  const exercises = rows
    .filter(r => r.name.trim())
    .map(r => ({
      name: r.name.trim(),
      sets: r.sets.filter(s => s.kg !== '' && s.reps !== '' && Number.isFinite(num(s.kg)) && Number.isFinite(num(s.reps)))
        .map(s => ({ kg: num(s.kg), reps: parseInt(s.reps, 10) }))
    }))
    .filter(r => r.sets.length);

  if (!exercises.length) { toast('Add at least one exercise with a completed set'); return; }

  const session = { id: Date.now(), date: date || dayKey(), note: (note || '').trim(), exercises, duration: null };
  store.update('workoutLog', arr => [session, ...(arr || [])], []);

  store.update('personalBests', pbs => {
    const next = { ...(pbs || {}) };
    exercises.forEach(ex => ex.sets.forEach(set => {
      const cur = next[ex.name];
      if (!cur || set.kg > cur.kg || (set.kg === cur.kg && set.reps > cur.reps)) {
        next[ex.name] = { kg: set.kg, reps: set.reps, date: session.date };
      }
    }));
    return next;
  }, {});

  toast('Session logged');
  done();
}

// ---------------- PRs ----------------

function renderPRs(mount, store) {
  const pbs = store.get('personalBests', {}) || {};
  const rows = Object.entries(pbs).sort((a, b) => a[0].localeCompare(b[0]));

  mount.append(card('Personal bests',
    rows.length
      ? h('div', {}, ...rows.map(([name, pb]) => h('div', { class: 'row', style: 'padding:8px 0;border-top:1px solid var(--line)' },
          h('span', {}, name), h('span', { class: 'spacer' }),
          h('span', { class: 'mono' }, `${pb.kg}kg × ${pb.reps}`),
          h('span', { class: 'l', style: 'width:84px;text-align:right' }, pb.date))))
      : h('p', { class: 'empty' }, 'No personal bests yet — log a session to start one.')
  ));
}

// ---------------- Routine ----------------

function renderRoutine(mount, store) {
  const routine = () => store.get('userRoutine', null) || DEFAULT_ROUTINE;
  const missed = () => store.get('missed', {}) || {};
  const restNotes = () => store.get('restNotes', {}) || {};

  const host = h('div', {});
  mount.append(card('This week', host));
  paint();

  function paint() {
    host.innerHTML = '';
    const r = routine();
    for (let i = 0; i < 7; i++) {
      const day = dayKeyOf(i);
      const topics = r[day] || [];
      const isToday = i === todayIdx();
      const row = h('div', {
        class: 'card', style: `background:${isToday ? 'var(--accent-soft)' : 'var(--page)'};box-shadow:none;padding:14px;margin-bottom:10px`
      });
      row.append(h('div', { class: 'row', style: 'margin-bottom:6px' },
        h('strong', {}, DAY_LABEL[day]), isToday ? h('span', { class: 'l' }, ' · today') : null));

      if (topics.length) {
        row.append(h('div', { class: 'row wrap', style: 'gap:6px;margin-bottom:8px' },
          ...topics.map(t => h('span', { class: 'btn', style: 'padding:3px 10px;font-size:12px' }, TOPICS[t]?.label || t))));
      } else {
        row.append(h('p', { class: 'empty', style: 'margin-bottom:8px' }, 'Rest day'));
      }

      row.append(topicEditor(day, topics, next => {
        store.update('userRoutine', cur => ({ ...(cur || DEFAULT_ROUTINE), [day]: next }), DEFAULT_ROUTINE);
      }));

      if (TRAINING_DAYS.includes(day) && isToday) row.append(missedControl(day));
      if (!TRAINING_DAYS.includes(day) && isToday) row.append(restNoteControl(day));

      host.append(row);
    }
  }

  function missedControl(day) {
    const key = day + '-' + weekStartStr();
    const entry = missed()[key];
    if (entry) {
      return h('p', { class: 'empty' }, `Marked missed: ${entry.reason} `,
        h('button', {
          class: 'btn ghost', type: 'button', style: 'padding:3px 9px;margin-left:6px',
          onclick: () => { store.update('missed', m => { const n = { ...(m || {}) }; delete n[key]; return n; }, {}); paint(); }
        }, 'undo'));
    }
    return h('button', {
      class: 'btn ghost', type: 'button',
      onclick: () => {
        const reason = prompt(`Why did you miss ${DAY_LABEL[day]}?`);
        if (reason && reason.trim()) {
          store.update('missed', m => ({ ...(m || {}), [key]: { reason: reason.trim(), date: new Date().toISOString() } }), {});
          paint();
        }
      }
    }, 'Mark today missed');
  }

  function restNoteControl(day) {
    const key = day + '-rest-' + weekStartStr();
    const ta = h('textarea', {
      placeholder: 'Rest day notes…', rows: '2', style: 'width:100%;resize:vertical'
    });
    ta.value = restNotes()[key] || '';
    let t;
    ta.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => store.update('restNotes', n => ({ ...(n || {}), [key]: ta.value }), {}), 600);
    });
    return ta;
  }

  function topicEditor(day, active, onChange) {
    const wrap = h('div', { class: 'row wrap', style: 'gap:5px' });
    for (const [key, t] of Object.entries(TOPICS)) {
      const on = active.includes(key);
      wrap.append(h('button', {
        class: 'btn ghost', type: 'button',
        style: `padding:3px 9px;font-size:11.5px;${on ? 'background:var(--accent-soft);color:var(--accent)' : ''}`,
        onclick: () => onChange(on ? active.filter(x => x !== key) : [...active, key])
      }, t.label));
    }
    return wrap;
  }
}
