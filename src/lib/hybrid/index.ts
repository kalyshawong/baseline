import { prisma } from "@/lib/db";
import { getLocalDayBounds, getLocalDayStr, getRequestTz } from "@/lib/date-utils";
import { getCurrentUserId } from "@/lib/current-user";
import { e1rm } from "@/lib/strength/session-plan";
import {
  HYBRID,
  consistencyStreak,
  findGap,
  haversineKm,
  legsAfterRunProof,
  levelFor,
  runAfterLegsProof,
  scoreWeek,
  usableRun,
  type DayFacts,
  type Gap,
  type HybridLevel,
  type LegPoint,
  type Proof,
  type RunPoint,
  type WeekResult,
} from "@/lib/hybrid/config";

export * from "@/lib/hybrid/config";

/**
 * Hybrid mode, server side: consistency streak (travel pauses it), the one
 * gap question, and today's run/legs conflict with proof from her own data.
 */

export const LEG_MUSCLES = new Set(["quads", "hamstrings", "glutes", "calves"]);
export const BREAK_LABEL = "Training break";
const TRAVEL_RE = /travel|flight|trip|away/i;
const RUN_RE = /run/i;
const WALK_RE = /walk|hik/i;
const STRENGTH_RE = /strength/i;

export type ConflictKind = "legsAfterRun" | "runAfterLegs" | "legsBeforeRun";

export interface HybridConflict {
  kind: ConflictKind;
  /** Facts only — what happened / what's on deck. */
  facts: string;
  proof: Proof;
  /** "Consider a swap?" text — only at the swap level with proof from her own data. */
  swap: string | null;
  /** Today's answer to the swap question. "no" changes nothing. */
  decision: "yes" | "no" | null;
}

export interface HybridToday {
  level: HybridLevel;
  streak: number;
  needed: number;
  pausedWeeks: number;
  /** Newest first, current week included. */
  weeks: WeekResult[];
  gap: Gap | null;
  conflict: HybridConflict | null;
  /** Runs left out of the pace comparison (under 1.5 km or slower than 10:00/km). */
  excludedRuns: number;
}

const DAY = 86400_000;
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addDays(day: string, n: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}
function firstPoint(routeJson: string | null): [number, number] | null {
  if (!routeJson) return null;
  try {
    const r = JSON.parse(routeJson) as [number, number][];
    return Array.isArray(r) && r.length && typeof r[0][0] === "number" ? r[0] : null;
  } catch {
    return null;
  }
}
const toKm = (d: number | null, unit: string | null) => (d == null ? 0 : unit === "m" ? d / 1000 : unit === "mi" ? d * 1.609344 : d);

