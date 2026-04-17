// ═══════════════════════════════════════════════════════════
//  CMG Task Management — Service Worker
//  Handles caching for offline PWA support
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'cmg-tasks-v1';
const CACHE_VERSION = '1.0.0';

// Files to cache for offline use
const STATIC_ASSETS = [
  '/cmg-calendar/',
  '/cmg-calendar/index.html',
  '/cmg-calendar/manifest.json',
  '/cmg-calendar/icons/icon-72.png',
  '/cmg-calendar/icons/icon-96.png',
  '/cmg-calendar/icons/icon-128.png',
  '/cmg-calendar/icons/icon-144.png',
  '/cmg-calendar/icons/icon-152.png',
  '/cmg-calendar/icons/icon-192.png',
  '/cmg-calendar/icons/icon-384.png',
  '/cmg-calendar/icons/icon-512.png',
];

// External CDN resources to cache
const CDN_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Mono:wght@400;500&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
];

// ── Install: cache all static assets ──
self.addEventListener('install', event => {
  console.log('[SW] Installing CMG Task Management PWA...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Caching static assets...');
      // Cache static assets (required)
      return cache.addAll(STATIC_ASSETS).then(() => {
        // Cache CDN assets (optional — don't fail install if CDN is unavailable)
        return Promise.allSettled(
          CDN_ASSETS.map(url =>
            fetch(url).then(response => {
              if (response.ok) return cache.put(url, response);
            }).catch(() => {
              console.log('[SW] Could not cache CDN asset:', url);
            })
          )
        );
      });
    }).then(() => {
      console.log('[SW] Installation complete!');
      // Immediately activate the new SW without waiting
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean up old caches ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating new version...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activation complete! Taking control of all clients.');
      return self.clients.claim();
    })
  );
});

// ── Fetch: serve from cache, fallback to network ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase requests — always go to network for live data
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('google.com')
  ) {
    return;
  }

  // Cache-first strategy for static app assets
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // Serve from cache, but also refresh in background (stale-while-revalidate)
        const networkFetch = fetch(request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse; // Return cached immediately
      }

      // Not in cache — fetch from network and cache it
      return fetch(request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
          return networkResponse;
        }
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        return networkResponse;
      }).catch(() => {
        // Offline fallback — serve main app page
        if (request.destination === 'document') {
          return caches.match('/cmg-calendar/index.html');
        }
      });
    })
  );
});

// ── Message: handle skip-waiting from app ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
