/* Forge service worker — keeps the app usable in a basement gym.
   App shell is cached so it launches without a connection; API calls
   always go to the network (never served stale) and simply fail when
   offline, which the app handles by queueing the save on-device. */
const CACHE = "forge-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(["/", "/index.html"])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* never cache the API — stale training data is worse than no data */
  if (url.pathname.startsWith("/api/")) return;

  /* same-origin assets: cache first, then fill the cache in the background */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => hit || caches.match("/index.html"));
        return hit || net;
      })
    );
    return;
  }

  /* cross-origin (exercise photos): serve from cache when offline */
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