export async function hybridToday(deckMuscles: string[] = []): Promise<HybridToday> {
  const tz = await getRequestTz();
  const today = getLocalDayStr(tz);
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayOf = (d: Date) => localDay.format(d);
  const utcDay = (d: Date) => d.toISOString().slice(0, 10);

  const firstDay = addDays(mondayOf(today), -7 * HYBRID.lookbackWeeks);
  const since = new Date(new Date(firstDay + "T00:00:00Z").getTime() - DAY); // tz slack

  const [nutrition, tags, soreness, sessions, hk, oura, contexts] = await Promise.all([
    prisma.nutritionLog.findMany({ where: { day: { gte: since } }, select: { day: true, _count: { select: { entries: true } } } }),
    prisma.activityTag.findMany({ where: { timestamp: { gte: since } }, select: { tag: true, category: true, timestamp: true } }),
    prisma.sorenessLog.findMany({ where: { day: { gte: since } }, select: { day: true } }),
    prisma.workoutSession.findMany({
      where: { completedAt: { not: null }, date: { gte: since } },
      select: {
        completedAt: true,
        sets: { where: { isWarmup: false }, select: { weight: true, reps: true, rir: true, rpe: true, exerciseId: true, exercise: { select: { muscleGroup: true } } } },
      },
    }),
    prisma.healthKitWorkout.findMany({
      where: { startedAt: { gte: since } },
      select: { name: true, startedAt: true, durationSeconds: true, distance: true, distanceUnit: true, routeJson: true },
    }),
    prisma.ouraWorkout.findMany({ where: { startedAt: { gte: since } }, select: { activity: true, startedAt: true } }).catch(() => []),
    prisma.lifeContextLog.findMany({ where: { day: { gte: since } }, select: { day: true, def: { select: { label: true } } } }),
  ]);

  // ---- per-day facts
  const facts = new Map<string, DayFacts>();
  const f = (day: string) => {
    let x = facts.get(day);
    if (!x) facts.set(day, (x = { day, logged: false, ran: false, lifted: false, travel: false, brk: false }));
    return x;
  };
  for (const n of nutrition) if (n._count.entries > 0) f(utcDay(n.day)).logged = true;
  let decision: "yes" | "no" | null = null;
  for (const t of tags) {
    if (t.category === "hybrid") {
      // Swap answers: bookkeeping only, not a logged day.
      if (dayOf(t.timestamp) === today) decision = t.tag === "swap yes" ? "yes" : "no";
      continue;
    }
    const d = f(dayOf(t.timestamp));
    d.logged = true;
    if (/travel|flight/i.test(t.tag)) d.travel = true;
  }
  for (const s of soreness) f(utcDay(s.day)).logged = true;
  for (const c of contexts) {
    const d = f(utcDay(c.day));
    if (c.def.label === BREAK_LABEL) d.brk = true;
    else if (TRAVEL_RE.test(c.def.label)) d.travel = true;
    else d.logged = true;
  }
  for (const s of sessions) {
    if (!s.completedAt || !s.sets.length) continue;
    const d = f(dayOf(s.completedAt));
    d.logged = true;
    d.lifted = true;
  }
  for (const o of oura) {
    if (/run/i.test(o.activity)) f(dayOf(o.startedAt)).ran = true;
  }

  // Home = most common ~10 km cell of GPS starts in the last 90 days.
  const cells = new Map<string, { n: number; pt: [number, number] }>();
  const recentCut = Date.now() - 90 * DAY;
  for (const w of hk) {
    const pt = firstPoint(w.routeJson);
    if (!pt || w.startedAt.getTime() < recentCut) continue;
    const k = `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`;
    const c = cells.get(k) ?? { n: 0, pt };
    c.n++;
    cells.set(k, c);
  }
  const home = [...cells.values()].sort((a, b) => b.n - a.n)[0]?.pt ?? null;

  const runs: RunPoint[] = [];
  let excludedRuns = 0;
  for (const w of hk) {
    const d = f(dayOf(w.startedAt));
    const pt = firstPoint(w.routeJson);
    if (home && pt && haversineKm(home, pt) > HYBRID.awayKm) d.travel = true;
    if (RUN_RE.test(w.name)) {
      d.ran = true;
      d.logged = true;
      const km = toKm(w.distance, w.distanceUnit);
      if (usableRun(km, w.durationSeconds)) runs.push({ at: w.startedAt.getTime(), km, paceSecKm: w.durationSeconds / km });
      else excludedRuns++;
    } else if (STRENGTH_RE.test(w.name)) {
      d.lifted = true;
      d.logged = true;
    } else if (!WALK_RE.test(w.name)) {
      d.logged = true;
    }
  }

  // ---- weeks, newest first
  const weeks: WeekResult[] = [];
  const thisMonday = mondayOf(today);
  for (let w = 0; w <= HYBRID.lookbackWeeks; w++) {
    const start = addDays(thisMonday, -7 * w);
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(start, i);
      return facts.get(day) ?? { day, logged: false, ran: false, lifted: false, travel: false, brk: false };
    });
    weeks.push(scoreWeek(days, w === 0));
  }
  const { streak, pausedWeeks } = consistencyStreak(weeks);
  const level = levelFor(streak);

  // ---- gap: last 60 days up to yesterday
  const gapDays: DayFacts[] = [];
  for (let i = 60; i >= 1; i--) {
    const day = addDays(today, -i);
    gapDays.push(facts.get(day) ?? { day, logged: false, ran: false, lifted: false, travel: false, brk: false });
  }
  // Only ask about gaps after the person started logging: a new account (or
  // one whose history starts mid-window) has no "missed" days before that.
  const firstLogged = gapDays.findIndex((d) => d.logged || d.travel || d.brk);
  let gap = firstLogged < 0 ? null : findGap(gapDays.slice(firstLogged));
  if (gap && addDays(gap.end, HYBRID.gapAskWithinDays) < today) gap = null;
  if (gap && home) {
    // Moved between the workouts either side of the gap → it was a trip; don't ask.
    const before = hk.filter((w) => dayOf(w.startedAt) < gap!.start && firstPoint(w.routeJson)).sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0];
    const after = hk.filter((w) => dayOf(w.startedAt) > gap!.end && firstPoint(w.routeJson)).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];
    const pb = before ? firstPoint(before.routeJson) : null;
    const pa = after ? firstPoint(after.routeJson) : null;
    if ((pb && pa && haversineKm(pb, pa) > HYBRID.awayKm) || (pa && haversineKm(home, pa) > HYBRID.awayKm) || (pb && haversineKm(home, pb) > HYBRID.awayKm)) gap = null;
  }

  // ---- leg sessions with a relative-strength score
  const legSessions = sessions
    .filter((s) => s.completedAt && s.sets.some((x) => LEG_MUSCLES.has(x.exercise.muscleGroup)))
    .map((s) => {
      const best = new Map<string, number>();
      let sets = 0;
      for (const x of s.sets) {
        if (!LEG_MUSCLES.has(x.exercise.muscleGroup)) continue;
        sets++;
        if (!(x.weight > 0) || !(x.reps > 0)) continue;
        const rir = x.rir ?? (x.rpe != null ? Math.max(0, 10 - x.rpe) : null);
        const v = e1rm(x.weight, x.reps, rir);
        if (v > (best.get(x.exerciseId) ?? 0)) best.set(x.exerciseId, v);
      }
      return { at: s.completedAt!.getTime(), sets, best };
    });
  const byEx = new Map<string, number[]>();
  for (const s of legSessions) for (const [ex, v] of s.best) byEx.set(ex, [...(byEx.get(ex) ?? []), v]);
  const median = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
  const legs: LegPoint[] = legSessions.map((s) => {
    const ratios = [...s.best.entries()].filter(([ex]) => (byEx.get(ex)?.length ?? 0) >= 2).map(([ex, v]) => v / median(byEx.get(ex)!));
    return { at: s.at, sets: s.sets, strength: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null };
  });

  // ---- today's conflict
  const now = Date.now();
  const whenLabel = (at: number) => {
    const d = dayOf(new Date(at));
    if (d === today) return "today";
    if (d === addDays(today, -1)) return "yesterday";
    return `${Math.round((new Date(today + "T00:00:00Z").getTime() - new Date(d + "T00:00:00Z").getTime()) / DAY)} days ago`;
  };
  const legsOnDeck = deckMuscles.some((m) => LEG_MUSCLES.has(m));
  const lastRun = runs.filter((r) => now - r.at <= 36 * 3600_000).sort((a, b) => b.at - a.at)[0] ?? null;
  const lastLegs = legs.filter((l) => now - l.at <= 48 * 3600_000).sort((a, b) => b.at - a.at)[0] ?? null;
  const tomorrow = addDays(today, 1);
  const tomorrowWd = new Date(tomorrow + "T00:00:00Z").getUTCDay();
  const runWeeks = new Set<string>();
  for (const r of runs) {
    const d = dayOf(new Date(r.at));
    if (d < addDays(thisMonday, -28) || d >= thisMonday) continue;
    if (new Date(d + "T00:00:00Z").getUTCDay() === tomorrowWd) runWeeks.add(mondayOf(d));
  }
  const usuallyRunsTomorrow = runWeeks.size >= 2;

  let conflict: HybridConflict | null = null;
  if (legsOnDeck && lastRun) {
    const proof = legsAfterRunProof(legs, runs);
    conflict = { kind: "legsAfterRun", facts: `Ran ${lastRun.km.toFixed(1)} km ${whenLabel(lastRun.at)} · legs on deck today`, proof, swap: null, decision };
    if (level === "swap" && proof.proven) conflict.swap = "Legs tomorrow instead";
  } else if (lastLegs) {
    const proof = runAfterLegsProof(runs, legs);
    conflict = { kind: "runAfterLegs", facts: whenLabel(lastLegs.at) === "today" ? `Legs today (${lastLegs.sets} sets) · a run in the next 2 days lands right after it` : `Legs ${whenLabel(lastLegs.at)} (${lastLegs.sets} sets) · a run today lands within 2 days of it`, proof, swap: null, decision };
    if (level === "swap" && proof.proven) conflict.swap = "Run tomorrow instead, or keep today easy";
  } else if (legsOnDeck && usuallyRunsTomorrow) {
    const proof = runAfterLegsProof(runs, legs);
    conflict = { kind: "legsBeforeRun", facts: `Legs on deck today · you usually run on ${WD[tomorrowWd]}s`, proof, swap: null, decision };
    if (level === "swap" && proof.proven) conflict.swap = "Legs after tomorrow's run instead";
  }

  return { level, streak, needed: HYBRID.weeksForSwap, pausedWeeks, weeks: weeks.slice(0, 8), gap, conflict, excludedRuns };
}

