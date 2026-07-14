const CACHE_NAME = 'atlas-v5.8.10-icons-centered-loginfix-1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css?v=5810-icons-centered-loginfix-1',
  './app.js?v=5810-icons-centered-loginfix-1',
  './firebase.js?v=5810-icons-centered-loginfix-1',
  './manifest.webmanifest',
  './offline.html',
  './icons/apple-touch-icon.png',
  './icons/atlas-192.png',
  './icons/atlas-512.png',
  './icons/atlas-512-maskable.png',
  './market-icons/dow.png',
  './market-icons/nasdaq.png',
  './market-icons/sp500.png',
  './market-icons/russell.png',
  './market-icons/dax.png',
  './market-icons/gold.png',
  './market-icons/silver.png',
  './market-icons/copper.png',
  './market-icons/wti.png',
  './market-icons/brent.png',
  './market-icons/dxy.png',
  './market-icons/eurusd.png',
  './market-icons/bitcoin.png',
  './market-icons/custom.png',
  './assets/atlas-official-logo.png',
  './assets/atlas-brand-lockup.png',
  './assets/atlas-app-icon-master.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('atlas-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept Firebase, Yahoo, proxy or other external API traffic.
  if (url.origin !== self.location.origin) return;

  // Navigation: network first, cached app shell/offline fallback second.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(async () => {
          return (await caches.match('./index.html')) || (await caches.match('./offline.html'));
        })
    );
    return;
  }

  // Local static assets: cache first, update in background.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
