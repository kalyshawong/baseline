"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** "Consider a swap?" — yes / no. No changes nothing. */
export function HybridSwap({ kind, swap }: { kind: string; swap: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const answer = async (a: "yes" | "no") => {
    setBusy(true);
    try {
      await fetch("/api/hybrid/swap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answer: a, kind, swap }) });
      router.refresh();
    } catch {
      setBusy(false);
    }
  };
  return (
    <div className="row2">
      <button type="button" className="btn" disabled={busy} onClick={() => answer("yes")}>Yes</button>
      <button type="button" className="btn" disabled={busy} onClick={() => answer("no")}>No</button>
    </div>
  );
}
