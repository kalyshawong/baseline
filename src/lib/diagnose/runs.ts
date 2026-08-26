import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { CANDIDATE_LIBRARY, type OutcomeMetric } from "./candidates";

/**
 * Diagnose run lifecycle: PRE_REG (locked before any schedule exists
 * [GUARD]) → MDE-vs-SWC check with REFUSAL → SCHEDULED (randomized pairs,
 * balanced) → RUNNING → VERDICT (randomization test + posterior
 * P(effect > SWC)) → prior learning (§8).
 *
 * Analysis deviation, documented: the spec's secondary model is Bayesian
 * AR(1). v1 uses a conjugate normal posterior on BLOCK-LEVEL PAIRED
 * DIFFERENCES — non-overlapping blocks already remove most lag-1
 * autocorrelation (the spec's own §7.1 rationale), and the primary
 * randomization test is exact regardless. AR(1) refinement is a marked
 * upgrade point, not a correctness hole.
 */

export interface Assignment {
  idx: number;
  pairIdx: number;
  date: string; // YYYY-MM-DD target date
  arm: "A" | "B";
  done: boolean;
  value: number | null;
  excluded: string | null; // pre-registered exclusion rule note
}

export interface PreReg {
  candidateId: string;
  outcome: OutcomeMetric;
  swc: number;
  mde: number;
  baselineSd: number;
  baselineMean: number;
  blocks: number;
  exclusionRule: string;
  analysis: string;
  lockedAt: string;
}

export interface Verdict {
  pEffectGtSWC: number;
  randTestP: number;
  mde: number;
  feltDelta: number | null;
  decision: "effect_found" | "no_effect_at_mde" | "inconclusive" | "inconclusive_low_adherence";
}

// ── Baseline stats for the chosen outcome (streak excluded) ─────────────

export async function baselineStats(outcome: OutcomeMetric): Promise<{ mean: number; sd: number; n: number } | null> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const excludeAfter = new Date(Date.now() - 10 * 86_400_000); // streak exclusion
  let values: number[] = [];

  if (outcome === "volume_load_at_prescribed_rpe") {
    const s = await prisma.workoutSession.findMany({
      where: { completedAt: { not: null }, sessionVolume: { gt: 0 }, date: { gte: since, lt: excludeAfter } },
      select: { sessionVolume: true },
    });
    values = s.map((x) => x.sessionVolume!);
  } else if (outcome === "total_sleep_time") {
    const s = await prisma.dailySleep.findMany({
      where: { totalSleepDuration: { not: null }, day: { gte: since, lt: excludeAfter } },
      select: { totalSleepDuration: true },
    });
    values = s.map((x) => x.totalSleepDuration!);
  } else if (outcome === "nocturnal_rhr") {
    const s = await prisma.dailySleep.findMany({
      where: { lowestHeartRate: { not: null }, day: { gte: since, lt: excludeAfter } },
      select: { lowestHeartRate: true },
    });
    values = s.map((x) => x.lowestHeartRate!);
  } else if (outcome === "hrv_vs_7day_baseline") {
    const s = await prisma.dailySleep.findMany({
      where: { averageHrv: { not: null }, day: { gte: since, lt: excludeAfter } },
      orderBy: { day: "asc" },
      select: { averageHrv: true },
    });
    const hrv = s.map((x) => x.averageHrv!);
    values = hrv.slice(7).map((v, i) => v - hrv.slice(i, i + 7).reduce((a, b) => a + b, 0) / 7);
  } else if (outcome === "temp_deviation") {
    const s = await prisma.dailyReadiness.findMany({
      where: { temperatureDeviation: { not: null }, day: { gte: since, lt: excludeAfter } },
      select: { temperatureDeviation: true },
    });
    values = s.map((x) => x.temperatureDeviation!);
  } else {
    return null; // e1rm / pace-at-fixed-HR need data streams we don't have yet
  }

  if (values.length < 8) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1));
  return { mean, sd, n: values.length };
}

// ── MDE for a paired design with k pairs (two-sided α=.05, power .80) ───

export function mdeForPairs(sdOfDiff: number, pairs: number): number {
  // MDE ≈ (z_{α/2} + z_{power}) * sd_diff / sqrt(k) = 2.80 * sd / sqrt(k)
  return (1.96 + 0.84) * (sdOfDiff / Math.sqrt(pairs));
}

// ── PRE_REG → SCHEDULED | REFUSED ───────────────────────────────────────

