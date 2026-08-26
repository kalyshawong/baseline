import { prisma } from "@/lib/db";
import { CANDIDATE_LIBRARY } from "@/lib/diagnose/candidates";
import type { Assignment } from "@/lib/diagnose/runs";

/**
 * Tested cards for the Findings feed (redesign .fcard.tested, audit follow-up
 * #2): once a randomized run has a verdict, the RESULT joins the feed next to
 * the untested patterns — green, labeled, with both kinds of truth. Null
 * results are shown with the same prominence as effects: "no effect at what
 * this design could see" is a finding, not a failure.
 *
 * REPLICATION BEFORE RULE (#3, audit §2.5): an effect_found verdict is a
 * candidate, not a rule. It must survive a second independently randomized
 * run — same intervention, same outcome, same SWC, fresh schedule — with the
 * effect in the SAME DIRECTION before the Coach treats it as true. The link
 * lives in the replication's locked preReg (replicationOf), so the pairing
 * itself is pre-registered, not decided after seeing results.
 *
 * Sources: rigorous experiments with a persisted verdict (resultJson) and
 * completed Diagnose runs. Both store the same assignment/verdict shapes.
 */

export type ReplicationStatus =
  | "none" // effect_found, no replication started
  | "running" // replication scheduled/underway, verdict pending
  | "confirmed" // replication effect_found, same direction → Coach rule
  | "not_confirmed"; // replication ran, effect didn't hold

export interface TestedFinding {
  id: string;
  source: "experiment" | "diagnose";
  /** What was tested (IV label). */
  label: string;
  /** Outcome variable, human label. */
  outcomeLabel: string;
  decision: string;
  pEffectGtSWC: number;
  randTestP: number;
  feltDelta: number | null;
  pairsUsed: number;
  blocks: number;
  /** Mean paired difference (A − B) in outcome units, from usable pairs. */
  meanDiff: number | null;
  /** Outcome metric key, for unit formatting. */
  metric: string;
  completedAt: string;
  /** Detail link (experiments only — Diagnose runs live on the Mind card). */
  href: string | null;
  /** This run IS a replication of that experiment id. */
  replicationOf: string | null;
  /** Replication state of THIS finding (originals only; null for replications
   *  and non-effect verdicts where replication doesn't apply). */
  replicationStatus: ReplicationStatus | null;
}

export interface ConfirmedRule {
  label: string;
  outcomeLabel: string;
  metric: string;
  /** Mean of the two runs' mean paired diffs, outcome units. */
  meanDiff: number | null;
  originalId: string;
  replicationId: string;
}

const OUTCOME_LABELS: Record<string, string> = {
  totalSleepDuration: "total sleep",
  lowestHeartRate: "nocturnal RHR",
  hrvVsBaseline: "HRV vs baseline",
  temperatureDeviation: "temp deviation",
  score: "readiness",
  runningSpeed: "running speed",
  sessionQuality: "session quality",
};

function meanPairDiff(assignments: Assignment[]): number | null {
  const byPair = new Map<number, { A?: number; B?: number }>();
  for (const a of assignments) {
    if (!a.done || a.value == null || a.excluded) continue;
    const p = byPair.get(a.pairIdx) ?? {};
    p[a.arm] = a.value;
    byPair.set(a.pairIdx, p);
  }
  const diffs = [...byPair.values()]
    .filter((p) => p.A != null && p.B != null)
    .map((p) => p.A! - p.B!);
  if (diffs.length === 0) return null;
  return diffs.reduce((s, d) => s + d, 0) / diffs.length;
}

function metricFromOutcome(outcome: string): string {
  const parts = outcome.split(".");
  return parts[parts.length - 1] ?? outcome;
}

/** Human delta for Coach lines, e.g. "+27 min total sleep". */
export function formatRuleDelta(meanDiff: number | null, metric: string): string {
  if (meanDiff == null) return "";
  const d = meanDiff;
  const sign = d >= 0 ? "+" : "−";
  if (metric === "totalSleepDuration") return `${sign}${Math.round(Math.abs(d) / 60)} min`;
  if (metric === "lowestHeartRate") return `${sign}${Math.abs(Math.round(d * 10) / 10)} bpm`;
  if (metric === "hrvVsBaseline") return `${sign}${Math.abs(Math.round(d * 10) / 10)} ms`;
  if (metric === "temperatureDeviation") return `${sign}${Math.abs(Math.round(d * 100) / 100)}°C`;
  return `${sign}${Math.abs(Math.round(d * 10) / 10)}`;
}

interface ParsedRun {
  id: string;
  replicationOf: string | null;
  decision: string | null; // null = no verdict yet
  meanDiff: number | null;
}

/** Same-direction check: both mean diffs exist and share a sign. */
function sameDirection(a: number | null, b: number | null): boolean {
  return a != null && b != null && a !== 0 && b !== 0 && Math.sign(a) === Math.sign(b);
}

