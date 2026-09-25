"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Native HealthKit bootstrap.
 *
 * When the app runs inside the Capacitor iOS shell, this requests Health
 * permissions once and registers background sync (HKObserverQuery +
 * enableBackgroundDelivery in the native HealthKitSyncPlugin — see
 * docs/capacitor-healthkit-setup.md). On web / PWA it is a complete no-op.
 *
 * Auth (2026-09-25): the plugin gets a per-user sync token from
 * /api/native/sync-token, which only answers a signed-in session. Signed out
 * (e.g. on /login) → 401 → nothing starts. Re-checked on navigation so that
 * signing in starts sync without an app restart. The old shared
 * NEXT_PUBLIC_HEALTHKIT_SYNC_KEY is no longer read — it sent every phone's
 * data to one account.
 */

interface HealthKitSyncPlugin {
  requestAuthorization(): Promise<{ granted: boolean }>;
  startBackgroundSync(opts: { serverUrl: string; apiKey: string }): Promise<{ started: boolean }>;
  syncNow(): Promise<{ posted: number }>;
}

export function NativeHealthInit() {
  const pathname = usePathname();
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Capacitor, registerPlugin } = await import("@capacitor/core");
        if (Capacitor.getPlatform() !== "ios") return; // web/PWA: no-op

        const res = await fetch("/api/native/sync-token", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) return; // signed out or demo: don't sync
        const { token } = (await res.json()) as { token?: string };
        if (!token || cancelled || startedFor.current === token) return;

        const HealthKitSync = registerPlugin<HealthKitSyncPlugin>("HealthKitSync");

        const { granted } = await HealthKitSync.requestAuthorization();
        if (cancelled || !granted) return;

        await HealthKitSync.startBackgroundSync({
          serverUrl: window.location.origin,
          apiKey: token,
        });
        startedFor.current = token;

        // Prime the pipeline so the dashboard has Watch data on first launch.
        await HealthKitSync.syncNow().catch(() => {});
      } catch (err) {
        // Never let native bootstrap break the web app.
        console.warn("[NativeHealth] init skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
