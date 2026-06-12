// sw.js
const CACHE_NAME = 'presensi-v1.2';
const STATIC_ASSETS = [
  '/presensi/',
  '/presensi/index.html',
  '/presensi/script.js',
  '/presensi/style.css',
  '/presensi/svg.js',
  '/presensi/svg.css',
  '/presensi/benchmark.js',
  '/presensi/presensi-patch.js',
  '/presensi/manifest.json',
  '/presensi/dataset.js',
  '/presensi/pages/index.js',
  '/presensi/pages/home.js',
  '/presensi/pages/presensi.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ✅ KRITIS: Jangan intercept request ke CDN eksternal
  // MediaPipe, jsDelivr, dll harus langsung ke network
  if (url.origin !== self.location.origin) return;

  // Jangan cache request non-GET
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).catch(() => {
        // Fallback ke index.html untuk navigasi SPA
        if (e.request.mode === 'navigate') {
          return caches.match('/presensi/index.html');
        }
      });
    })
  );
});
