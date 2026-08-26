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
 * Sources: rigorous experiments with a persisted verdict (resultJson) and
 * completed Diagnose runs. Both store the same assignment/verdict shapes.
 */

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

export async function getTestedFindings(): Promise<TestedFinding[]> {
  const [experiments, runs] = await Promise.all([
    prisma.experiment.findMany({
      where: { resultJson: { not: null } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.diagnoseRun.findMany({
      where: { status: "complete", verdict: { not: null } },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const out: TestedFinding[] = [];

  for (const e of experiments) {
    try {
      const v = JSON.parse(e.resultJson!);
      const preReg = e.preReg ? JSON.parse(e.preReg) : null;
      const assignments: Assignment[] = e.assignments ? JSON.parse(e.assignments) : [];
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
        meanDiff: meanPairDiff(assignments),
        metric: e.dependentMetric,
        completedAt: e.updatedAt.toISOString().split("T")[0],
        href: `/mind/experiments/${e.id}`,
      });
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
      });
    } catch {
      /* skip */
    }
  }

  return out.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
}
