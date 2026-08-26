"use client";

import { useEffect, useState } from "react";

/**
 * Diagnose section — the red block from "Baseline Findings Redesign.html".
 * Renders the live engine state fetched from /api/diagnose:
 *
 *   PROPOSED  → streak headline + context-check chips + candidate bundle
 *               with honest class labels + proposed first test (accept /
 *               not now)
 *   RUNNING   → the randomized schedule with done-toggles (values auto-pull
 *               from the data), per-pair felt ratings, complete button
 *   VERDICT   → the two numbers, measured and felt, labeled as different
 *               kinds of truth [GUARD]
 *   CONTEXT_EXPLAINED / REFUSED / EXHAUSTED → honest one-card explanations
 *
 * Silent (renders nothing) when the engine is dormant — most days.
 */

interface ContextCheck { check: string; explained: boolean; note: string }
interface Ranked {
  id: string; label: string; class: string; score: number;
  status: string; testableNow: boolean; honestLabel: string;
}
interface Assignment {
  idx: number; pairIdx: number; date: string; arm: "A" | "B";
  done: boolean; value: number | null; excluded: string | null;
}
interface Run {
  id: string; candidateId: string; candidateLabel: string;
  template: { armA: string; armB: string; assignmentUnit: string } | null;
  status: string;
  preReg: { outcome: string; swc: number; mde: number; blocks: number; exclusionRule: string; analysis: string };
  assignments: Assignment[];
  feltRatings: { pairIdx: number; armA: number; armB: number }[];
  verdict: { pEffectGtSWC: number; randTestP: number; feltDelta: number | null; decision: string } | null;
  startDate: string;
}
interface Flow {
  id: string; category: string; state: string;
  flagged: { date: string; zScore: number }[];
  contextChecks: ContextCheck[];
  queue: Ranked[];
  currentCandidateId: string | null;
  closedAs: string | null;
  runs: Run[];
}

const RED = "var(--color-red)";

export function DiagnoseCard() {
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/diagnose");
      if (res.ok) setFlows((await res.json()).flows);
    } catch { /* silent */ }
  }
  useEffect(() => { load(); }, []);

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!flows || flows.length === 0) return null;

  return (
    <div className="mb-[14px] flex flex-col gap-[14px]">
      {flows.map((f) => (
        <FlowCard key={f.id} f={f} busy={busy} act={act} />
      ))}
    </div>
  );
}