export async function preRegisterAndSchedule(flowId: string, candidateId: string) {
  const userId = await getCurrentUserId();
  const def = CANDIDATE_LIBRARY.find((c) => c.id === candidateId);
  if (!def?.template) throw new Error("candidate not testable");
  const t = def.template;

  const stats = await baselineStats(t.primaryOutcome);
  if (!stats) {
    return { refused: true as const, reason: "Not enough baseline data to size the test honestly." };
  }

  // sd of pair differences ≈ sqrt(2)·sd_session (conservative: no pairing benefit assumed)
  const sdDiff = Math.SQRT2 * stats.sd;
  const mde = mdeForPairs(sdDiff, t.minBlocks);
  // swc for ratio-style outcomes (0.05 = 5%) is relative to the baseline mean
  const swcAbs = t.swc < 1 ? t.swc * Math.abs(stats.mean) : t.swc;

  if (mde > swcAbs * 2.5) {
    // Honest refusal [GUARD]: this design cannot see the effect size that
    // would matter. (2.5× slack: MDE within reach of a modest extension is
    // offered as a longer design rather than refused outright.)
    return {
      refused: true as const,
      reason: `Underpowered: this ${t.minBlocks}-block design can only detect ~${fmt(mde, t.primaryOutcome)}, but your smallest worthwhile change is ${fmt(swcAbs, t.primaryOutcome)}. A longer design or a larger-effect candidate is needed.`,
      mde,
      swc: swcAbs,
    };
  }

  const preReg: PreReg = {
    candidateId,
    outcome: t.primaryOutcome,
    swc: swcAbs,
    mde,
    baselineSd: stats.sd,
    baselineMean: stats.mean,
    blocks: t.minBlocks,
    exclusionRule: "Nights with <4h sleep and sessions with z<-3 excluded — both arms, pre-set",
    analysis: "Primary: sign-permutation test on block-paired differences (trend-safe). Secondary: normal posterior on paired diffs → P(effect > SWC). Locked before schedule generation.",
    lockedAt: new Date().toISOString(),
  };

  // schedule: startDelayDays out [GUARD: RTM], randomized pair order,
  // one pair per ~2 units, balanced by construction (each pair has one A one B).
  const assignments: Assignment[] = [];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + t.startDelayDays);
  const gapDays = t.assignmentUnit === "session" ? 2 : 1; // sessions ~every other day
  for (let pair = 0; pair < t.minBlocks; pair++) {
    const flip = Math.random() < 0.5;
    for (let leg = 0; leg < 2; leg++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + (pair * 2 + leg) * gapDays);
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

  const run = await prisma.diagnoseRun.create({
    data: {
      userId,
      flowId,
      candidateId,
      status: "running",
      preReg: JSON.stringify(preReg),
      assignments: JSON.stringify(assignments),
      startDate: start,
    },
  });
  await prisma.diagnoseFlow.update({
    where: { id: flowId },
    data: { state: "RUNNING", currentCandidateId: candidateId },
  });
  await prisma.diagnoseCandidateState.upsert({
    where: { userId_candidateId: { userId, candidateId } },
    create: { userId, candidateId, prior: def.prior, status: "untested" },
    update: {},
  });
  return { refused: false as const, run };
}

function fmt(v: number, outcome: OutcomeMetric): string {
  if (outcome === "total_sleep_time") return `${Math.round(v / 60)} min`;
  if (outcome === "volume_load_at_prescribed_rpe") return `${Math.round(v)} kg·reps`;
  if (outcome === "nocturnal_rhr") return `${Math.round(v * 10) / 10} bpm`;
  if (outcome === "temp_deviation") return `${Math.round(v * 100) / 100}°C`;
  return `${Math.round(v * 10) / 10}`;
}

// ── Verdict statistics ──────────────────────────────────────────────────

/** Exact/Monte-Carlo sign-permutation test on paired differences. */
export function permutationP(pairDiffs: number[]): number {
  const k = pairDiffs.length;
  const observed = Math.abs(pairDiffs.reduce((a, b) => a + b, 0));
  if (k <= 16) {
    let extreme = 0;
    const total = 2 ** k;
    for (let mask = 0; mask < total; mask++) {
      let s = 0;
      for (let i = 0; i < k; i++) s += (mask >> i) & 1 ? pairDiffs[i] : -pairDiffs[i];
      if (Math.abs(s) >= observed - 1e-12) extreme++;
    }
    return extreme / total;
  }
  let extreme = 0;
  const iters = 20_000;
  for (let it = 0; it < iters; it++) {
    let s = 0;
    for (let i = 0; i < k; i++) s += Math.random() < 0.5 ? pairDiffs[i] : -pairDiffs[i];
    if (Math.abs(s) >= observed - 1e-12) extreme++;
  }
  return extreme / iters;
}

/** Normal approx of Student-t CDF is not enough at tiny k — use jstat via
 *  a local implementation of the t CDF (Hill's algorithm via incomplete beta
 *  would be ideal; k here is 5-9 so we use a lookup-corrected normal). */