/** Answer the gap question: every day in [start, end] gets Travel or Training break. */
export async function answerGap(start: string, end: string, answer: "travel" | "break"): Promise<number> {
  const userId = await getCurrentUserId();
  let def: { id: string };
  if (answer === "travel") {
    const defs = await prisma.lifeContextDef.findMany({ where: { archived: false }, select: { id: true, label: true } });
    const found = defs.find((d) => /^travel$/i.test(d.label)) ?? defs.find((d) => TRAVEL_RE.test(d.label));
    def = found ?? await prisma.lifeContextDef.create({ data: { userId, label: "Travel", category: "custom" } });
  } else {
    // Archived so it never shows up as a chip on Mind — it only answers the question.
    def = await prisma.lifeContextDef.upsert({
      where: { userId_label: { userId, label: BREAK_LABEL } },
      update: {},
      create: { userId, label: BREAK_LABEL, category: "hybrid", archived: true },
    });
  }
  let n = 0;
  for (let d = start; d <= end && n < 60; d = addDays(d, 1)) {
    const day = new Date(d + "T00:00:00Z");
    await prisma.lifeContextLog.upsert({
      where: { defId_day: { defId: def.id, day } },
      update: {},
      create: { userId, defId: def.id, day },
    });
    n++;
  }
  return n;
}

/** Answer "Consider a swap?" for today. Stored as a hybrid-category tag; "no" changes nothing. */
export async function answerSwap(answer: "yes" | "no", kind: string, swap: string): Promise<void> {
  const userId = await getCurrentUserId();
  const tz = await getRequestTz();
  const today = getLocalDayStr(tz);
  const { start, end } = getLocalDayBounds(today, tz);
  await prisma.activityTag.deleteMany({ where: { category: "hybrid", timestamp: { gte: start, lt: end } } });
  await prisma.activityTag.create({
    data: { userId, tag: `swap ${answer}`, category: "hybrid", source: "hybrid", metadata: JSON.stringify({ kind, swap }) },
  });
}
