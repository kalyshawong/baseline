"use client";

/**
 * Native HealthKit bootstrap — shared by the silent start on every page
 * (NativeHealthInit) and the manual "Connect Apple Health" button on
 * /account. Every step is written to localStorage so a tester can show what
 * happened on their phone without Xcode (2026-09-26: Nahuel signed in and
 * never saw the Health sheet; the old bootstrap swallowed every error).
 */

interface HealthKitSyncPlugin {
  requestAuthorization(): Promise<{ granted: boolean }>;
  startBackgroundSync(opts: { serverUrl: string; apiKey: string }): Promise<{ started: boolean }>;
  syncNow(): Promise<{ posted: number; workoutsVisible7d?: number }>;
  stopBackgroundSync(): Promise<unknown>;
}

export type NativeHealthStep =
  | "not-native"
  | "signed-out"
  | "token"
  | "asking-permission"
  | "denied"
  | "granted"
  | "background-started"
  | "synced"
  | "error";

export interface NativeHealthStatus {
  step: NativeHealthStep;
  at: string; // ISO
  platform: string;
  error?: string;
  posted?: number;
  visibleWorkouts?: number;
  trigger: "auto" | "manual";
}

const STATUS_KEY = "bl_native_health_status";
const HISTORY_KEY = "bl_native_health_history";

export function readNativeHealthStatus(): { last: NativeHealthStatus | null; history: NativeHealthStatus[] } {
  try {
    const last = localStorage.getItem(STATUS_KEY);
    const hist = localStorage.getItem(HISTORY_KEY);
    return {
      last: last ? (JSON.parse(last) as NativeHealthStatus) : null,
      history: hist ? (JSON.parse(hist) as NativeHealthStatus[]) : [],
    };
  } catch {
    return { last: null, history: [] };
  }
}

function record(s: NativeHealthStatus) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(s));
    const hist = readNativeHealthStatus().history;
    hist.push(s);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-30)));
  } catch {
    /* storage unavailable — status is best-effort */
  }
  try {
    window.dispatchEvent(new CustomEvent("bl-native-health", { detail: s }));
  } catch {
    /* no window */
  }
}

let lastTokenStarted: string | null = null;
let lastResumeSync = 0;

/**
 * Push new Health data when the app comes back to the foreground.
 * startNativeHealth only syncs on a cold start (a token already started
 * returns early), so reopening the app from the background never synced —
 * workouts and cycle logs sat on the phone until the app was killed and
 * relaunched. Throttled to once a minute.
 */
export async function syncNativeHealthOnResume(): Promise<void> {
  if (!lastTokenStarted) return; // not started yet — startNativeHealth handles it
  const now = Date.now();
  if (now - lastResumeSync < 60_000) return;
  lastResumeSync = now;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    const HealthKitSync = registerPlugin<HealthKitSyncPlugin>("HealthKitSync");
    await HealthKitSync.syncNow();
  } catch (err) {
    console.warn("[NativeHealth] resume sync failed:", err);
  }
}

/**
 * Runs the whole handoff: session → token → Health permission → background
 * observers → one immediate sync. Returns the final status. Safe to call
 * repeatedly; a token already started is not re-registered unless `force`.
 */
export async function startNativeHealth(opts: { trigger: "auto" | "manual"; force?: boolean }): Promise<NativeHealthStatus> {
  const base = { at: new Date().toISOString(), trigger: opts.trigger };
  let platform = "web";
  const done = (s: Omit<NativeHealthStatus, "at" | "trigger" | "platform">) => {
    const full: NativeHealthStatus = { ...base, platform, ...s };
    record(full);
    return full;
  };

  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    platform = Capacitor.getPlatform();
    if (platform !== "ios") return done({ step: "not-native" });

    const res = await fetch("/api/native/sync-token", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return done({ step: "signed-out", error: `sync-token ${res.status}` });
    const { token } = (await res.json()) as { token?: string };
    if (!token) return done({ step: "signed-out", error: "no token in response" });
    if (!opts.force && lastTokenStarted === token) return done({ step: "background-started" });
    record({ ...base, platform, step: "token" });

    const HealthKitSync = registerPlugin<HealthKitSyncPlugin>("HealthKitSync");

    record({ ...base, platform, step: "asking-permission" });
    const { granted } = await HealthKitSync.requestAuthorization();
    if (!granted) return done({ step: "denied" });
    record({ ...base, platform, step: "granted" });

    await HealthKitSync.startBackgroundSync({ serverUrl: window.location.origin, apiKey: token });
    lastTokenStarted = token;
    record({ ...base, platform, step: "background-started" });

    const r = await HealthKitSync.syncNow();
    return done({ step: "synced", posted: r?.posted ?? 0, visibleWorkouts: r?.workoutsVisible7d });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[NativeHealth] failed:", err);
    return done({ step: "error", error: msg });
  }
}

/**
 * Stop the native HealthKit sync (no-op on web / older builds without the
 * method). Called before sign-out and account deletion so the phone stops
 * posting Health data to the account being left.
 */
export async function stopNativeSync(): Promise<void> {
  try {
    const { Capacitor, registerPlugin } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "ios") return;
    const plugin = registerPlugin<HealthKitSyncPlugin>("HealthKitSync");
    await plugin.stopBackgroundSync();
    lastTokenStarted = null;
  } catch {
    /* older native build without the method — the server-side token check still applies */
  }
}
