const CACHE = 'wordwise-v2';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'words.js', 'voice-maker.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
// The voice maker's libraries come from jsDelivr at fixed versions, so a saved copy never goes stale.
const LIBS = 'wordwise-libs';
// The dictionary and Discover lists only change when their ?v= does, so they're saved once.
const DATA = 'wordwise-data';
const isData = url => /\/dict\/[a-z]\.json$|\/discover\.json$/.test(url.pathname);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => /^wordwise-v\d+$/.test(k) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('@')) {
    event.respondWith(caches.open(LIBS).then(cache => cache.match(request).then(hit => hit || fetch(request).then(response => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Voice models are large and the voice maker already keeps its own copy.
  if (url.pathname.includes('/voices/')) return;
  if (isData(url)) {
    event.respondWith(caches.open(DATA).then(cache => cache.match(request).then(hit => hit || fetch(request).then(async response => {
      if (response.ok) {
        const old = await cache.matchAll(request, { ignoreSearch: true });
        if (old.length) await cache.delete(request, { ignoreSearch: true });
        await cache.put(request, response.clone());
      }
      return response;
    }))));
    return;
  }
  // Network first so new deploys show up straight away; the cache is only an offline fallback.
  // GitHub Pages lets browsers reuse files for 10 minutes, so each one is checked with the server.
  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
