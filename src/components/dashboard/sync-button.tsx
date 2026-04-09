"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleSync() {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/sync", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          const s = data.synced;
          const parts = [];
          if (s.readiness) parts.push(`${s.readiness} readiness`);
          if (s.sleep) parts.push(`${s.sleep} sleep`);
          if (s.stress) parts.push(`${s.stress} stress`);
          if (s.activity) parts.push(`${s.activity} activity`);
          if (s.heartrate) parts.push(`${s.heartrate} HR samples`);
          if (s.spo2) parts.push(`${s.spo2} SpO2`);
          if (s.tags) parts.push(`${s.tags} tags`);
          if (s.sessions) parts.push(`${s.sessions} sessions`);
          if (s.resilience) parts.push(`${s.resilience} resilience`);
          if (s.vo2max) parts.push(`${s.vo2max} VO2`);
          if (s.workouts) parts.push(`${s.workouts} workouts`);
          if (s.sleepTime) parts.push(`${s.sleepTime} sleep time`);
          setResult(parts.length > 0 ? `Synced: ${parts.join(", ")}` : "Synced (no new data)");
          router.refresh();
        } else {
          setResult(`Error: ${data.error}`);
        }
      } catch {
        setResult("Sync failed — check console");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={isPending}
        className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-50"
      >
        {isPending ? "Syncing..." : "Sync Now"}
      </button>
      {result && (
        <span className="text-xs text-[var(--color-text-muted)]">{result}</span>
      )}
    </div>
  );
}
