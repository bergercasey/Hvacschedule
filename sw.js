/* sw.js */
const CACHE_STATIC = 'hvac-static-v1';
const STATIC_ASSETS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k.startsWith('hvac-static-') && k !== CACHE_STATIC) ? caches.delete(k) : null));
  })());
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache serverless endpoints
  if (url.pathname.startsWith('/.netlify/functions/')) {
    return; // default network behavior
  }

  // HTML: network-first
  if (request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(request).catch(() => new Response('Offline', { status: 503 }))
    );
    return;
  }

  // Static: cache-first
  if (['script','style','image','font'].includes(request.destination) || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const resClone = res.clone();
        caches.open(CACHE_STATIC).then(cache => cache.put(request, resClone));
        return res;
      }))
    );
  }
});
