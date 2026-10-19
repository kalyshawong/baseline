"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Asks once for what the plan can't work without (sex, height). Saves to the
 * profile and re-renders the plan. Plain controls — Kalysha to style.
 */
export function MissingFields({ missing }: { missing: string[] }) {
  const router = useRouter();
  const [sex, setSex] = useState<"" | "female" | "male">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!missing.includes("sex")) return null;

  function save() {
    if (!sex) return;
    setError(null);
    start(async () => {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sex }),
      });
      if (res.ok) router.refresh();
      else setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
    });
  }

  return (
    <div className="panel" style={{ padding: 16, marginTop: 12 }}>
      <p style={{ fontSize: 13 }}>The plan needs your sex for the abs target, the energy floor and water.</p>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        {(["female", "male"] as const).map((s) => (
          <button key={s} type="button" onClick={() => setSex(s)} aria-pressed={sex === s}
            style={{ padding: "8px 14px", border: "1px solid var(--color-border, #444)", background: sex === s ? "var(--color-surface-2, #333)" : "transparent", color: "inherit" }}>
            {s === "female" ? "Female" : "Male"}
          </button>
        ))}
        <button type="button" onClick={save} disabled={!sex || pending} style={{ padding: "8px 14px", marginLeft: "auto" }}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p style={{ color: "var(--red, #e55)", fontSize: 12, marginTop: 6 }}>{error}</p>}
    </div>
  );
}
