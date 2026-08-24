// One stroke-icon set, shared by the nav and the modules.
// 1.7 stroke weight throughout — mixing weights is what makes hand-rolled icon
// sets look off. Drawn as paths rather than pulled from a library because the
// app has no build step and 20 inline paths beat a CDN dependency.

export const ICONS = {
  today:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/>',
  body:     '<path d="M4 9v6M20 9v6M7 6.5v11M17 6.5v11M7 12h10"/>',
  habits:   '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M8 12.4l2.7 2.7L16 9.8"/>',
  mind:     '<path d="M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2z"/>',
  money:    '<circle cx="12" cy="12" r="8.5"/><path d="M14 9.2c-2.4-1.4-4.3 0-4.3 2.1V16M9.2 12.6h3.6M8.8 16h6.4"/>',
  projects: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  learning: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H19v3H6.5"/>',
  ai:       '<path d="M12 3.5l1.85 5.15L19 10.5l-5.15 1.85L12 17.5l-1.85-5.15L5 10.5l5.15-1.85z"/><path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z"/>',
  review:   '<path d="M4 19V6.5A2.5 2.5 0 0 1 6.5 4H18a2 2 0 0 1 2 2v14H6.5A2.5 2.5 0 0 1 4 19z"/><path d="M8 9h8M8 13h5"/>',
  settings: '<path d="M4 7h9M19 7h1M4 17h5M15 17h5"/><circle cx="16" cy="7" r="2.4"/><circle cx="12" cy="17" r="2.4"/>',
  more:     '<circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/>',

  plus:     '<path d="M12 5v14M5 12h14"/>',
  minus:    '<path d="M5 12h14"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
  target:   '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
  trophy:   '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5V8a3 3 0 0 0 3 3M17 5.5h2.5V8a3 3 0 0 1-3 3"/><path d="M12 14v3.5M8.5 20.5h7l-.7-3h-5.6z"/>',
  scale:    '<path d="M12 4v3"/><rect x="3.5" y="7" width="17" height="13.5" rx="3.5"/><path d="M9 13.5a3 3 0 1 0 6 0"/>',
  note:     '<path d="M5 4.5h14v15H5z" rx="3"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>',
  play:     '<path d="M8 5.5l11 6.5-11 6.5z"/>',
  stop:     '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
  trash:    '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.5h9.2L17.5 7"/>',
  inbox:    '<path d="M3.5 13.5h4l1.6 3h5.8l1.6-3h4"/><path d="M6.2 5h11.6l3.2 8.5v5.5H3V13.5z"/>',
  spark:    '<path d="M12 3.5l1.85 5.15L19 10.5l-5.15 1.85L12 17.5l-1.85-5.15L5 10.5l5.15-1.85z"/>',
  book:     '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/>',
  film:     '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M3.5 9.5h17M8 5v14M16 5v14"/>',
  monitor:  '<rect x="3" y="4.5" width="18" height="12.5" rx="2.5"/><path d="M9 20.5h6M12 17v3.5"/>'
};

export function icon(name, size = 22) {
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
  stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export function iconEl(name, size = 22) {
  const tmp = document.createElement('div');
  tmp.innerHTML = icon(name, size).trim();
  return tmp.firstElementChild;
}
