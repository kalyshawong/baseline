"use client";

import { useEffect } from "react";

/**
 * Drops the viewer's IANA timezone into a `bl_tz` cookie so the server can
 * compute "today" and day bounds in HER day, not the server's.
 *
 * Why this senses correctly with zero settings: Intl reads the OS clock's
 * zone (the same one the menu-bar clock uses), which follows physical
 * location automatically on macOS/iOS. It is NOT derived from IP, so VPNs
 * don't fool it. Works identically in the native shell's WebView.
 *
 * If the zone changed since last visit (travel), the next server render
 * picks it up; we reload once when the cookie was present-but-stale so the
 * current page immediately re-renders in the right day. No reload on first
 * ever visit (cookie absent → server used fallback; navigation is imminent
 * anyway and every subsequent render is correct).
 */
export function TzCookie() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const existing = document.cookie
        .split("; ")
        .find((c) => c.startsWith("bl_tz="))
        ?.split("=")[1];
      if (existing === encodeURIComponent(tz)) return;
      const hadStale = existing !== undefined;
      document.cookie = `bl_tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      if (hadStale) window.location.reload();
    } catch {
      /* Intl unavailable — server fallback applies */
    }
  }, []);
  return null;
}
