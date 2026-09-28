const CACHE_PREFIX = "tns-opus";
const CACHE_VERSION = "v1";
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
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (!response.ok) return (await caches.match(APP_ROOT)) || response;
          const cache = await caches.open(CACHE_NAME);
          cache.put(APP_ROOT, response.clone());
          return response;
        })
        .catch(() => caches.match(APP_ROOT)),
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
