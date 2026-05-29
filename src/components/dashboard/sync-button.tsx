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
    <div className="flex items-center gap-4">
      <button
        onClick={handleSync}
        disabled={isPending}
        className="btn disabled:opacity-50"
      >
        {isPending ? "Syncing…" : "⟳ Sync Now"}
      </button>
      {result && (
        <span className="text-xs text-[var(--color-red)]">{result}</span>
      )}
    </div>
  );
}
