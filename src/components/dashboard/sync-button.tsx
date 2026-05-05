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
          // No success label — the "Last sync: 7:46pm" timestamp on the
          // dashboard already conveys success, and listing each endpoint's
          // record count next to the button was noisy.
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
        <span className="text-xs text-red-400">{result}</span>
      )}
    </div>
  );
}
