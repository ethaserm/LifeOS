// Shared building blocks. Anything two modules would both need lives here.

// Local calendar date, NOT toISOString() — that's UTC and rolls the day over at
// 1am British Summer Time. The old pushups.html has that bug; this doesn't.
export function dayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dayKey(dt);
}

export function prettyDate(d = new Date()) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export const card = (label, ...kids) =>
  h('div', { class: 'card' }, label ? h('div', { class: 'card-label' }, label) : null, ...kids);

export const stat = (n, l) =>
  h('div', { class: 'stat' }, h('div', { class: 'n' }, n), h('div', { class: 'l' }, l));

// Progress ring. Returns the element plus a setter so callers can update it
// without rebuilding the DOM.
export function ring(value, goal, label = '') {
  const R = 54, C = 2 * Math.PI * R;
  const svg = `
    <svg viewBox="0 0 128 128" aria-hidden="true">
      <circle class="track" cx="64" cy="64" r="${R}" fill="none" stroke-width="11"></circle>
      <circle class="fill" cx="64" cy="64" r="${R}" fill="none" stroke-width="11"
              stroke-dasharray="${C}" stroke-dashoffset="${C}"></circle>
    </svg>`;
  const num = h('div', { class: 'n' }, String(value));
  const lab = h('div', { class: 'l' }, label);
  const wrap = h('div', { class: 'ring' });
  wrap.innerHTML = svg;
  wrap.append(h('div', { class: 'mid' }, num, lab));

  const fill = wrap.querySelector('.fill');
  const apply = (v, g) => {
    const pct = g > 0 ? Math.min(1, v / g) : 0;
    fill.setAttribute('stroke-dashoffset', String(C * (1 - pct)));
    num.textContent = String(v);
  };
  requestAnimationFrame(() => apply(value, goal));

  return { el: wrap, set: apply, setLabel: t => { lab.textContent = t; } };
}

// Minimal line chart. `points` = [{x:'label', y:number}]. No axes, no gridlines —
// just the line, a soft fill, and end labels. Handles 0/1 points without throwing.
export function sparkline(points, { height = 64 } = {}) {
  const W = 300, H = height, PAD = 6;
  if (!points || points.length < 2) {
    return h('p', { class: 'empty' }, points && points.length === 1
      ? 'One entry so far — a line needs a second.' : 'Nothing logged yet.');
  }
  const ys = points.map(p => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const span = hi - lo || 1;
  const stepX = (W - PAD * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - ((p.y - lo) / span) * (H - PAD * 2);
    return [x, y];
  });
  const line = coords.map(c => c.join(',')).join(' ');
  const fill = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;

  const wrap = h('div', {});
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;display:block" preserveAspectRatio="none">
      <polygon points="${fill}" fill="var(--accent-soft)"></polygon>
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
    <div class="row" style="justify-content:space-between;margin-top:4px">
      <span class="l" style="font-size:11.5px">${points[0].x}</span>
      <span class="l" style="font-size:11.5px">${points[points.length - 1].x}</span>
    </div>`;
  return wrap;
}

// Tap-to-edit number, used for things like the pushup goal. Click the label,
// get an inline input, Enter/blur commits, Escape cancels.
export function editableNumber(value, { onCommit, prefix = '', suffix = '' }) {
  const label = h('span', { class: 'edit-num', tabindex: '0', role: 'button' }, `${prefix}${value}${suffix} ✎`);
  label.style.cursor = 'pointer';
  const start = () => {
    const input = h('input', {
      type: 'number', value, inputmode: 'numeric',
      style: 'width:64px;height:32px;padding:4px 8px;border:1px solid var(--line);border-radius:8px;'
    });
    label.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const n = parseInt(input.value, 10);
      const el = editableNumber(Number.isFinite(n) && n > 0 ? n : value, { onCommit, prefix, suffix });
      input.replaceWith(el);
      if (Number.isFinite(n) && n > 0 && n !== value) onCommit(n);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = value; input.blur(); }
    });
  };
  label.addEventListener('click', start);
  label.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
  return label;
}

// Same idea as editableNumber but for short text — habit names, project tags.
export function editableText(value, { onCommit, cls = '' } = {}) {
  const label = h('span', { class: cls, tabindex: '0', role: 'button', style: 'cursor:pointer' }, value || '(untitled)');
  const start = () => {
    const input = h('input', { type: 'text', value, style: 'width:160px;height:32px;padding:4px 8px;border:1px solid var(--line);border-radius:8px;' });
    label.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim();
      const el = editableText(v || value, { onCommit, cls });
      input.replaceWith(el);
      if (v && v !== value) onCommit(v);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = value; input.blur(); }
    });
  };
  label.addEventListener('click', start);
  label.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
  return label;
}

// Donut chart, single accent colour at varying opacity per segment — keeps the
// one-accent-per-tab rule instead of pulling in a second colour family.
const DONUT_OPACITY = [1, 0.78, 0.6, 0.46, 0.34, 0.24, 0.16];

export function donut(segments, { size = 140, thickness = 16 } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const wrap = h('div', { class: 'row', style: 'gap:20px;align-items:center;flex-wrap:wrap' });
  if (total <= 0) { wrap.append(h('p', { class: 'empty' }, 'Nothing this month yet.')); return wrap; }

  const sorted = segments.filter(s => s.value > 0).sort((a, b) => b.value - a.value);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;

  const arcs = sorted.map((s, i) => {
    const frac = s.value / total;
    const len = frac * C;
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)"
      stroke-width="${thickness}" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}"
      opacity="${DONUT_OPACITY[i % DONUT_OPACITY.length]}" stroke-linecap="butt"></circle>`;
    offset += len;
    return el;
  }).join('');

  const svgHost = h('div', {});
  svgHost.innerHTML = `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;transform:rotate(-90deg)">${arcs}</svg>`;

  const legend = h('div', { style: 'flex:1;min-width:140px' });
  sorted.forEach((s, i) => {
    legend.append(h('div', { class: 'row', style: 'gap:8px;padding:3px 0' },
      h('span', { style: `width:10px;height:10px;border-radius:3px;background:var(--accent);opacity:${DONUT_OPACITY[i % DONUT_OPACITY.length]};flex:none` }),
      h('span', {}, s.label), h('span', { class: 'spacer' }),
      h('span', { class: 'l' }, s.display || String(s.value))));
  });

  wrap.append(svgHost, legend);
  return wrap;
}

export function toast(msg) {
  const t = h('div', { class: 'toast' }, msg);
  Object.assign(t.style, {
    position: 'fixed', left: '50%', bottom: '92px', transform: 'translateX(-50%)',
    background: '#111114', color: '#fff', padding: '10px 16px', borderRadius: '12px',
    fontSize: '13.5px', zIndex: 60, boxShadow: '0 8px 30px rgba(0,0,0,.25)', opacity: '0',
    transition: 'opacity .18s ease'
  });
  document.body.append(t);
  requestAnimationFrame(() => { t.style.opacity = '1'; });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 1900);
}