export async function getTestedFindings(): Promise<{
  tested: TestedFinding[];
  confirmed: ConfirmedRule[];
}> {
  const [experiments, runs] = await Promise.all([
    // preReg-not-null: includes scheduled/running replications (no verdict
    // yet), needed to compute originals' replication state.
    prisma.experiment.findMany({
      where: { preReg: { not: null } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.diagnoseRun.findMany({
      where: { status: "complete", verdict: { not: null } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  // First pass: parse every rigorous run's linkage + verdict.
  const parsed = new Map<string, ParsedRun>();
  for (const e of experiments) {
    try {
      const preReg = JSON.parse(e.preReg!);
      const v = e.resultJson ? JSON.parse(e.resultJson) : null;
      const assignments: Assignment[] = e.assignments ? JSON.parse(e.assignments) : [];
      parsed.set(e.id, {
        id: e.id,
        replicationOf: preReg.replicationOf ?? null,
        decision: v?.decision ?? null,
        meanDiff: meanPairDiff(assignments),
      });
    } catch {
      /* skip malformed */
    }
  }

  // Replication state per original.
  function replicationStatusFor(original: ParsedRun): ReplicationStatus {
    const reps = [...parsed.values()].filter((p) => p.replicationOf === original.id);
    if (reps.length === 0) return "none";
    for (const rep of reps) {
      if (rep.decision === "effect_found" && sameDirection(rep.meanDiff, original.meanDiff)) {
        return "confirmed";
      }
    }
    if (reps.some((r) => r.decision == null)) return "running";
    return "not_confirmed";
  }

  const out: TestedFinding[] = [];
  const confirmed: ConfirmedRule[] = [];

  for (const e of experiments) {
    if (!e.resultJson) continue; // no verdict → not a Tested card
    const p = parsed.get(e.id);
    if (!p) continue;
    try {
      const v = JSON.parse(e.resultJson);
      const preReg = JSON.parse(e.preReg!);
      const isOriginalEffect = v.decision === "effect_found" && p.replicationOf == null;
      const repStatus = isOriginalEffect ? replicationStatusFor(p) : null;

      out.push({
        id: e.id,
        source: "experiment",
        label: e.independentVariable,
        outcomeLabel:
          OUTCOME_LABELS[e.dependentMetric] ?? e.dependentVariable ?? e.dependentMetric,
        decision: v.decision,
        pEffectGtSWC: v.pEffectGtSWC,
        randTestP: v.randTestP,
        feltDelta: v.feltDelta ?? null,
        pairsUsed: v.pairsUsed ?? 0,
        blocks: preReg?.blocks ?? 0,
        meanDiff: p.meanDiff,
        metric: e.dependentMetric,
        completedAt: e.updatedAt.toISOString().split("T")[0],
        href: `/mind/experiments/${e.id}`,
        replicationOf: p.replicationOf,
        replicationStatus: repStatus,
      });

      if (repStatus === "confirmed") {
        const rep = [...parsed.values()].find(
          (r) =>
            r.replicationOf === e.id &&
            r.decision === "effect_found" &&
            sameDirection(r.meanDiff, p.meanDiff),
        )!;
        const diffs = [p.meanDiff, rep.meanDiff].filter((d): d is number => d != null);
        confirmed.push({
          label: e.independentVariable,
          outcomeLabel:
            OUTCOME_LABELS[e.dependentMetric] ?? e.dependentVariable ?? e.dependentMetric,
          metric: e.dependentMetric,
          meanDiff: diffs.length ? diffs.reduce((s, d) => s + d, 0) / diffs.length : null,
          originalId: e.id,
          replicationId: rep.id,
        });
      }
    } catch {
      /* malformed row — skip, never break the feed */
    }
  }

  for (const r of runs) {
    try {
      const v = JSON.parse(r.verdict!);
      const preReg = JSON.parse(r.preReg);
      const assignments: Assignment[] = JSON.parse(r.assignments);
      const candidate = CANDIDATE_LIBRARY.find((c) => c.id === r.candidateId);
      const metric = metricFromOutcome(preReg.outcome ?? "");
      out.push({
        id: r.id,
        source: "diagnose",
        label: candidate?.label ?? r.candidateId,
        outcomeLabel: OUTCOME_LABELS[metric] ?? metric,
        decision: v.decision,
        pEffectGtSWC: v.pEffectGtSWC,
        randTestP: v.randTestP,
        feltDelta: v.feltDelta ?? null,
        pairsUsed: v.pairsUsed ?? 0,
        blocks: preReg?.blocks ?? 0,
        meanDiff: meanPairDiff(assignments),
        metric,
        completedAt: r.updatedAt.toISOString().split("T")[0],
        href: null,
        // Diagnose runs replicate through §8 prior learning, not this path.
        replicationOf: null,
        replicationStatus: null,
      });
    } catch {
      /* skip */
    }
  }

  return {
    tested: out.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)),
    confirmed,
  };
}
