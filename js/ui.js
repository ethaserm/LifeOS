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
