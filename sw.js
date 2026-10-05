// Two Paydays service worker: keeps the app on this computer so it opens offline, and installs new versions only
// when the person presses Update now. It never touches the planner's data, which lives in the app's own storage.
const VERSION = '1.0.0';
const CACHE = 'two-paydays-' + VERSION;
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./version.json", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png", "./fonts/manrope-latin-wght.woff2", "./fonts/bricolage-grotesque-latin-wght.woff2"];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('two-paydays-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// the page sends this when the person presses Update now
self.addEventListener('message', event => { if (event.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // what's-new notes: always ask the server, fall back to the copy kept with this version
  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match('./version.json')));
    return;
  }
  event.respondWith(caches.open(CACHE).then(cache => cache.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('./index.html').then(r => r || fetch(req));
    return fetch(req);
  })));
});
