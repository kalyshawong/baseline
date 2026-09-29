/**
 * Hybrid mode (runs AND lifts) — pure rules, no prisma. Built 2026-09-28.
 *
 * The Today call for a hybrid athlete escalates in three levels:
 *   facts → flag → swap
 * A swap suggestion ("move legs to tomorrow") only appears when the person
 * is VERY consistent (HYBRID.weeksForSwap qualifying weeks) AND their own
 * data shows the conflict hurts them (see interference below). Travel
 * pauses the count instead of resetting it.
 */

export const HYBRID = {
  /** Qualifying weeks before a conflict is flagged (amber) instead of shown as plain facts. */
  weeksForFlag: 3,
  /** Qualifying weeks before a swap can be suggested. */
  weeksForSwap: 6,
  /** Logged days needed in a full week; scaled down for travel days. */
  loggedDaysPerWeek: 5,
  /** Days with nothing logged before the app asks "traveling or a break?". */
  gapDays: 4,
  /** Only ask about gaps that ended within this many days. */
  gapAskWithinDays: 30,
  /** How far back the streak walk looks. */
  lookbackWeeks: 26,
  /** A GPS run this far from home marks the day as away. */
  awayKm: 150,
} as const;

/* ---------------- consistency ---------------- */

export interface DayFacts {
  day: string; // YYYY-MM-DD, local
  /** Anything the person logged by hand: food, tags, soreness, a lift session, a non-walk workout. */
  logged: boolean;
  ran: boolean;
  lifted: boolean;
  /** Travel tag / Travel life context / answered "Traveling" / GPS run far from home. */
  travel: boolean;
  /** Answered "Break" for this day. */
  brk: boolean;
}

export type WeekStatus = "counts" | "paused" | "missed";

export interface WeekResult {
  start: string; // Monday
  status: WeekStatus;
  ran: boolean;
  lifted: boolean;
  loggedDays: number;
  neededDays: number;
  travelDays: number;
  current: boolean;
}

export function scoreWeek(days: DayFacts[], current = false): WeekResult {
  const ran = days.some((d) => d.ran);
  const lifted = days.some((d) => d.lifted);
  const loggedDays = days.filter((d) => d.logged).length;
  // Travel days you didn't log on don't count against you.
  const travelIdle = days.filter((d) => d.travel && !d.logged).length;
  const travelDays = days.filter((d) => d.travel).length;
  const available = Math.max(0, 7 - travelIdle);
  const neededDays = Math.ceil((HYBRID.loggedDaysPerWeek * available) / 7);
  const meets = ran && lifted && loggedDays >= neededDays;
  let status: WeekStatus;
  if (meets) status = "counts";
  else if (travelDays >= 4) status = "paused"; // mostly away: the count waits
  else status = "missed";
  return { start: days[0]?.day ?? "", status, ran, lifted, loggedDays, neededDays, travelDays, current };
}

/**
 * Streak of qualifying weeks, newest first. Paused weeks are skipped (the
 * count waits), a missed week ends the streak. The current, unfinished week
 * adds to the streak once it already qualifies and never breaks it.
 */
export function consistencyStreak(weeks: WeekResult[]): { streak: number; pausedWeeks: number } {
  let streak = 0;
  let pausedWeeks = 0;
  for (const w of weeks) {
    if (w.current) {
      if (w.status === "counts") streak++;
      continue;
    }
    if (w.status === "counts") streak++;
    else if (w.status === "paused") pausedWeeks++;
    else break;
  }
  return { streak, pausedWeeks };
}

export type HybridLevel = "facts" | "flag" | "swap";

export function levelFor(streak: number): HybridLevel {
  if (streak >= HYBRID.weeksForSwap) return "swap";
  if (streak >= HYBRID.weeksForFlag) return "flag";
  return "facts";
}

/* ---------------- gaps ---------------- */

export interface Gap {
  start: string;
  end: string;
  days: number;
}

/**
 * Most recent run of HYBRID.gapDays+ consecutive days with nothing logged
 * and no travel/break answer, ending no later than yesterday. `days` is
 * chronological and should end at yesterday. Days flagged away (GPS) are
 * already travel=true, so a trip with an away run next to it never asks.
 */
export function findGap(days: DayFacts[]): Gap | null {
  let best: Gap | null = null;
  let runStart = -1;
  for (let i = 0; i <= days.length; i++) {
    const idle = i < days.length && !days[i].logged && !days[i].travel && !days[i].brk;
    if (idle && runStart < 0) runStart = i;
    if (!idle && runStart >= 0) {
      const len = i - runStart;
      if (len >= HYBRID.gapDays) best = { start: days[runStart].day, end: days[i - 1].day, days: len };
      runStart = -1;
    }
  }
  return best;
}

