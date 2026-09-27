import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { e1rm } from "@/lib/strength/session-plan";
import {
  VARS, LIFT_RE, nextMonday, outcomeLabel,
  type LiftBlock, type LiftDesign, type LiftPreReg, type LiftName,
} from "@/lib/strength/experiments-config";

/**
 * Lifting experiments — design_handoff_baseline_ios_strength, screen 6.
 * Week-block A/B designs stored in the existing Experiment table with
 * metricSource "Strength": assignments = blocks (balanced pairs, AB or BA),
 * preReg = the locked design. Only one runs at a time; the next one is
 * queued and starts the Monday after the running one ends. No interim
 * numbers: the verdict is computed once, after the last block.
 */

const DAY = 86400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface RunningLift {
  id: string;
  title: string;
  outcome: string;
  blockWeeks: number;
  blocks: LiftBlock[];
  current: number; // 0-based index of the current block, -1 before start, blocks.length after
  arm: "A" | "B" | null;
  armText: string | null;
  restSeconds: number | null;
  sessionsThisBlock: number;
  sessionsNeeded: number;
  unlock: string; // YYYY-MM-DD
  status: "scheduled" | "active" | "done";
  startsIn: string | null;
  result: LiftResult | null;
}

export interface LiftResult {
  pairs: number;
  meanDiff: number; // B − A in outcome units
  pctDiff: number | null;
  p: number;
  decision: "effect_found" | "no_effect" | "inconclusive";
  perBlock: { idx: number; arm: "A" | "B"; value: number | null }[];
}

function parse(exp: { assignments: string | null; preReg: string | null }): { blocks: LiftBlock[]; pre: LiftPreReg } | null {
  try {
    const pre = JSON.parse(exp.preReg ?? "null") as LiftPreReg | null;
    const blocks = JSON.parse(exp.assignments ?? "[]") as LiftBlock[];
    if (!pre || pre.kind !== "lift") return null;
    return { blocks, pre };
  } catch {
    return null;
  }
}

/** Best outcome in a date range for the lift: top-set volume at the RPE (±0.5 → RIR 10-rpe) or best e1RM. */
async function outcomeFor(pre: LiftPreReg, start: Date, end: Date): Promise<{ value: number | null; sessions: number }> {
  const sets = await prisma.workoutSet.findMany({
    where: { isWarmup: false, session: { completedAt: { not: null }, date: { gte: start, lt: end } } },
    select: { weight: true, reps: true, rir: true, rpe: true, session: { select: { id: true } }, exercise: { select: { name: true } } },
  });
  const re = LIFT_RE[pre.lift];
  const mine = sets.filter((s) => re.test(s.exercise.name.trim()));
  const sessions = new Set(mine.map((s) => s.session.id)).size;
  if (!mine.length) return { value: null, sessions: 0 };
  if (pre.outcome === "e1") {
    return { value: Math.max(...mine.map((s) => e1rm(s.weight, s.reps, s.rir ?? (s.rpe != null ? Math.max(0, 10 - s.rpe) : null)))), sessions };
  }
  const targetRir = 10 - pre.rpe;
  const at = mine.filter((s) => (s.rir ?? (s.rpe != null ? 10 - s.rpe : null)) === targetRir);
  if (!at.length) return { value: null, sessions };
  return { value: Math.max(...at.map((s) => s.weight * s.reps)), sessions };
}

function signPermutation(diffs: number[]): number {
  const n = diffs.length;
  if (!n) return 1;
  const obs = Math.abs(diffs.reduce((a, b) => a + b, 0));
  let count = 0;
  const total = 1 << n;
  for (let m = 0; m < total; m++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += (m >> i) & 1 ? diffs[i] : -diffs[i];
    if (Math.abs(s) >= obs - 1e-9) count++;
  }
  return count / total;
}

