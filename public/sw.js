// LMDE Caisse — Service Worker
const CACHE_NAME = 'lmde-caisse-v1';
const OFFLINE_URL = '/offline';

// Assets to pre-cache for offline use
const PRECACHE_ASSETS = [
  '/',
  '/dashboard',
  '/pos-sales-terminal',
  '/stock',
  '/caisse-historique',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
  '/assets/images/lmde-caisse-icon-512.png',
  '/assets/images/lmde-caisse-icon-192.png',
  '/assets/images/app_logo.png',
];

// Install event — pre-cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

// Fetch event — network-first for API, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Supabase API calls — always need fresh data
  if (url.hostname.includes('supabase.co')) return;

  // Skip external resources
  if (url.origin !== self.location.origin) return;

  // For navigation requests (HTML pages) — network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || caches.match(OFFLINE_URL)
          )
        )
    );
    return;
  }

  // For static assets (_next/static, images) — cache first
  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const cloned = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
            }
            return response;
          })
      )
    );
    return;
  }

  // Default: network first
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pos-data') {
    event.waitUntil(syncPOSData());
  }
});

async function syncPOSData() {
  // Placeholder for future offline POS sync logic
  console.log('[SW] Background sync triggered');
}

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'LMDE Caisse', {
      body: data.body || '',
      icon: '/assets/images/lmde-caisse-icon-192.png',
      badge: '/assets/images/lmde-caisse-icon-192.png',
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(clients.openWindow(event.notification.data.url));
  }
});
