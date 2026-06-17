/* Baseline service worker — conservative, data-app-safe.
 *
 * Goals: make the installed PWA resilient offline WITHOUT serving stale
 * health data. So:
 *   - Navigations & API: network-FIRST (always fresh when online; fall back
 *     to the last-cached page only when truly offline).
 *   - Static build assets (/_next/static, icons, fonts): cache-first
 *     (they're content-hashed, so cached === correct).
 *   - Never cache non-GET or API POSTs.
 */
const CACHE = "baseline-v1";
const STATIC_RE = /\/_next\/static\/|\.(?:png|svg|ico|woff2?|webmanifest)$/;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache writes
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // only same-origin

  // Static, content-hashed assets → cache-first (stale-while-revalidate).
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })(),
    );
    return;
  }

  // Navigations (pages) → network-first, cache fallback when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><body style='font-family:system-ui;background:#181613;color:#f5f5f3;display:grid;place-items:center;height:100vh;margin:0;text-align:center'><div><h1 style='color:#e3a62b'>Offline</h1><p>Baseline can't reach the network right now. Reconnect to sync your data.</p></div>",
            { headers: { "Content-Type": "text/html" }, status: 503 },
          );
        }
      })(),
    );
  }
});
