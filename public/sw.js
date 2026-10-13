// Piano Drills service worker: network first (always fresh when online), cached copy when offline.
// Bump VERSION when you deploy so old caches get cleaned up.
const VERSION = "v4";
const APP_CACHE = "piano-drills-" + VERSION;
const FONT_CACHE = "piano-drills-fonts";
const APP_FILES = [
  "/", "/index.html", "/css/app.css", "/manifest.webmanifest",
  "/js/app.js", "/js/theory.js", "/js/levels.js", "/js/keyboard.js", "/js/audio.js", "/js/store.js",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(caches.open(FONT_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(req.mode === "navigate" ? "/index.html" : req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("/index.html") : Response.error()))
  );
});
