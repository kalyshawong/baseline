"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "What happened?" — free-text box for things that happened to her body
 * ("tripped on the stairs, left ankle sore", "calves sore from a bad
 * massage"). The API sorts it into kind / body parts / cause and the coach
 * reads it. Same look as the quick workout log (QuickWorkoutLog).
 */

interface HealthEvent {
  id: string;
  day: string;
  kind: string;
  summary: string;
  bodyParts: string[];
  cause: string | null;
  severity: number | null;
}

function dayLabel(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function HealthEventLog({ defaultDate, today }: { defaultDate: string; today: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<HealthEvent[]>([]);
  const [justLogged, setJustLogged] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const res = await fetch("/api/health-events?limit=5");
      if (res.ok) setRecent((await res.json()).events ?? []);
    } catch { /* list is a convenience; the box still works */ }
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/health-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save that");
      setJustLogged(new Set((data.events as HealthEvent[]).map((x) => x.id)));
      setText("");
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setRecent((r) => r.filter((x) => x.id !== id));
    try { await fetch(`/api/health-events?id=${encodeURIComponent(id)}`, { method: "DELETE" }); } catch { load(); }
  }

  return (
    <div className="panel">
      <p className="ov">What happened?</p>
      <form onSubmit={submit}>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-[var(--color-text-muted)]">
          Date
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
          placeholder={'"tripped on the stairs, left ankle sore" or "calves sore from a bad massage"'}
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn mt-3 w-full disabled:opacity-30">
          {busy ? "Sorting…" : "Log it"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs" style={{ color: "var(--color-red)" }}>{error}</p>}

      {recent.length > 0 && (
        <div className="mt-3 space-y-[5px]">
          {recent.map((ev) => (
            <div key={ev.id} className="flex items-start justify-between gap-2 bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px]">
              <div className="min-w-0">
                <div className="font-semibold">
                  {justLogged.has(ev.id) && <span style={{ color: "var(--color-green)" }}>✓ </span>}
                  {ev.summary}
                </div>
                <div className="text-[11px] text-[var(--color-text-muted)]">
                  {dayLabel(ev.day)} · {ev.kind}
                  {ev.bodyParts.length > 0 && ` · ${ev.bodyParts.join(", ")}`}
                  {ev.cause && ` · cause: ${ev.cause}`}
                  {ev.severity != null && ` · ${ev.severity}/10`}
                </div>
              </div>
              <button type="button" onClick={() => remove(ev.id)} aria-label="Delete" className="text-[var(--color-text-muted)]">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
