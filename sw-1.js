/**
 * Service Worker for Presensi Mobile PWA
 * Cache-First Strategy untuk aset statis
 */

const CACHE_NAME = 'presensi-v1';
const DYNAMIC_CACHE = 'presensi-dynamic-v1';

// Daftar aset statis yang wajib di-cache (sesuai file yang ada)
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './svg.css',
  './script.js',
  './svg.js',
  './benchmark.js',
  './presensi-patch.js',
  './dataset.js',
  './pages/index.js',
  './pages/home.js',
  './pages/presensi.js'
];

// MediaPipe CDN assets (stale-while-revalidate)
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs',
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
];

// ─────────────────────────────────────────────────────────────────────────────
// INSTALL EVENT
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(STATIC_ASSETS);

      // Cache CDN assets secara terpisah
      for (const asset of CDN_ASSETS) {
        try {
          const response = await fetch(asset, { mode: 'no-cors' });
          if (response.ok || response.type === 'opaque') {
            await cache.put(asset, response);
          }
        } catch (err) {
          console.warn('[SW] Gagal cache CDN:', asset);
        }
      }

      console.log('[SW] Install selesai');
      self.skipWaiting();
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVATE EVENT - Bersihkan cache lama
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');

  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      const validCaches = [CACHE_NAME, DYNAMIC_CACHE];

      await Promise.all(
        cacheKeys
          .filter(key => !validCaches.includes(key))
          .map(key => {
            console.log('[SW] Menghapus cache lama:', key);
            return caches.delete(key);
          })
      );

      await self.clients.claim();
      console.log('[SW] Aktif dan mengontrol semua client');
    })()
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// FETCH EVENT - Cache-First dengan fallback ke network
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Untuk aset statis lokal: Cache-First
  if (isStaticAsset(url.pathname)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // Untuk CDN MediaPipe: Stale-While-Revalidate
  if (isCDNAsset(url.href)) {
    event.respondWith(handleCDNAsset(request));
    return;
  }

  // Default: Cache-First
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        return response;
      }

      return fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Fallback untuk navigasi
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Konten tidak tersedia offline', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE EVENT - Komunikasi dengan client
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const data = event.data;

  switch (data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_NAME });
      break;

    case 'CLEAR_CACHE':
      event.waitUntil(clearAllCaches());
      event.ports[0].postMessage({ status: 'done' });
      break;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle static assets - Cache-First
 */
async function handleStaticAsset(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // Refresh cache di background
    fetchAndCache(request);
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Asset tidak tersedia offline', { status: 404 });
  }
}

/**
 * Handle CDN assets - Stale-While-Revalidate
 */
async function handleCDNAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // Background refresh
  const fetchPromise = fetch(request)
    .then(response => {
      if (response.ok || response.type === 'opaque') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(err => console.warn('[SW] CDN fetch failed:', err));

  if (cachedResponse) {
    event.waitUntil(fetchPromise);
    return cachedResponse;
  }

  return fetchPromise;
}

/**
 * Fetch and cache helper
 */
async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
  } catch (error) {
    // Silent fail
  }
}

/**
 * Clear all caches
 */
async function clearAllCaches() {
  const cacheKeys = await caches.keys();
  await Promise.all(cacheKeys.map(key => caches.delete(key)));
  console.log('[SW] Semua cache dihapus');
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function isStaticAsset(pathname) {
  // Aset lokal yang perlu di-cache
  return pathname.match(/\.(css|js|json|html)$/i) &&
         !pathname.includes('cdn.jsdelivr.net') &&
         !pathname.includes('storage.googleapis.com');
}

function isCDNAsset(url) {
  return url.includes('cdn.jsdelivr.net') ||
         url.includes('storage.googleapis.com') ||
         url.includes('mediapipe');
}
