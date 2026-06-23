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

    // In local dev the service worker caches build assets (incl. CSS) and serves
    // them stale-first, which makes live edits "not appear". So on localhost we
    // actively tear down any registered worker + caches instead of registering.
    const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
    if (isLocalhost) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);

  return null;
}
