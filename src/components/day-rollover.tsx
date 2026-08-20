"use client";

import { useEffect } from "react";

/**
 * Reload the page when it has gone stale while mounted — two triggers:
 *
 * 1. DAY ROLLOVER: the native shell (and an installed PWA) keeps one
 *    WebView alive for days; server-rendered "today" fossilizes (observed
 *    2026-08-20: yesterday's soreness chip "permanently" on screen).
 * 2. NEW DEPLOY: after every Vercel deploy the open page kept showing the
 *    old build until a manual force-quit ("you have no hide button" while
 *    prod verifiably had it). On foreground, ask /api/version which build
 *    the server runs; mismatch with the sha this page was rendered with →
 *    reload. Fetch only on foreground/focus (not the interval) so we don't
 *    poll while she's actively using the app.
 *
 * Reloads never fire while backgrounded and never mid-day without cause,
 * so an open draft is safe.
 */
export function DayRollover({ buildSha }: { buildSha?: string }) {
  useEffect(() => {
    const mountedDay = new Date().toDateString();
    const checkDay = () => {
      if (document.visibilityState !== "visible") return;
      if (new Date().toDateString() !== mountedDay) window.location.reload();
    };
    let versionCheckAt = 0;
    const checkVersion = () => {
      if (document.visibilityState !== "visible" || !buildSha) return;
      const now = Date.now();
      if (now - versionCheckAt < 30_000) return; // debounce focus+visibility double-fire
      versionCheckAt = now;
      fetch("/api/version", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v) => {
          if (v?.sha && v.sha !== buildSha) window.location.reload();
        })
        .catch(() => {});
    };
    const onWake = () => {
      checkDay();
      checkVersion();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    const iv = setInterval(checkDay, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      clearInterval(iv);
    };
  }, [buildSha]);
  return null;
}