async function verdict(pre: LiftPreReg, blocks: LiftBlock[]): Promise<LiftResult> {
  const perBlock: LiftResult["perBlock"] = [];
  const vals: (number | null)[] = [];
  for (const b of blocks) {
    const { value } = await outcomeFor(pre, new Date(`${b.start}T00:00:00Z`), new Date(new Date(`${b.end}T00:00:00Z`).getTime() + DAY));
    vals.push(value);
    perBlock.push({ idx: b.idx, arm: b.arm, value });
  }
  const diffs: number[] = [];
  const aVals: number[] = [];
  for (let p = 0; p < blocks.length / 2; p++) {
    const pair = blocks.filter((b) => b.pairIdx === p);
    const a = pair.find((b) => b.arm === "A"), bb = pair.find((b) => b.arm === "B");
    if (!a || !bb) continue;
    const va = vals[a.idx], vb = vals[bb.idx];
    if (va == null || vb == null) continue;
    diffs.push(vb - va);
    aVals.push(va);
  }
  const pairs = diffs.length;
  const meanDiff = pairs ? diffs.reduce((s, v) => s + v, 0) / pairs : 0;
  const meanA = aVals.length ? aVals.reduce((s, v) => s + v, 0) / aVals.length : null;
  const p = signPermutation(diffs);
  const decision: LiftResult["decision"] = pairs < 3 ? "inconclusive" : p < 0.05 ? "effect_found" : "no_effect";
  return { pairs, meanDiff, pctDiff: meanA ? (meanDiff / meanA) * 100 : null, p, decision, perBlock };
}

export async function liftExperiments(): Promise<{ running: RunningLift | null; queued: RunningLift[]; finished: RunningLift[] }> {
  const rows = await prisma.experiment.findMany({ where: { metricSource: "Strength" }, orderBy: { startDate: "asc" } });
  const today = iso(new Date());
  const all: RunningLift[] = [];
  for (const exp of rows) {
    const parsed = parse(exp);
    if (!parsed) continue;
    const { blocks, pre } = parsed;
    const v = VARS.find((x) => x.id === pre.variable);
    const last = blocks[blocks.length - 1];
    const unlock = iso(new Date(new Date(`${last.end}T00:00:00Z`).getTime() + DAY));
    let current = blocks.findIndex((b) => b.start <= today && b.end >= today);
    let status: RunningLift["status"] = "active";
    if (current < 0) {
      if (today < blocks[0].start) { current = -1; status = "scheduled"; }
      else { current = blocks.length; status = "done"; }
    }
    let result: LiftResult | null = null;
    if (status === "done") {
      if (exp.resultJson) {
        try { result = JSON.parse(exp.resultJson) as LiftResult; } catch { result = null; }
      }
      if (!result) {
        result = await verdict(pre, blocks);
        await prisma.experiment.update({ where: { id: exp.id }, data: { resultJson: JSON.stringify(result), status: "analyzed", endDate: new Date(`${unlock}T00:00:00Z`) } }).catch(() => null);
      }
    } else if (exp.status !== (status === "active" ? "active" : "scheduled")) {
      await prisma.experiment.update({ where: { id: exp.id }, data: { status: status === "active" ? "active" : "scheduled" } }).catch(() => null);
    }
    const cur = status === "active" ? blocks[current] : null;
    let sessionsThisBlock = 0;
    if (cur) {
      sessionsThisBlock = await prisma.workoutSession.count({ where: { completedAt: { not: null }, date: { gte: new Date(`${cur.start}T00:00:00Z`), lt: new Date(new Date(`${cur.end}T00:00:00Z`).getTime() + DAY) } } });
    }
    const arm = cur?.arm ?? null;
    all.push({
      id: exp.id,
      title: exp.title,
      outcome: `${outcomeLabel(pre)} · ${pre.blockWeeks}-week blocks`,
      blockWeeks: pre.blockWeeks,
      blocks,
      current,
      arm,
      armText: arm && v ? v[arm] : null,
      restSeconds: arm && v?.rest ? v.rest[arm] : null,
      sessionsThisBlock,
      sessionsNeeded: pre.blockWeeks * 3,
      unlock,
      status,
      startsIn: status === "scheduled" ? blocks[0].start : null,
      result,
    });
  }
  const running = all.find((x) => x.status === "active") ?? all.find((x) => x.status === "scheduled") ?? null;
  const queued = all.filter((x) => x !== running && x.status === "scheduled");
  const finished = all.filter((x) => x.status === "done").reverse();
  return { running, queued, finished };
}

