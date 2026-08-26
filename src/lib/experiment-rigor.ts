import { prisma } from "@/lib/db";
import { fetchMetricValues } from "@/lib/correlation";
import { permutationP, pEffectGtSWC, mdeForPairs, type Assignment } from "@/lib/diagnose/runs";

/**
 * Rigorous mode for the GENERAL experiment engine (audit §2.5–2.7,
 * 2026-08-26) — ports the Diagnose run machinery to user-created
 * experiments, replacing the condemned design (self-selected days +
 * Welch's t on autocorrelated dailies):
 *
 *  - App-assigned RANDOMIZED PAIRS, never self-selected days [identification]
 *  - App-scheduled start +5 days [GUARD: regression to the mean — people
 *    start experiments when they feel bad]
 *  - >= 6 blocks, auto-extended to 10 while underpowered [GUARD: with 4
 *    blocks significance is mathematically impossible]
 *  - MDE vs SWC computed from the user's OWN variance, with REFUSAL when
 *    the design can't see an effect worth caring about
 *  - Pre-registration locked before the schedule exists; no interim stats
 *  - Verdict = measured (permutation p + posterior P(effect > SWC)) AND
 *    felt (block ratings), separately labeled [audit §2.7: 13% measured
 *    vs 58% felt — both are true, neither substitutes for the other]
 *
 * Legacy experiments (no assignments column) keep their old analysis but
 * are labeled self-selected wherever displayed.
 */

export interface ExperimentPreReg {
  outcome: string; // metricSource.dependentMetric
  swc: number;
  mde: number;
  baselineSd: number;
  baselineMean: number;
  blocks: number;
  exclusionRule: string;
  analysis: string;
  lockedAt: string;
}

export interface ExperimentVerdict {
  pEffectGtSWC: number;
  randTestP: number;
  feltDelta: number | null;
  decision: "effect_found" | "no_effect_at_mde" | "inconclusive" | "inconclusive_low_adherence";
  pairsUsed: number;
}

const START_DELAY_DAYS = 5;
const MIN_BLOCKS = 6;
const MAX_BLOCKS = 10;

/** Baseline mean/sd for any (source, metric) over the last 90 days,
 *  excluding the most recent 10 (anti-contamination, mirrors Diagnose). */
export async function metricBaseline(
  metricSource: string,
  dependentMetric: string,
): Promise<{ mean: number; sd: number; n: number } | null> {
  const days: Date[] = [];
  for (let i = 10; i < 90; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push(new Date(d.toISOString().split("T")[0] + "T00:00:00.000Z"));
  }
  const values = [...(await fetchMetricValues(metricSource, dependentMetric, days)).values()]
    .filter((v): v is number => v != null);
  if (values.length < 8) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
  return { mean, sd, n: values.length };
}

/**
 * Size + schedule a new rigorous experiment. Returns a refusal (with the
 * honest numbers) when even 10 blocks can't reach the SWC.
 */
export async function planRigorousExperiment(input: {
  metricSource: string;
  dependentMetric: string;
  /** smallest worthwhile change; fraction of baseline mean when < 1 and the
   *  metric is ratio-scaled, else absolute units. Default: 0.5 SD. */
  swc?: number | null;
  lagDays: number;
}): Promise<
  | { refused: true; reason: string; mde?: number; swc?: number }
  | { refused: false; preReg: ExperimentPreReg; assignments: Assignment[]; startDate: Date }
