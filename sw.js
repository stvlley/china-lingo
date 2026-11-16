/* China Lingo service worker: network-first app code, cache-first assets, full offline fallback. */
const VERSION = "cl-1.2.0";
const AUDIO = "cl-audio"; /* recorded audio: hashed, immutable file names, kept across versions */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/data.js",
  "./js/fx.js",
  "./js/app.js",
  "./js/pwa.js",
  "./fonts/nunito-latin-600-normal.woff2",
  "./fonts/nunito-latin-700-normal.woff2",
  "./fonts/nunito-latin-800-normal.woff2",
  "./fonts/nunito-latin-900-normal.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  /* cache: "reload" skips the HTTP cache so an update never re-caches stale files */
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })));
    try { await c.add(new Request("./audio/index.json", { cache: "reload" })); } catch (err) { /* no recordings yet */ }
  }));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION && k !== AUDIO).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await fetch(req, { cache: "no-cache" });
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (err) {
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  /* recorded audio: cache-first forever (file names change when content changes) */
  if (/\/audio\/(sfx|zh)\//.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(AUDIO);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try { const res = await fetch(req); if (res && res.ok) cache.put(req, res.clone()); return res; }
      catch (err) { return Response.error(); }
    })());
    return;
  }

  /* app code (js/css/json/manifest): network-first so updates land immediately; cache when offline */
  if (/\.(js|css|json|webmanifest)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await fetch(req, { cache: "no-cache" });
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        return (await caches.match(req, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  /* fonts, icons: cache-first, refresh in background */
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then(res => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
