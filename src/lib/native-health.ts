"use client";

/**
 * Stop the native HealthKit sync (no-op on web / older builds without the
 * method). Called before sign-out and account deletion so the phone stops
 * posting Health data to the account being left.
 */
export async function stopNativeSync(): Promise<void> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "ios") return;
    const plugin = registerPlugin<{ stopBackgroundSync(): Promise<unknown> }>("HealthKitSync");
    await plugin.stopBackgroundSync();
  } catch {
    /* older native build without the method — the server-side token check still applies */
  }
}