> {
  const base = await metricBaseline(input.metricSource, input.dependentMetric);
  if (!base) {
    return {
      refused: true,
      reason: "Not enough baseline history for this metric to size an honest test (need ~8+ days in the last 90).",
    };
  }
  if (base.sd === 0) {
    return { refused: true, reason: "This metric never varies in your data — nothing to detect." };
  }

  const swcAbs = input.swc != null && input.swc > 0 ? input.swc : 0.5 * base.sd;
  const sdDiff = Math.SQRT2 * base.sd;

  // auto-extend blocks until powered, cap at MAX_BLOCKS
  let blocks = MIN_BLOCKS;
  while (mdeForPairs(sdDiff, blocks) > swcAbs * 2.5 && blocks < MAX_BLOCKS) blocks += 2;
  const mde = mdeForPairs(sdDiff, blocks);
  if (mde > swcAbs * 2.5) {
    return {
      refused: true,
      reason: `Underpowered even at ${MAX_BLOCKS} blocks: this design detects ~${round1(mde)} at best, but your smallest worthwhile change is ${round1(swcAbs)}. Honest options: accept a longer study later, or test something with a bigger expected effect.`,
      mde,
      swc: swcAbs,
    };
  }

  const preReg: ExperimentPreReg = {
    outcome: `${input.metricSource}.${input.dependentMetric}`,
    swc: swcAbs,
    mde,
    baselineSd: base.sd,
    baselineMean: base.mean,
    blocks,
    exclusionRule: "Days with no metric reading excluded; readings > 3 SD from baseline excluded — both arms, pre-set",
    analysis: "Primary: sign-permutation test on block-paired differences. Secondary: posterior P(effect > SWC). No interim results. Locked before schedule generation.",
    lockedAt: new Date().toISOString(),
  };

  const start = new Date();
  start.setUTCDate(start.getUTCDate() + START_DELAY_DAYS);
  const assignments: Assignment[] = [];
  for (let pair = 0; pair < blocks; pair++) {
    const flip = Math.random() < 0.5;
    for (let leg = 0; leg < 2; leg++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + pair * 2 + leg + input.lagDays * (pair * 2 + leg));
      assignments.push({
        idx: pair * 2 + leg,
        pairIdx: pair,
        date: d.toISOString().split("T")[0],
        arm: (leg === 0) === flip ? "A" : "B",
        done: false,
        value: null,
        excluded: null,
      });
    }
  }
  return { refused: false, preReg, assignments, startDate: start };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Analyze a rigorous experiment: paired diffs from its assignments, DV
 *  values auto-pulled from the metric source (with lag), verdict persisted. */
export async function analyzeRigorousExperiment(experimentId: string): Promise<ExperimentVerdict | null> {
  const e = await prisma.experiment.findUnique({ where: { id: experimentId } });
  if (!e?.assignments || !e.preReg) return null;
  const assignments: Assignment[] = JSON.parse(e.assignments);
  const preReg: ExperimentPreReg = JSON.parse(e.preReg);

  // pull DV values for all assignment dates (+lag)
  const dvDays = assignments.map((a) => {
    const d = new Date(a.date + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + e.lagDays);
    return d;
  });
  const values = await fetchMetricValues(e.metricSource, e.dependentMetric, dvDays);

  for (const a of assignments) {
    if (!a.done) continue;
    const d = new Date(a.date + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + e.lagDays);
    const v = values.get(d.toISOString().split("T")[0]) ?? null;
    a.value = v;
    // pre-registered exclusion, applied blind to arm
    if (v != null && Math.abs(v - preReg.baselineMean) > 3 * preReg.baselineSd) {
      a.excluded = ">3 SD from baseline (pre-set rule)";
    }
  }

  const usable = assignments.filter((a) => a.done && a.value != null && !a.excluded);
  const adherence = usable.length / assignments.length;
  const byPair = new Map<number, { A?: number; B?: number }>();
  for (const a of usable) {
    const p = byPair.get(a.pairIdx) ?? {};
    p[a.arm] = a.value!;
    byPair.set(a.pairIdx, p);
  }
  const diffs = [...byPair.values()].filter((p) => p.A != null && p.B != null).map((p) => p.A! - p.B!);

  const felt: { pairIdx: number; armA: number; armB: number }[] = e.feltRatings ? JSON.parse(e.feltRatings) : [];
  const feltDelta = felt.length
    ? Math.round((felt.reduce((a, r) => a + (r.armA - r.armB), 0) / felt.length) * 10) / 10
    : null;

  let verdict: ExperimentVerdict;
  if (adherence < 0.7 || diffs.length < 4) {
    verdict = { pEffectGtSWC: 0.5, randTestP: 1, feltDelta, decision: "inconclusive_low_adherence", pairsUsed: diffs.length };
  } else {
    const post = pEffectGtSWC(diffs, preReg.swc);
    verdict = {
      pEffectGtSWC: Math.round(post * 100) / 100,
      randTestP: Math.round(permutationP(diffs) * 1000) / 1000,
      feltDelta,
      decision: post >= 0.8 ? "effect_found" : post <= 0.2 ? "no_effect_at_mde" : "inconclusive",
      pairsUsed: diffs.length,
    };
  }

  await prisma.experiment.update({
    where: { id: experimentId },
    data: {
      assignments: JSON.stringify(assignments),
      resultJson: JSON.stringify(verdict),
      status: "analyzed",
    },
  });
  return verdict;
}
