"use client";

import { useEffect, useState } from "react";
import { readNativeHealthStatus, startNativeHealth, type NativeHealthStatus } from "@/lib/native-health";

const LABELS: Record<NativeHealthStatus["step"], string> = {
  "not-native": "Not running inside the iPhone app",
  "signed-out": "Signed out — sign in to start syncing",
  token: "Got a sync token",
  "asking-permission": "Asking for Apple Health permission…",
  denied: "Health permission was declined",
  granted: "Health permission granted",
  "background-started": "Background sync is on",
  synced: "Synced",
  error: "Failed",
};

/**
 * Health sync status + manual connect (plain; Kalysha restyles). Reads the
 * step trail the bootstrap writes and lets the person retry with a tap, which
 * also covers the case where the automatic start ran before sign-in finished.
 */
export function HealthSyncPanel({ lastServerSync }: { lastServerSync: { at: string; metrics: number; workouts: number; status: string } | null }) {
  const [status, setStatus] = useState<NativeHealthStatus | null>(null);
  const [history, setHistory] = useState<NativeHealthStatus[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = () => {
      const s = readNativeHealthStatus();
      setStatus(s.last);
      setHistory(s.history);
    };
    load();
    window.addEventListener("bl-native-health", load);
    return () => window.removeEventListener("bl-native-health", load);
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      await startNativeHealth({ trigger: "manual", force: true });
    } finally {
      setBusy(false);
    }
  };

  const native = status ? status.platform === "ios" : false;

  return (
    <div className="panel mt-6">
      <div className="ov">Apple Health</div>
      <p className="mt-2 text-sm">
        {status ? LABELS[status.step] : "No sync attempt recorded on this device yet."}
        {status?.error ? <span className="block text-xs text-[var(--color-text-muted)]">{status.error}</span> : null}
        {status?.step === "synced" ? (
          <span className="block text-xs text-[var(--color-text-muted)]">
            posted {status.posted ?? 0} samples
            {typeof status.visibleWorkouts === "number" ? ` · ${status.visibleWorkouts} workouts visible in the last 7 days` : ""}
          </span>
        ) : null}
      </p>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        {lastServerSync
          ? `Last sync received by the server: ${new Date(lastServerSync.at).toLocaleString()} · ${lastServerSync.metrics} metrics · ${lastServerSync.workouts} workouts · ${lastServerSync.status}`
          : "The server has never received Health data for this account."}
      </p>
      {native || !status ? (
        <button type="button" className="btn mt-4 w-full" onClick={() => void connect()} disabled={busy}>
          {busy ? "Connecting…" : "Connect Apple Health"}
        </button>
      ) : (
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          Open the Baseline iPhone app to connect Apple Health.
        </p>
      )}
      {history.length > 0 ? (
        <details className="mt-3 text-xs text-[var(--color-text-muted)]">
          <summary>Recent attempts</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {history
              .slice()
              .reverse()
              .slice(0, 12)
              .map((h, i) => (
                <li key={i}>
                  {new Date(h.at).toLocaleTimeString()} · {h.trigger} · {h.step}
                  {h.error ? ` · ${h.error}` : ""}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
