"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Rigorous-experiment panel (audit §2.5–2.7): shows the locked
 * pre-registration, the app-generated randomized schedule with adherence
 * toggles, per-pair felt ratings, and — once computed — the verdict as TWO
 * labeled numbers: measured and felt. No interim statistics are ever shown
 * while the run is live [GUARD: peeking inflates α].
 */

interface Assignment {
  idx: number; pairIdx: number; date: string; arm: "A" | "B";
  done: boolean; value: number | null; excluded: string | null;
}
interface PreReg {
  outcome: string; swc: number; mde: number; blocks: number;
  exclusionRule: string; analysis: string; lockedAt: string;
}
interface Verdict {
  pEffectGtSWC: number; randTestP: number; feltDelta: number | null;
  decision: string; pairsUsed: number;
}

export function RigorousPanel({
  experimentId,
  status,
  startDate,
  assignments: initialAssignments,
  preReg,
  feltRatings: initialFelt,
  verdict,
  ivLabel,
}: {
  experimentId: string;
  status: string;
  startDate: string;
  assignments: Assignment[];
  preReg: PreReg;
  feltRatings: { pairIdx: number; armA: number; armB: number }[];
  verdict: Verdict | null;
  ivLabel: string;
}) {
  const router = useRouter();
  const [assignments, setAssignments] = useState(initialAssignments);
  const [felt, setFelt] = useState(initialFelt);
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const doneCount = assignments.filter((a) => a.done).length;
  const pairs = [...new Set(assignments.map((a) => a.pairIdx))];
  const canComplete = doneCount >= 8 || assignments.every((a) => a.date <= today);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/experiments/${experimentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok ? res.json() : null;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(idx: number, done: boolean) {
    const updated = await patch({ adherence: { idx, done } });
    if (updated?.assignments) setAssignments(JSON.parse(updated.assignments));
  }

  async function saveFelt(pairIdx: number, armA: number, armB: number) {
    const updated = await patch({ felt: { pairIdx, armA, armB } });
    if (updated?.feltRatings) setFelt(JSON.parse(updated.feltRatings));
  }

  async function complete() {
    await patch({ complete: true });
    router.refresh();
  }

  return (
    <div className="panel mt-4">
      <div className="flex items-center justify-between">
        <p className="ov">Randomized protocol</p>
        <span className="pill pill-muted">{status}</span>
      </div>

      {/* pre-registration, locked */}
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
        <b className="text-[var(--color-text)]">Pre-registered</b> before the schedule existed:
        outcome {preReg.outcome} · {preReg.blocks} randomized pairs · smallest worthwhile change{" "}
        {Math.round(preReg.swc * 10) / 10} · detectable at ~{Math.round(preReg.mde * 10) / 10} ·{" "}
        {preReg.exclusionRule}. Starts {startDate} — 5 days out on purpose: streaks drift back on
        their own, and starting &ldquo;when you feel like it&rdquo; makes anything look like a fix.
      </p>

      {/* schedule */}
      <p className="mb-2 mt-4 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--color-faint)]">
        Schedule · {doneCount}/{assignments.length} · outcome values auto-pull from your data
      </p>
      <div className="flex flex-col gap-[5px]">
        {assignments.map((a) => (
          <label key={a.idx} className="flex items-center justify-between gap-3 bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px]">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={a.done}
                disabled={busy || a.date > today || verdict != null}
                onChange={(e) => toggle(a.idx, e.target.checked)}
                style={{ accentColor: "var(--color-gold)" }}
              />
              <span className="num text-[var(--color-text-muted)]">{a.date}</span>
              <b>{a.arm === "A" ? ivLabel : "Usual (control)"}</b>
            </span>
            <span className="num text-[11px] text-[var(--color-faint)]">
              {a.excluded ? `excluded: ${a.excluded}` : a.done ? "✓" : a.date > today ? "upcoming" : "mark when done"}
            </span>
          </label>
        ))}
      </div>

      {/* felt ratings */}
      {verdict == null && (
        <>
          <p className="mb-2 mt-4 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--color-faint)]">
            After each completed pair: how did each feel? (1–10)
          </p>
          <div className="flex flex-col gap-[5px]">
            {pairs.map((p) => {
              const pairDone = assignments.filter((a) => a.pairIdx === p).every((a) => a.done);
              if (!pairDone) return null;
              const existing = felt.find((r) => r.pairIdx === p);
              return (
                <FeltRow key={p} pairIdx={p} existing={existing} busy={busy} onSave={saveFelt} />
              );
            })}
          </div>
        </>
      )}

      {/* verdict — two kinds of truth, or the no-peeking note */}
      {verdict ? (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <p className="ov mb-2">Verdict — two kinds of truth</p>
          <p className="text-[14px]">
            <b className="text-[var(--color-text)]">Measured:</b>{" "}
            P(effect &gt; worthwhile) = <b className="num">{Math.round(verdict.pEffectGtSWC * 100)}%</b>
            {" "}· randomization p {verdict.randTestP < 0.001 ? "<0.001" : verdict.randTestP} · {verdict.pairsUsed} pairs
          </p>
          <p className="mt-1 text-[14px]">
            <b className="text-[var(--color-text)]">Felt:</b>{" "}
            {verdict.feltDelta == null
              ? "not rated"
              : `you rated "${ivLabel}" blocks ${verdict.feltDelta > 0 ? "+" : ""}${verdict.feltDelta} pts vs usual`}
          </p>
          <p className="mt-2 text-[12px] text-[var(--color-text-muted)]">
            {verdict.decision === "effect_found"
              ? "Effect found. One independently randomized replication run before this becomes a Coach rule."
              : verdict.decision === "no_effect_at_mde"
                ? "No effect at what this design could detect — that's a real answer, not a failure."
                : verdict.decision === "inconclusive_low_adherence"
                  ? "Too few completed assignments to call. Rerun with better adherence, or let it go."
                  : "Inconclusive — the effect, if any, sits below this design's resolution."}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-[var(--color-faint)]">
          No interim results while running — peeking 5 times inflates the false-positive rate to 14%.
        </p>
      )}

      {verdict == null && canComplete && (
        <button
          type="button"
          disabled={busy}
          onClick={complete}
          className="btn mt-4 w-full disabled:opacity-40"
        >
          Compute verdict
        </button>
      )}
    </div>
  );
}

function FeltRow({ pairIdx, existing, busy, onSave }: {
  pairIdx: number;
  existing?: { armA: number; armB: number };
  busy: boolean;
  onSave: (pairIdx: number, armA: number, armB: number) => void;
}) {
  const [a, setA] = useState(existing?.armA ?? 5);
  const [b, setB] = useState(existing?.armB ?? 5);
  return (
    <div className="flex items-center gap-3 bg-[var(--color-surface-2)] px-3 py-2 text-[12px]">
      <span className="text-[var(--color-text-muted)]">Pair {pairIdx + 1}</span>
      <label className="flex items-center gap-1">
        Test
        <input type="number" min={1} max={10} value={a} onChange={(e) => setA(Number(e.target.value))} className="field w-[52px] !py-1 !text-xs" />
      </label>
      <label className="flex items-center gap-1">
        Usual
        <input type="number" min={1} max={10} value={b} onChange={(e) => setB(Number(e.target.value))} className="field w-[52px] !py-1 !text-xs" />
      </label>
      <button type="button" disabled={busy} onClick={() => onSave(pairIdx, a, b)}
        className="ml-auto bg-[var(--color-surface)] px-3 py-1 text-[11px] font-bold uppercase text-[var(--color-text-muted)]">
        {existing ? "Update" : "Save"}
      </button>
    </div>
  );
}
