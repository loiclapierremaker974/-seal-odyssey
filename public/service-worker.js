const CACHE_VERSION = 'seal-odyssey-p0-0.8.0';
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
];

const scopedUrl = (path) => new URL(path, self.registration.scope).href;

async function precacheAppShell() {
  const cache = await caches.open(CACHE_VERSION);
  const shellUrls = APP_SHELL.map(scopedUrl);
  await cache.addAll(shellUrls);

  // Vite fingerprints JS and CSS in production. Discover those generated
  // assets from the built index instead of hard-coding filenames that change
  // at every release.
  const indexResponse = await cache.match(scopedUrl('./index.html'));
  if (!indexResponse) return;

  const html = await indexResponse.text();
  const discoveredUrls = new Set(shellUrls);
  const attributePattern = /\b(?:src|href)=(?:"([^"]+)"|'([^']+)')/gi;
  let match;

  while ((match = attributePattern.exec(html))) {
    const reference = match[1] || match[2];
    if (!reference || reference.startsWith('data:')) continue;
    const url = new URL(reference, scopedUrl('./index.html'));
    if (url.origin === self.location.origin) discoveredUrls.add(url.href);
  }

  await cache.addAll([...discoveredUrls]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith('seal-odyssey-') &&
                key !== CACHE_VERSION &&
                key !== RUNTIME_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          event.waitUntil(
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)),
          );
          return response;
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(scopedUrl('./index.html')))
          );
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }

        const copy = response.clone();
        event.waitUntil(
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)),
        );
        return response;
      });
    }),
  );
});
