const CACHE_VERSION = "tns-opus-v3";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;

function scopedUrl(path) {
  const scope = new URL(self.registration.scope);
  return new URL(String(path || "").replace(/^\/+/, ""), scope).href;
}

async function cacheResponse(cacheName, request, response) {
  if (!response?.ok) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
}

async function warmShell() {
  const urls = [scopedUrl(""), scopedUrl("manifest.webmanifest")];
  const cache = await caches.open(SHELL_CACHE);
  await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) await cache.put(url, response);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(warmShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("tns-opus-") && ![SHELL_CACHE, ASSET_CACHE].includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    await cacheResponse(SHELL_CACHE, scopedUrl(""), response);
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const fallback = await cache.match(scopedUrl(""), { ignoreSearch: true, ignoreVary: true });
    if (fallback) return fallback;
    throw new Error("TNS Opus is unavailable offline until it has loaded once.");
  }
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (url.pathname.includes("/assets/") || url.pathname.includes("/icons/")) {
    event.respondWith(cacheFirstAsset(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") event.waitUntil(self.skipWaiting());
  if (event.data?.type === "WARM_APP_SHELL") event.waitUntil(warmShell());
});
