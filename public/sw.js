/**
 * App-shell service worker.
 *
 * Cached audio lives in IndexedDB and module text lives in the JS bundle, but
 * none of that is reachable if the page itself will not load without a
 * network. This caches the shell so a pre-cached module is genuinely usable
 * offline.
 *
 * Deliberately runtime-populated rather than build-manifest driven: asset
 * filenames are content-hashed by Vite, and a hand-maintained precache list
 * would rot silently on the next build.
 */

const CACHE = "greek-dialogos-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add("/")).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API responses are never cached here. Audio and AI explanations have their
  // own IndexedDB caches with their own invalidation rules; a second, dumber
  // copy in the SW would serve stale results those rules cannot reach.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: try the network so a deploy is picked up, fall back to the
  // cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/").then((cached) => cached || Response.error()))
    );
    return;
  }

  // Static assets are content-hashed, so a cache hit is always correct.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || Response.error());
    })
  );
});