/** Great-circle distance, km. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]);
  const dLng = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* ---------------- interference (her own data) ---------------- */

export interface RunPoint {
  at: number; // ms
  paceSecKm: number;
  km: number;
}
export interface LegPoint {
  at: number; // ms, session completed
  sets: number;
  /** Mean of (best e1RM / that exercise's median best e1RM) across leg exercises. null = no loads. */
  strength: number | null;
}

/** Runs worth comparing: ≥1.5 km at 3:00–10:00 /km. Slower almost always means a paused or mislabeled walk. */
export function usableRun(km: number, seconds: number): boolean {
  if (!(km >= 1.5) || !(seconds > 0)) return false;
  const pace = seconds / km;
  return pace >= 180 && pace <= 600;
}

export interface Proof {
  kind: "runAfterLegs" | "legsAfterRun";
  nAfter: number;
  nOther: number;
  /** runAfterLegs: seconds per km slower (+). legsAfterRun: % lower top sets (+). */
  effect: number;
  p: number;
  proven: boolean;
  /** Plain-language line built only from her numbers. */
  line: string;
}

const MIN_EACH = 4;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** One-sided permutation test: is mean(a) − mean(b) this large by chance? */
export function permutationP(a: number[], b: number[], iters = 4000): number {
  const obs = mean(a) - mean(b);
  const all = [...a, ...b];
  const rnd = mulberry32(20260928);
  let hits = 0;
  for (let k = 0; k < iters; k++) {
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    const d = mean(all.slice(0, a.length)) - mean(all.slice(a.length));
    if (d >= obs - 1e-9) hits++;
  }
  return (hits + 1) / (iters + 1);
}

const fmtPace = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Are her runs slower within 48h after a leg session? */
export function runAfterLegsProof(runs: RunPoint[], legs: LegPoint[], windowH = 48): Proof {
  const after: number[] = [];
  const other: number[] = [];
  for (const r of runs) {
    const hit = legs.some((l) => l.at < r.at && r.at - l.at <= windowH * 3600_000);
    (hit ? after : other).push(r.paceSecKm);
  }
  const base = { kind: "runAfterLegs" as const, nAfter: after.length, nOther: other.length };
  if (after.length < MIN_EACH || other.length < MIN_EACH) {
    return { ...base, effect: 0, p: 1, proven: false, line: `Needs ${MIN_EACH} runs within 2 days of legs and ${MIN_EACH} without · ${after.length} and ${other.length} so far` };
  }
  const effect = mean(after) - mean(other);
  const p = permutationP(after, other);
  const proven = effect >= 5 && p <= 0.1;
  const line = effect >= 0
    ? `Your runs within 2 days of legs average ${fmtPace(mean(after))}/km vs ${fmtPace(mean(other))}/km otherwise (${after.length} vs ${other.length} runs)`
    : `Your runs within 2 days of legs are not slower (${fmtPace(mean(after))} vs ${fmtPace(mean(other))}/km)`;
  return { ...base, effect, p, proven, line };
}

/** Are her leg top sets lower within 36h after a run? */
export function legsAfterRunProof(legs: LegPoint[], runs: RunPoint[], windowH = 36): Proof {
  const after: number[] = [];
  const other: number[] = [];
  for (const l of legs) {
    if (l.strength == null) continue;
    const hit = runs.some((r) => r.at < l.at && l.at - r.at <= windowH * 3600_000);
    (hit ? after : other).push(l.strength);
  }
  const base = { kind: "legsAfterRun" as const, nAfter: after.length, nOther: other.length };
  if (after.length < MIN_EACH || other.length < MIN_EACH) {
    return { ...base, effect: 0, p: 1, proven: false, line: `Needs ${MIN_EACH} leg sessions the day after a run and ${MIN_EACH} without · ${after.length} and ${other.length} so far` };
  }
  // effect as % lower after a run (positive = worse)
  const effect = (mean(other) - mean(after)) * 100;
  const p = permutationP(other, after);
  const proven = effect >= 3 && p <= 0.1;
  const line = effect >= 0
    ? `Your leg top sets the day after a run are ${effect.toFixed(0)}% lower (${after.length} vs ${other.length} sessions)`
    : `Your leg top sets the day after a run are not lower (${after.length} vs ${other.length} sessions)`;
  return { ...base, effect, p, proven, line };
}
