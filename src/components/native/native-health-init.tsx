"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { startNativeHealth } from "@/lib/native-health";

/**
 * Native HealthKit bootstrap.
 *
 * Inside the Capacitor iOS shell this requests Health permissions once and
 * registers background sync (HKObserverQuery + enableBackgroundDelivery in
 * the native HealthKitSyncPlugin — docs/capacitor-healthkit-setup.md). On
 * web / PWA it is a no-op.
 *
 * Auth (2026-09-25): the plugin gets a per-user sync token from
 * /api/native/sync-token, which only answers a signed-in session. Signed out
 * → nothing starts. Re-run on every navigation so signing in starts sync
 * without an app restart. All steps are recorded (src/lib/native-health.ts)
 * and shown on /account, with a manual "Connect Apple Health" fallback.
 */
export function NativeHealthInit() {
  const pathname = usePathname();

  useEffect(() => {
    void startNativeHealth({ trigger: "auto" });
  }, [pathname]);

  return null;
}
