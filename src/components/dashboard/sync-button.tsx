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
          setResult(
            `Synced: ${data.synced.readiness}r ${data.synced.sleep}s ${data.synced.stress}st ${data.synced.heartrate}hr ${data.synced.activity ?? 0}a`
          );
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