function FlowCard({ f, busy, act }: { f: Flow; busy: boolean; act: (p: Record<string, unknown>) => Promise<void> }) {
  const activeRun = f.runs.find((r) => r.status === "running");
  const doneRun = f.runs.find((r) => r.status === "complete" && r.verdict);
  const proposed = f.queue.find((q) => q.id === f.currentCandidateId);
  const drop = f.flagged.length
    ? Math.round(f.flagged.reduce((a, b) => a + b.zScore, 0) / f.flagged.length * 10) / 10
    : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_300px]"
      style={{
        borderLeft: `5px solid ${RED}`,
        background: "var(--color-surface)",
        backgroundImage: `linear-gradient(150deg, color-mix(in oklch, ${RED}, transparent 90%), transparent 55%)`,
        boxShadow: "inset 0 1px 0 oklch(1 0 0/.05), 0 12px 30px -16px #000",
      }}>
      {/* ── Left ── */}
      <div className="p-[24px_26px]">
        <div className="mb-[14px] flex items-center gap-[11px]">
          <span className="px-3 py-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] angled-clip"
            style={{ background: RED, color: "var(--color-bg)" }}>
            Pattern of bad sessions
          </span>
          <span className="text-[11.5px] font-bold tracking-[0.04em] text-[var(--color-faint)]">
            {f.category === "strength" ? "🏋 Strength" : "🏃 Running"} · last 10 days
          </span>
          <button type="button" disabled={busy} onClick={() => act({ action: "dismiss", flowId: f.id })}
            className="ml-auto cursor-pointer border-none bg-transparent text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-faint)] hover:text-[var(--color-text)]">
            Dismiss
          </button>
        </div>

        <h2 className="disp max-w-[520px] text-[42px] leading-[0.9]">
          {f.flagged.length} flagged sessions in 10 days —{" "}
          <em className="not-italic" style={{ color: RED }}>let&apos;s isolate why.</em>
        </h2>
        <p className="mt-[13px] max-w-[520px] text-[14px] leading-[1.55] text-[var(--color-text-muted)]">
          {f.category === "strength" ? "Volume load" : "Pace"} averaged{" "}
          <b className="text-[var(--color-text)]">z = {drop}</b> below your own baseline while you reported
          trying at least as hard. Before suggesting anything, Baseline checks what it already knows:
        </p>

        {/* context chips */}
        <div className="mt-4 flex flex-wrap gap-[7px]">
          {f.contextChecks.map((c) => (
            <span key={c.check} title={c.note}
              className="inline-flex items-center gap-[7px] bg-[var(--color-surface-2)] px-[11px] py-[6px] text-[11px] font-bold text-[var(--color-text-muted)]">
              <span className="font-extrabold" style={{ color: c.explained ? RED : "var(--color-green)" }}>
                {c.explained ? "!" : "✓"}
              </span>
              {c.check} — {c.explained ? "explains it" : "ruled out"}
            </span>
          ))}
          {f.state === "PROPOSED" && (
            <span className="inline-flex items-center gap-[7px] bg-[var(--color-surface-2)] px-[11px] py-[6px] text-[11px] font-bold text-[var(--color-faint)]">
              — Cause unknown → candidates below
            </span>
          )}
        </div>

        {/* candidate bundle */}
        {f.state === "PROPOSED" && f.queue.length > 0 && (
          <div className="mt-[18px] max-w-[560px] border border-[var(--color-border)] p-[16px_18px]"
            style={{ borderLeft: `4px solid ${RED}`, background: `color-mix(in oklch, ${RED}, var(--color-surface) 94%)` }}>
            <p className="mb-[9px] text-[10.5px] font-extrabold uppercase tracking-[0.16em]" style={{ color: RED }}>
              Candidate causes · one test at a time
            </p>
            <ul className="flex flex-col gap-[7px]">
              {f.queue.slice(0, 4).map((q) => (
                <li key={q.id} className="flex items-baseline gap-[9px] text-[12.5px] text-[var(--color-text-muted)]">
                  <span className="flex-none" style={{ color: RED }}>▸</span>
                  <span>
                    <b className="text-[var(--color-text)]">{q.label}</b>
                    {" — "}{q.honestLabel}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-[9px] text-[13px] leading-[1.55] text-[var(--color-text-muted)]">
              Ranked by <b className="text-[var(--color-text)]">your own tags</b> first, testability second.
              One experiment at a time — testing all at once guarantees a false answer.
            </p>
          </div>
        )}

        {/* running: the schedule */}
        {activeRun && <RunSchedule run={activeRun} busy={busy} act={act} />}

        {/* context-explained / exhausted / refused */}
        {f.state === "CONTEXT_EXPLAINED" && (
          <p className="mt-4 max-w-[520px] text-[13.5px] leading-[1.6] text-[var(--color-text-muted)]">
            {f.contextChecks.find((c) => c.explained)?.note}
          </p>
        )}
        {f.state === "EXHAUSTED" && (
          <p className="mt-4 max-w-[520px] text-[13.5px] leading-[1.6] text-[var(--color-text-muted)]">
            No testable candidate explains this. Remaining possibilities are outside what Baseline can
            test — a coach or clinician is the right next step, or widen the candidate library.
          </p>
        )}
        {f.state === "REFUSED_UNDERPOWERED" && (
          <p className="mt-4 max-w-[520px] text-[13.5px] leading-[1.6] text-[var(--color-text-muted)]">
            The test was refused as underpowered — this design can&apos;t detect an effect small enough to
            matter. That refusal is the feature: an underpowered &ldquo;result&rdquo; would be noise wearing a
            verdict&apos;s clothes.
          </p>
        )}
      </div>

      {/* ── Right block ── */}
      <div className="flex flex-col justify-center p-[24px]"
        style={{ background: RED, color: "var(--color-bg)", boxShadow: `0 0 46px -14px ${RED}` }}>
        {f.state === "PROPOSED" && proposed && (
          <>
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] opacity-70">Proposed first test</p>
            <p className="disp mt-2 text-[34px] leading-[0.95]">{proposed.label}</p>
            <p className="mt-2 text-[13px] font-semibold opacity-85">
              {(f.queue.find((q) => q.id === proposed.id) && "6 blocks · randomized pairs")}
            </p>
            <p className="mt-3 text-[11px] font-semibold leading-[1.5] opacity-60">
              Starts in ~5 days, not today — your bad streak is partly noise and will drift back on its
              own; measuring against the streak would make anything look like a fix.
            </p>
            <div className="mt-[18px] flex flex-col gap-2">
              <button type="button" disabled={busy}
                onClick={() => act({ action: "accept", flowId: f.id, candidateId: proposed.id })}
                className="cursor-pointer border-none px-[18px] py-3 text-center text-[12.5px] font-extrabold uppercase tracking-[0.08em] angled-clip"
                style={{ background: "var(--color-bg)", color: RED }}>
                Set up this test →
              </button>
              <button type="button" disabled={busy}
                onClick={() => act({ action: "decline", flowId: f.id, candidateId: proposed.id })}
                className="cursor-pointer bg-transparent px-[18px] py-2 text-center text-[12.5px] font-bold uppercase tracking-[0.08em]"
                style={{ border: "1.5px solid oklch(0.155 0.006 264 / .45)", color: "var(--color-bg)" }}>
                Not now
              </button>
            </div>
          </>
        )}

        {activeRun && (
          <>
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] opacity-70">Running</p>
            <p className="disp mt-2 text-[30px] leading-[0.95]">{activeRun.candidateLabel}</p>
            <p className="mt-2 text-[12px] font-semibold opacity-85">
              A: {activeRun.template?.armA}<br />B: {activeRun.template?.armB}
            </p>
            <p className="mt-3 text-[11px] font-semibold leading-[1.5] opacity-60">
              No interim results shown — peeking inflates false positives. Adherence only.
            </p>
          </>
        )}

        {doneRun?.verdict && (
          <>
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] opacity-70">Verdict — two kinds of truth</p>
            <p className="disp mt-2 text-[44px] leading-[0.9]">
              {Math.round(doneRun.verdict.pEffectGtSWC * 100)}%
            </p>
            <p className="text-[12px] font-semibold opacity-85">
              Measured: P(effect &gt; worthwhile) · perm p {doneRun.verdict.randTestP < 0.001 ? "<0.001" : doneRun.verdict.randTestP}
            </p>
            <p className="mt-2 text-[13px] font-semibold opacity-85">
              Felt: {doneRun.verdict.feltDelta == null ? "not rated" : `${doneRun.verdict.feltDelta > 0 ? "+" : ""}${doneRun.verdict.feltDelta} pts for arm A`}
            </p>
            <p className="mt-3 text-[11px] font-semibold leading-[1.5] opacity-60">
              {doneRun.verdict.decision === "effect_found"
                ? "Effect found — one replication run before it becomes a Coach rule."
                : doneRun.verdict.decision === "no_effect_at_mde"
                  ? "No effect at what this design could detect. Parked, not deleted — next candidate queued."
                  : "Inconclusive — extend once, or move to the next candidate."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function RunSchedule({ run, busy, act }: { run: Run; busy: boolean; act: (p: Record<string, unknown>) => Promise<void> }) {
  const today = new Date().toISOString().split("T")[0];
  const allMarked = run.assignments.every((a) => a.done || a.date > today);
  const pastAll = run.assignments.every((a) => a.date <= today);
  const doneCount = run.assignments.filter((a) => a.done).length;
  const pairs = [...new Set(run.assignments.map((a) => a.pairIdx))];

  return (
    <div className="mt-[18px] max-w-[560px]">
      <p className="mb-[9px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        Schedule · {doneCount}/{run.assignments.length} logged · outcome auto-pulled from your data
      </p>
      <div className="flex flex-col gap-[5px]">
        {run.assignments.map((a) => (
          <label key={a.idx}
            className="flex items-center justify-between gap-3 bg-[var(--color-surface-2)] px-3 py-2 text-[12.5px]">
            <span className="flex items-center gap-2">
              <input type="checkbox" checked={a.done} disabled={busy || a.date > today}
                onChange={(e) => act({ action: "adherence", runId: run.id, idx: a.idx, done: e.target.checked })}
                style={{ accentColor: RED }} />
              <span className="num text-[var(--color-text-muted)]">{a.date}</span>
              <b>{a.arm === "A" ? run.template?.armA : run.template?.armB}</b>
            </span>
            <span className="num text-[11px] text-[var(--color-faint)]">
              {a.excluded ? `excluded: ${a.excluded}` : a.done ? (a.value != null ? "✓ captured" : "no data found") : a.date > today ? "upcoming" : "mark when done"}
            </span>
          </label>
        ))}
      </div>

      {/* felt ratings per pair — end-of-block subjective check */}
      <p className="mb-[6px] mt-4 text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-text-muted)]">
        After each pair: how did each feel? (1–10)
      </p>
      <div className="flex flex-col gap-[5px]">
        {pairs.map((p) => {
          const done = run.assignments.filter((a) => a.pairIdx === p).every((a) => a.done);
          const existing = run.feltRatings.find((r) => r.pairIdx === p);
          if (!done) return null;
          return <FeltRow key={p} pairIdx={p} runId={run.id} existing={existing} busy={busy} act={act} />;
        })}
      </div>

      {(allMarked || pastAll) && doneCount >= 4 && (
        <button type="button" disabled={busy}
          onClick={() => act({ action: "complete", runId: run.id })}
          className="mt-4 cursor-pointer border-none px-[18px] py-3 text-[12.5px] font-extrabold uppercase tracking-[0.08em] angled-clip"
          style={{ background: RED, color: "var(--color-bg)" }}>
          Compute verdict
        </button>
      )}
    </div>
  );
}

function FeltRow({ pairIdx, runId, existing, busy, act }: {
  pairIdx: number; runId: string;
  existing?: { armA: number; armB: number };
  busy: boolean; act: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [a, setA] = useState(existing?.armA ?? 5);
  const [b, setB] = useState(existing?.armB ?? 5);
  return (
    <div className="flex items-center gap-3 bg-[var(--color-surface-2)] px-3 py-2 text-[12px]">
      <span className="text-[var(--color-text-muted)]">Pair {pairIdx + 1}</span>
      <label className="flex items-center gap-1">A
        <input type="number" min={1} max={10} value={a} onChange={(e) => setA(Number(e.target.value))}
          className="field w-[52px] !py-1 !text-xs" />
      </label>
      <label className="flex items-center gap-1">B
        <input type="number" min={1} max={10} value={b} onChange={(e) => setB(Number(e.target.value))}
          className="field w-[52px] !py-1 !text-xs" />
      </label>
      <button type="button" disabled={busy}
        onClick={() => act({ action: "felt", runId, pairIdx, armA: a, armB: b })}
        className="ml-auto cursor-pointer bg-[var(--color-surface)] px-3 py-1 text-[11px] font-bold uppercase text-[var(--color-text-muted)]">
        {existing ? "Update" : "Save"}
      </button>
    </div>
  );
}
