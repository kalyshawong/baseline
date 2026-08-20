"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once, after the page is interactive. Rendered
 * in the root layout. No UI. Silently no-ops where service workers aren't
 * supported (or on http, where they're disallowed).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Tear the worker down entirely in two environments:
    //  - localhost: it serves live edits stale-first (original reason)
    //  - the NATIVE SHELL: the shell always loads the remote URL with network
    //    available; a stale SW there served old HTML across force-quits for
    //    DAYS ("zero change" while prod was verifiably updated, 2026-08-20).
    //    Offline resilience matters for the browser PWA, not the shell.
    const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    const isNativeShell = navigator.userAgent.includes("BaselineNative");
    if (isLocalhost || isNativeShell) {
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          const hadSw = regs.length > 0;
          return Promise.all(regs.map((r) => r.unregister())).then(() => {
            // A stale SW may already have served THIS page load — reload once
            // (marker in sessionStorage prevents loops) so the user sees the
            // real current deploy, not the cache's memory of an old one.
            if (hadSw && isNativeShell && !sessionStorage.getItem("bl_sw_purged")) {
              sessionStorage.setItem("bl_sw_purged", "1");
              window.location.reload();
            }
          });
        })
        .catch(() => {});
      return;
    }

    const onLoad = () => {
      // updateViaCache:'none' = always byte-check sw.js against the server;
      // reg.update() forces that check on every launch instead of the
      // browser's lazy ~24h cadence. Prevents an old worker from lingering.
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((reg) => reg.update().catch(() => {}))
        .catch(() => {
          /* registration failures are non-fatal */
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);

  return null;
}
