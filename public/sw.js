// Retire the previous offline worker and every shell it cached. Keeping this
// lightweight worker at the old URL lets installed copies update themselves.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((key) => key.startsWith("tns-opus")).map((key) => caches.delete(key)),
          ),
        ),
      self.registration.unregister(),
    ]).then(async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) client.postMessage({ type: "OPUS_CACHE_RETIRED" });
      await self.clients.claim();
    }),
  );
});
