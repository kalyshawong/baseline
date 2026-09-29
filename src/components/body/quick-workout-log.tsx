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

/** "2026-09-21" → "Mon, Sep 21" (calendar day, no timezone shift). */
function dayLabel(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * `defaultDate` is the day being viewed on the page. Logs go to the date in
 * the picker (unless the text names a day) — before, a log with no date in
 * its text always landed on today, merging different days into one.
 */
export function QuickWorkoutLog({ defaultDate, today }: { defaultDate: string; today: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ date: string; templateName: string | null; summary: Summary[]; skipped?: string[] } | null>(null);
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
        body: JSON.stringify({ text: text.trim(), date }),
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
        <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
          Workout date
          <input
            type="date"
            className="field"
            style={{ width: "auto" }}
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || defaultDate)}
          />
        </label>
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
            Logged to {dayLabel(result.date)}{result.templateName ? ` · ${result.templateName}` : ""}
          </p>
          {result.summary.map((s, i) => (
            <div key={i} className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px]">
              <span className="font-semibold">{s.exercise}</span>
              <span className="num text-[var(--color-text-muted)]">
                {s.sets}×{s.reps} @ {s.weightKg}kg
              </span>
            </div>
          ))}
          {(result.skipped?.length ?? 0) > 0 && (
            <p className="text-[11px]" style={{ color: "var(--color-yellow)" }}>
              Not saved (no sets/reps given): {result.skipped!.join(", ")} — re-log like &quot;RDLs 3×10 @10lb&quot;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
