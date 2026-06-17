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
