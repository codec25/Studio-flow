const CACHE_VERSION = 'studioflow-cache-v2';
const STATIC_ASSETS = [
  './',
  'index.html',
  'admin.html',
  'book.html',
  'clients.html',
  'services.html',
  'portal.html',
  'register.html',
  'auth.html',
  'billing.html',
  'invoice.html',
  'app-api.js',
  'app-ui.js',
  'pwa-init.js',
  'manifest.webmanifest',
  'offline.html',
  'icons/icon.svg',
  'icons/icon-maskable.svg'
];

// List of external domains to cache (CDNs for Styles/Fonts)
const EXTERNAL_WHITELIST = [
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net'
];

// Install Event: Populate Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Clean old versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch Event: Smart Caching
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isNavigation = event.request.mode === 'navigate';

  // 1. Handle HTML Navigations (Network First, fallback to Offline.html)
  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          // If the specific page isn't cached, show the general offline page
          return cached || caches.match('offline.html');
        })
    );
    return;
  }

  // 2. Handle External Assets (Tailwind/Fonts)
  const isExternal = EXTERNAL_WHITELIST.some(domain => requestUrl.hostname.includes(domain));
  
  if (isExternal || requestUrl.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        // Return cached version if found
        if (cached) return cached;

        // Otherwise fetch and store for next time
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic' && !isExternal) {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        });
      })
    );
  }
});