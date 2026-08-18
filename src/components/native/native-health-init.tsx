"use client";

import { useEffect } from "react";

/**
 * Native HealthKit bootstrap.
 *
 * When the app runs inside the Capacitor iOS shell, this requests Health
 * permissions once and registers background sync (HKObserverQuery +
 * enableBackgroundDelivery in the native HealthKitSyncPlugin — see
 * docs/capacitor-healthkit-setup.md). On web / PWA it is a complete no-op,
 * so the deployed site is unaffected.
 *
 * Auth note: uses NEXT_PUBLIC_HEALTHKIT_SYNC_KEY (same value as the server's
 * HEALTHKIT_SYNC_KEY). Acceptable for the solo, passcode-gated phase; replace
 * with a per-user session token when real auth lands (roadmap step 2).
 */

interface HealthKitSyncPlugin {
  requestAuthorization(): Promise<{ granted: boolean }>;
  startBackgroundSync(opts: { serverUrl: string; apiKey: string }): Promise<{ started: boolean }>;
  syncNow(): Promise<{ posted: number }>;
}

export function NativeHealthInit() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Dynamic import so web bundles don't need Capacitor at runtime.
        const { Capacitor, registerPlugin } = await import("@capacitor/core");
        if (Capacitor.getPlatform() !== "ios") return; // web/PWA: no-op

        const key = process.env.NEXT_PUBLIC_HEALTHKIT_SYNC_KEY;
        if (!key) {
          console.warn("[NativeHealth] NEXT_PUBLIC_HEALTHKIT_SYNC_KEY not set; skipping");
          return;
        }

        const HealthKitSync = registerPlugin<HealthKitSyncPlugin>("HealthKitSync");

        const { granted } = await HealthKitSync.requestAuthorization();
        if (cancelled || !granted) return;

        await HealthKitSync.startBackgroundSync({
          serverUrl: window.location.origin,
          apiKey: key,
        });

        // Prime the pipeline with an immediate full push so the dashboard has
        // Watch data on first launch instead of waiting for background delivery.
        await HealthKitSync.syncNow().catch(() => {});
      } catch (err) {
        // Never let native bootstrap break the web app.
        console.warn("[NativeHealth] init skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
