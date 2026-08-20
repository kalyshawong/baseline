"use client";

import { useState } from "react";

/**
 * Soreness logger — EPISODE model: tap a body part, pick severity 1-10, and
 * it stays ("day N" keeps counting) until ✕ clears it. Tapping a logged
 * part again updates today's severity mid-episode. Streaks/carry-forward
 * are computed server-side (lib/soreness.ts). Findings come from
 * soreness-analysis.ts via the page.
 */

interface Entry {
  id: string;
  bodyPart: string;
  severity: number;
  note: string | null;
  streak: number;
  carried: boolean;
}

interface Props {
  dateStr: string;
  initialEntries: Entry[];
  bodyParts: readonly string[];
  findings: { line: string }[];
}

export function SorenessCard({ dateStr, initialEntries, bodyParts, findings }: Props) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [picking, setPicking] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loggedParts = new Set(entries.map((e) => e.bodyPart));

  async function log(bodyPart: string, severity: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/soreness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, bodyPart, severity }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      const data = await res.json();
      setEntries(data.entries);
      setPicking(null);
      setCustom("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  // ✕ = "not sore anymore": ends the episode as of today (today becomes the
  // first not-sore day). History is kept — this is not a delete.
  async function clearPart(bodyPart: string) {
    const res = await fetch("/api/soreness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateStr, bodyPart, clear: true }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.entries) setEntries(data.entries);
    }
  }

  return (
    <div className="panel">
      <p className="ov">Soreness</p>

      {/* Logged today */}
      {entries.length > 0 && (
        <div className="mt-3 space-y-[6px]">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px]"
            >
              <button className="capitalize font-semibold" onClick={() => setPicking(picking === e.bodyPart ? null : e.bodyPart)} title="Update today's severity">
                {e.bodyPart}
              </button>
              <span className="flex items-center gap-3">
                <span className="text-[var(--color-text-muted)]">day {e.streak}</span>
                <span className="num font-bold" style={{ color: e.severity >= 7 ? "var(--color-red)" : e.severity >= 4 ? "var(--color-yellow)" : "var(--color-green)" }}>
                  {e.severity}/10
                </span>
                <button onClick={() => clearPart(e.bodyPart)} className="text-[var(--color-faint)] hover:text-[var(--color-text)]" aria-label={`${e.bodyPart} not sore anymore`} title="Not sore anymore">
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Part picker */}
      <div className="mt-3 flex flex-wrap gap-2">
        {bodyParts.map((part) => (
          <button
            key={part}
            className={`tagchip ${picking === part ? "on" : ""} ${loggedParts.has(part) ? "opacity-50" : ""}`}
            onClick={() => setPicking(picking === part ? null : part)}
          >
            {part}
          </button>
        ))}
      </div>
      <input
        className="field mt-2 !text-xs"
        placeholder="Other (e.g. neck) — then pick severity"
        value={custom}
        onChange={(e) => {
          setCustom(e.target.value);
          setPicking(e.target.value.trim() ? e.target.value.trim().toLowerCase() : null);
        }}
      />

      {/* Severity 1-10 */}
      {picking && (
        <div className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-faint)]">
            <span className="capitalize">{picking}</span> — severity
          </p>
          <div className="mt-2 grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                disabled={busy}
                onClick={() => log(picking, n)}
                className="py-2 text-center text-[12px] font-bold num bg-[var(--color-surface-2)] hover:bg-[var(--color-gold)] hover:text-[var(--color-bg)] disabled:opacity-40"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs" style={{ color: "var(--color-red)" }}>{error}</p>}

      {/* Findings */}
      {findings.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-3 space-y-[6px]">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
            Soreness × running
          </p>
          {findings.map((f, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-[var(--color-text-muted)]">{f.line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
