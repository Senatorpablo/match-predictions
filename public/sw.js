const C = 'matchday-v5', ASSETS = ['/styles.css', '/app.js', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png', '/offline.html'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin && ASSETS.includes(u.pathname)) { e.respondWith(caches.match(r).then(h => h || fetch(r))); return; }
  if (r.mode === 'navigate') e.respondWith(fetch(r).catch(() => caches.match('/offline.html')));
});
