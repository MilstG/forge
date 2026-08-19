/* Forge service worker — offline in the gym, without ever serving stale code.
 *
 * The rule that matters: HTML is network-first. Vite fingerprints the JS
 * bundle, so index.html is the only file that says which build to load.
 * Serving it from cache first pins the app to an old deploy indefinitely,
 * which is exactly the bug this version fixes.
 *
 * Bump CACHE on any change here so activate() clears the old one.
 */
const CACHE = "forge-v3";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(["/", "/index.html"]).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

/* ---- push notifications ----
   The payload is JSON from the server. iOS requires every push to be
   user-visible, so a malformed payload still shows something rather than
   silently burning the subscription's trust budget. */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  const title = d.title || "Forge";
  e.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || "",
      tag: d.tag || "forge",
      renotify: true,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: d.url || "/" },
    })
  );
});

/* Focus an open tab if there is one, otherwise open the app. */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

const isHTML = (req) =>
  req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* API: always live. Stale training data is worse than none. */
  if (url.pathname.startsWith("/api/")) return;

  /* HTML: network first, cache only as the offline fallback. This is what
     makes a new deploy visible on the next load. */
  if (isHTML(req)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html").then((hit) => hit || Response.error()))
    );
    return;
  }

  /* Fingerprinted build assets are immutable — cache first is safe and fast. */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  /* Exercise photos: cache first so they survive a dead signal. */
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});
