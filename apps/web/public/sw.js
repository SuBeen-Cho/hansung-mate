/* Public app shell only: authenticated APIs, personal records and signed documents are never cached. */
const CACHE = "mate-shell-20260928-stage3";
const SHELL = ["/", "/manifest.webmanifest", "/brand/mate-icon.svg", "/brand/boogie-hello.png", "/brand/boogie-study.png"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL))); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("mate-shell-") && key !== CACHE).map((key) => caches.delete(key))))); });
self.addEventListener("message", (event) => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async (response) => { if (response.ok && url.pathname === "/") (await caches.open(CACHE)).put("/", response.clone()); return response; }).catch(async () => (await caches.match("/")) || Response.error()));
  } else if (/^\/(assets|brand|templates)\//.test(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => { if (response.ok) (await caches.open(CACHE)).put(request, response.clone()); return response; })));
  }
});
