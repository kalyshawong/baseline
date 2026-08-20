"use client";

import { useEffect } from "react";

/**
 * Reload the page when the local day changes while the page is mounted.
 *
 * Why: the native shell (and an installed PWA) keeps one WebView alive for
 * days. Server components render "today" once and the DOM never re-renders,
 * so date-anchored UI (soreness card, datestrip, today's call) silently
 * fossilizes on the day the page happened to load. Observed 2026-08-20:
 * yesterday's soreness chip "permanently" on screen.
 *
 * Checks on foreground/focus + a 60s tick; reloads only when the calendar
 * day actually changed, so an open draft is never interrupted mid-day.
 */
export function DayRollover() {
  useEffect(() => {
    const mountedDay = new Date().toDateString();
    const check = () => {
      if (document.visibilityState !== "visible") return;
      if (new Date().toDateString() !== mountedDay) window.location.reload();
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    const iv = setInterval(check, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      clearInterval(iv);
    };
  }, []);
  return null;
}