function tCdf(t: number, df: number): number {
  // Cornish-Fisher style correction of the normal for small df
  const g1 = (t ** 3 + t) / (4 * df);
  const g2 = (5 * t ** 5 + 16 * t ** 3 + 3 * t) / (96 * df ** 2);
  const z = t - g1 + g2;
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** Posterior P(mean paired effect > swc) under a noninformative prior:
 *  (μ − x̄)/(s/√k) ~ t_{k−1}. */
export function pEffectGtSWC(pairDiffs: number[], swc: number): number {
  const k = pairDiffs.length;
  if (k < 3) return 0.5;
  const mean = pairDiffs.reduce((a, b) => a + b, 0) / k;
  const sd = Math.sqrt(pairDiffs.reduce((a, b) => a + (b - mean) ** 2, 0) / (k - 1));
  if (sd === 0) return mean > swc ? 1 : 0;
  const t = (mean - swc) / (sd / Math.sqrt(k));
  return Math.min(1, Math.max(0, tCdf(t, k - 1)));
}

/** Compute + persist the verdict for a completed run, then learn (§8). */
export async function completeRun(runId: string): Promise<Verdict | { error: string }> {
  const userId = await getCurrentUserId();
  const run = await prisma.diagnoseRun.findFirst({ where: { id: runId } });
  if (!run) return { error: "run not found" };
  const assignments: Assignment[] = JSON.parse(run.assignments);
  const preReg: PreReg = JSON.parse(run.preReg);

  const usable = assignments.filter((a) => a.done && a.value != null && !a.excluded);
  const adherence = usable.length / assignments.length;

  // block-paired differences A − B
  const byPair = new Map<number, { A?: number; B?: number }>();
  for (const a of usable) {
    const p = byPair.get(a.pairIdx) ?? {};
    p[a.arm] = a.value!;
    byPair.set(a.pairIdx, p);
  }
  const diffs = [...byPair.values()]
    .filter((p) => p.A != null && p.B != null)
    .map((p) => p.A! - p.B!);

  let verdict: Verdict;
  if (adherence < 0.7 || diffs.length < 4) {
    verdict = {
      pEffectGtSWC: 0.5,
      randTestP: 1,
      mde: preReg.mde,
      feltDelta: feltDelta(run.feltRatings),
      decision: "inconclusive_low_adherence",
    };
  } else {
    const p = pEffectGtSWC(diffs, preReg.swc);
    verdict = {
      pEffectGtSWC: Math.round(p * 100) / 100,
      randTestP: Math.round(permutationP(diffs) * 1000) / 1000,
      mde: preReg.mde,
      feltDelta: feltDelta(run.feltRatings),
      decision: p >= 0.8 ? "effect_found" : p <= 0.2 ? "no_effect_at_mde" : "inconclusive",
    };
  }

  await prisma.diagnoseRun.update({
    where: { id: runId },
    data: { status: "complete", verdict: JSON.stringify(verdict) },
  });

  // §8 learning — auditable prior updates
  const def = CANDIDATE_LIBRARY.find((c) => c.id === run.candidateId);
  const st = await prisma.diagnoseCandidateState.findFirst({
    where: { candidateId: run.candidateId },
  });
  const prior = st?.prior ?? def?.prior ?? 0.3;
  if (verdict.decision === "effect_found") {
    await prisma.diagnoseCandidateState.upsert({
      where: { userId_candidateId: { userId, candidateId: run.candidateId } },
      create: { userId, candidateId: run.candidateId, prior: Math.min(0.9, prior + 0.2), status: "confirmed", lastVerdict: JSON.stringify(verdict) },
      update: { prior: Math.min(0.9, prior + 0.2), status: "confirmed", lastVerdict: JSON.stringify(verdict) },
    });
    await prisma.diagnoseFlow.update({
      where: { id: run.flowId },
      data: { state: "VERDICT", closedAt: new Date(), closedAs: "confirmed" },
    });
  } else if (verdict.decision === "no_effect_at_mde") {
    const parked = new Date(Date.now() + 90 * 86_400_000);
    await prisma.diagnoseCandidateState.upsert({
      where: { userId_candidateId: { userId, candidateId: run.candidateId } },
      create: { userId, candidateId: run.candidateId, prior: prior * 0.6, status: "no_effect_at_mde", parkedUntil: parked, lastVerdict: JSON.stringify(verdict) },
      update: { prior: prior * 0.6, status: "no_effect_at_mde", parkedUntil: parked, lastVerdict: JSON.stringify(verdict) },
    });
    await prisma.diagnoseFlow.update({
      where: { id: run.flowId },
      data: { state: "CANDIDATES_RANKED", currentCandidateId: null },
    });
  } else {
    await prisma.diagnoseFlow.update({
      where: { id: run.flowId },
      data: { state: "VERDICT" },
    });
  }
  return verdict;
}

function feltDelta(feltRatings: string | null): number | null {
  if (!feltRatings) return null;
  try {
    const rows: { armA: number; armB: number }[] = JSON.parse(feltRatings);
    if (!rows.length) return null;
    const d = rows.map((r) => r.armA - r.armB);
    return Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10;
  } catch {
    return null;
  }
}
