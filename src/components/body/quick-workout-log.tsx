"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Natural-language workout quick-log. Type "legs two days ago: bulgarians
 * 3x8 @25, RDLs 4x10 @60" → parsed into a structured session + sets, which
 * flow into weekly volume, PRs, RPE-creep detection, everything.
 */

interface Summary {
  exercise: string;
  sets: number;
  reps: number;
  weightKg: number;
}

export function QuickWorkoutLog() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ date: string; templateName: string | null; summary: Summary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/workout-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't parse that");
      setResult(data);
      setText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <p className="ov">Quick log</p>
      <form onSubmit={submit}>
        <textarea
          className="field mt-3 resize-none"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'"legs two days ago: bulgarians 3x8 @25, RDLs 4x10 @60"'}
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn mt-3 w-full disabled:opacity-30">
          {busy ? "Parsing…" : "Log workout"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs" style={{ color: "var(--color-red)" }}>{error}</p>}

      {result && (
        <div className="mt-3 space-y-[5px]">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--color-green)" }}>
            Logged {result.templateName ? `${result.templateName} · ` : ""}{result.date}
          </p>
          {result.summary.map((s, i) => (
            <div key={i} className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px]">
              <span className="font-semibold">{s.exercise}</span>
              <span className="num text-[var(--color-text-muted)]">
                {s.sets}×{s.reps} @ {s.weightKg}kg
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
