/* Service worker — the reader works fully offline once opened over http(s).
   The page itself: network first (so every new version you upload is used at once), the saved copy when offline.
   Everything else: the saved copy first, refreshed in the background. */
const CACHE = 'kurdish-reader-202611271355';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })))).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k.startsWith('kurdish-reader-')).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isPage = req.mode === 'navigate' || (sameOrigin && /\/(index\.html)?$/.test(url.pathname));
  if (isPage) {
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(6000)]);
        if (res && res.ok) { const c = await caches.open(CACHE); c.put('./index.html', res.clone()).catch(() => {}); }
        return res;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }
  // OCR engine + language data and our own files: cached after the first download so they also work offline
  const ocrAsset = /jsdelivr\.net|unpkg\.com|raw\.githubusercontent\.com|tessdata/.test(url.host + url.pathname);
  if (sameOrigin || ocrAsset) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
