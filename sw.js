// Service worker: makes the app installable and keeps it opening offline.
//
// Deliberately NETWORK-FIRST. A cache-first worker means edits don't show up
// until the cache is manually cleared — that exact trap cost hours on JARVIS.

const CACHE = 'lifeos-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/store.js',
  './js/auth.js',
  './js/ui.js',
  './js/tasks.js',
  './js/mod/today.js',
  './js/mod/body.js',
  './js/mod/habits.js',
  './js/mod/mind.js',
  './js/mod/money.js',
  './js/mod/projects.js',
  './js/mod/learning.js',
  './js/mod/ai.js',
  './js/mod/review.js',
  './js/mod/settings.js',
  './js/ai/context.js',
  './js/ai/brain.js'
];

// Notifications sent by the scheduled job. Clicking one opens the app.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const n = payload.notification || payload;
  event.waitUntil(self.registration.showNotification(n.title || 'Life OS', {
    body: n.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: './index.html' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow('./index.html');
  }));
});

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Firestore, Google auth and the CDN handle their own caching — stay out of it.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
  );
});
