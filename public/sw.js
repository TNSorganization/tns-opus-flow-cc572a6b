const CACHE_PREFIX = "tns-opus";
const CACHE_VERSION = "__BUILD_VERSION__";
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const APP_ROOT = new URL("./", self.registration.scope).href;
const PRECACHE = [
  APP_ROOT,
  new URL("manifest.webmanifest", APP_ROOT).href,
  new URL("favicon.png", APP_ROOT).href,
  new URL("icons/icon-192.png", APP_ROOT).href,
  new URL("icons/icon-512.png", APP_ROOT).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    const networkResponse = fetch(request)
      .then(async (response) => {
        if (!response.ok) return null;
        const cache = await caches.open(CACHE_NAME);
        await cache.put(APP_ROOT, response.clone());
        return response;
      })
      .catch(() => null);

    // Keep refreshing in the background even when the cached shell wins the race.
    event.waitUntil(networkResponse.then(() => undefined));
    event.respondWith(
      (async () => {
        const cached = await caches.match(APP_ROOT);
        if (!cached) {
          return (
            (await networkResponse) ||
            new Response("TNS Opus is temporarily unavailable.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }

        return Promise.race([
          networkResponse.then((response) => response || cached),
          new Promise((resolve) => setTimeout(() => resolve(cached), 1_500)),
        ]);
      })(),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