/** Rest seconds prescribed by the running rest-interval experiment, if any. */
export async function prescribedRest(): Promise<{ seconds: number; note: string } | null> {
  const { running } = await liftExperiments();
  if (!running || running.status !== "active" || running.restSeconds == null) return null;
  return { seconds: running.restSeconds, note: `Experiment · ${running.armText} rest` };
}

export async function queueLiftExperiment(d: LiftDesign): Promise<{ id: string; start: string; end: string } | { error: string }> {
  const v = VARS.find((x) => x.id === d.variable);
  if (!v) return { error: "Unknown variable" };
  if (!v.len.includes(d.blockWeeks)) return { error: `${v.n} runs in ${v.len.join(" or ")}-week blocks` };
  if (![4, 6, 8].includes(d.blocks)) return { error: "Pick 4, 6 or 8 blocks" };
  const { running, queued } = await liftExperiments();
  const chain = [running, ...queued].filter((x): x is RunningLift => !!x);
  if (chain.some((x) => x.title.startsWith(v.n))) return { error: `${v.n} is already running or queued` };
  // Starts the Monday after the last queued one ends; else next Monday.
  let start = nextMonday(new Date());
  if (chain.length) {
    const lastEnd = chain[chain.length - 1].blocks.slice(-1)[0].end;
    start = nextMonday(new Date(`${lastEnd}T00:00:00Z`));
    // nextMonday is strictly after; if lastEnd is a Sunday this is the next day.
  }
  const blocks: LiftBlock[] = [];
  for (let p = 0; p < d.blocks / 2; p++) {
    const flip = Math.random() < 0.5;
    for (let leg = 0; leg < 2; leg++) {
      const idx = p * 2 + leg;
      const s = new Date(start.getTime() + idx * d.blockWeeks * 7 * DAY);
      const e = new Date(s.getTime() + (d.blockWeeks * 7 - 1) * DAY);
      blocks.push({ idx, pairIdx: p, start: iso(s), end: iso(e), arm: (leg === 0) === flip ? "B" : "A", value: null, sessions: 0 });
    }
  }
  const pre: LiftPreReg = {
    kind: "lift",
    variable: v.id,
    arms: { A: v.A, B: v.B },
    outcome: d.outcome,
    rpe: d.rpe,
    lift: d.lift,
    blockWeeks: d.blockWeeks,
    blocks: d.blocks,
    analysis: "Sign-permutation test on block-paired differences (B − A). No interim results; verdict after the last block.",
    exclusionRule: "A block with no logged set of the lift at the prescribed RPE is excluded — both arms, pre-set.",
    lockedAt: new Date().toISOString(),
  };
  const exp = await prisma.experiment.create({
    data: {
      userId: await getCurrentUserId(),
      title: `${v.n}: ${v.A} vs ${v.B}`,
      hypothesis: `${v.B} changes ${outcomeLabel(d)} vs ${v.A}.`,
      independentVariable: v.n,
      dependentVariable: outcomeLabel(d),
      dependentMetric: d.outcome === "vol" ? `vol@${d.rpe}:${d.lift}` : `e1rm:${d.lift}`,
      metricSource: "Strength",
      lagDays: 0,
      minDays: d.blocks * d.blockWeeks * 7,
      startDate: start,
      endDate: new Date(`${blocks[blocks.length - 1].end}T00:00:00Z`),
      status: "scheduled",
      assignments: JSON.stringify(blocks),
      preReg: JSON.stringify(pre),
    },
  });
  return { id: exp.id, start: blocks[0].start, end: blocks[blocks.length - 1].end };
}

/** Sessions of each main lift in the last 8 weeks — the designer disables lifts under 4. */
export async function liftSessionCounts(): Promise<Record<LiftName, number>> {
  const since = new Date(Date.now() - 56 * DAY);
  const sets = await prisma.workoutSet.findMany({
    where: { isWarmup: false, session: { completedAt: { not: null }, date: { gte: since } } },
    select: { session: { select: { id: true } }, exercise: { select: { name: true } } },
  });
  const out = { Bench: 0, Squat: 0, OHP: 0, Deadlift: 0 } as Record<LiftName, number>;
  for (const lift of Object.keys(out) as LiftName[]) {
    out[lift] = new Set(sets.filter((s) => LIFT_RE[lift].test(s.exercise.name.trim())).map((s) => s.session.id)).size;
  }
  return out;
}
