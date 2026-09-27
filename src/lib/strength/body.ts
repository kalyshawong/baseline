import { prisma } from "@/lib/db";
import { getLocalDayStr, getRequestTz } from "@/lib/date-utils";
import { getSorenessForDay } from "@/lib/soreness";
import { e1rm, weeklyMuscleBands, type MuscleBand } from "@/lib/strength/session-plan";

/**
 * Data for the lifter Body tab — design_handoff_baseline_ios_strength, screen 2.
 * Everything here is read-only and data-only: numbers vs the person's own
 * history, no coaching copy. Sections are null when their data doesn't exist
 * yet so the cards can show the empty state the README asks for.
 */

/* ---------- soreness (shared with the check-in) ---------- */

/** Tile ids, front then back, as drawn (12 tiles; left/right pairs share a value). */
export const SORE_TILES = [
  { id: "side delts", n: "Side delts", a: "SD" },
  { id: "front delts", n: "Front delts", a: "F DELT" },
  { id: "biceps", n: "Biceps", a: "BI" },
  { id: "chest", n: "Chest", a: "CHEST" },
  { id: "core", n: "Abs", a: "ABS" },
  { id: "quads", n: "Quads", a: "QUADS" },
  { id: "rear delts", n: "Rear delts", a: "RD" },
  { id: "back", n: "Back", a: "BACK" },
  { id: "triceps", n: "Triceps", a: "TRI" },
  { id: "glutes", n: "Glutes", a: "GLUTES" },
  { id: "hamstrings", n: "Hamstrings", a: "HAMS" },
  { id: "calves", n: "Calves", a: "CALVES" },
] as const;
export type SoreTileId = (typeof SORE_TILES)[number]["id"];

/** [tile id, grid-column, span, grid-row, span] — the figure layout from the prototype. */
export const TILES_FRONT: [SoreTileId, number, number, number, number][] = [
  ["side delts", 1, 1, 1, 1], ["front delts", 2, 2, 1, 1], ["side delts", 4, 1, 1, 1],
  ["biceps", 1, 1, 2, 1], ["chest", 2, 2, 2, 1], ["biceps", 4, 1, 2, 1],
  ["core", 2, 2, 3, 1], ["quads", 2, 2, 4, 1],
];
export const TILES_BACK: [SoreTileId, number, number, number, number][] = [
  ["rear delts", 1, 1, 1, 1], ["back", 2, 2, 1, 2], ["rear delts", 4, 1, 1, 1],
  ["triceps", 1, 1, 2, 1], ["triceps", 4, 1, 2, 1],
  ["glutes", 2, 2, 3, 1], ["hamstrings", 2, 2, 4, 1], ["calves", 2, 2, 5, 1],
];

/** SorenessLog keeps the 1–10 scale the rest of the app uses; the lifter map is 0–3. */
export function sorenessToLevel(severity: number): 0 | 1 | 2 | 3 {
  if (severity <= 0) return 0;
  if (severity <= 3) return 1;
  if (severity <= 6) return 2;
  return 3;
}
export function levelToSeverity(level: number): number {
  return [0, 3, 6, 9][Math.max(0, Math.min(3, level))];
}

export interface SorenessMap {
  levels: Record<string, 0 | 1 | 2 | 3>;
  /** Days each tile has been at 2+ (0 when below). */
  streak2: Record<string, number>;
  lastLoggedAt: Date | null;
}

export async function lifterSoreness(): Promise<SorenessMap> {
  const today = getLocalDayStr(await getRequestTz());
  const entries = await getSorenessForDay(today);
  const levels: Record<string, 0 | 1 | 2 | 3> = {};
  const streak2: Record<string, number> = {};
  for (const t of SORE_TILES) { levels[t.id] = 0; streak2[t.id] = 0; }
  for (const e of entries) {
    if (!(e.bodyPart in levels)) continue;
    const lv = sorenessToLevel(e.severity);
    levels[e.bodyPart] = lv;
    streak2[e.bodyPart] = lv >= 2 ? e.streak : 0;
  }
  const last = await prisma.sorenessLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return { levels, streak2, lastLoggedAt: last?.createdAt ?? null };
}

/* ---------- e1RM · 12 weeks ---------- */

export interface LiftTrend {
  name: string;
  /** Weekly best e1RM, oldest → newest, 12 entries, carried forward across empty weeks. */
  series: number[] | null;
  sessions: number;
  empty?: string;
}

const LIFTS: { name: string; re: RegExp }[] = [
  { name: "Bench", re: /^(barbell )?bench press$/i },
  { name: "Squat", re: /^(back |barbell )?squat$/i },
  { name: "Overhead press", re: /^(overhead press|ohp|barbell overhead press)$/i },
  { name: "Deadlift", re: /^(conventional |barbell )?deadlift$/i },
];

export async function liftTrends(): Promise<LiftTrend[]> {
  const since = new Date(Date.now() - 84 * 86400_000);
  const sets = await prisma.workoutSet.findMany({
    where: { isWarmup: false, session: { completedAt: { not: null }, date: { gte: since } } },
    select: { weight: true, reps: true, rir: true, rpe: true, session: { select: { date: true, id: true } }, exercise: { select: { name: true } } },
  });
  return LIFTS.map((l) => {
    const mine = sets.filter((s) => l.re.test(s.exercise.name.trim()));
    const sessions = new Set(mine.map((s) => s.session.id)).size;
    if (sessions < 4) {
      return { name: l.name, series: null, sessions, empty: sessions === 0 ? "Not logged in 12 weeks." : `Logged ${sessions === 1 ? "once" : sessions === 2 ? "twice" : `${sessions} times`} in 12 weeks. A trend needs 4 sessions.` };
    }
    const weekly: (number | null)[] = Array.from({ length: 12 }, () => null);
    for (const s of mine) {
      const w = Math.min(11, Math.floor((s.session.date.getTime() - since.getTime()) / (7 * 86400_000)));
      const rir = s.rir ?? (s.rpe != null ? Math.max(0, 10 - s.rpe) : null);
      const v = e1rm(s.weight, s.reps, rir);
      weekly[w] = Math.max(weekly[w] ?? 0, v);
    }
    // Carry forward so the sparkline has a point per week.
    let last: number | null = null;
    const series = weekly.map((v) => { if (v != null) last = v; return last; });
    const first = series.findIndex((v) => v != null);
    const filled = series.map((v, i) => (v == null ? (series[first] as number) : v)) as number[];
    return { name: l.name, series: filled, sessions };
  });
}

/* ---------- fatigue · Baseline signal ---------- */

export interface FatigueSignal {
  state: "Fresh" | "Building" | "High";
  rhr7: number | null;
  rhrNormal: number | null;
  benchReps: "Up" | "Flat" | "Down" | null;
  benchNote: string;
  sore48: string[];
  inputs: number;
}

/** Resting HR by day from whichever source the person has (Garmin first, then Oura). */
async function restingHrSeries(days: number): Promise<{ day: string; rhr: number }[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const [g, o] = await Promise.all([
    prisma.garminDaily.findMany({ where: { day: { gte: since }, restingHr: { not: null } }, select: { day: true, restingHr: true } }),
    prisma.dailyReadiness.findMany({ where: { day: { gte: since }, restingHeartRate: { not: null } }, select: { day: true, restingHeartRate: true } }),
  ]);
  const by = new Map<string, number>();
  for (const r of o) by.set(r.day.toISOString().slice(0, 10), r.restingHeartRate as number);
  for (const r of g) by.set(r.day.toISOString().slice(0, 10), r.restingHr as number);
  return [...by.entries()].map(([day, rhr]) => ({ day, rhr })).sort((a, b) => a.day.localeCompare(b.day));
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

export async function fatigueSignal(sore: SorenessMap): Promise<FatigueSignal> {
  const rhr = await restingHrSeries(60);
  const cut = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const last7 = rhr.filter((r) => r.day >= cut).map((r) => r.rhr);
  const rhr7 = mean(last7);
  const rhrNormal = rhr.length >= 14 ? mean(rhr.map((r) => r.rhr)) : null;

  // Bench reps at RPE 8 (RIR 2): top set of the last two bench sessions.
  const bench = await prisma.workoutSet.findMany({
    where: { isWarmup: false, exercise: { name: { contains: "bench press", mode: "insensitive" } }, session: { completedAt: { not: null } }, OR: [{ rir: 2 }, { rpe: 8 }] },
    orderBy: { session: { date: "desc" } },
    select: { reps: true, weight: true, session: { select: { id: true } } },
    take: 40,
  });
  const bySession = new Map<string, { reps: number; weight: number }>();
  for (const s of bench) {
    const cur = bySession.get(s.session.id);
    if (!cur || s.weight > cur.weight || (s.weight === cur.weight && s.reps > cur.reps)) bySession.set(s.session.id, { reps: s.reps, weight: s.weight });
  }
  const tops = [...bySession.values()].slice(0, 2);
  let benchReps: FatigueSignal["benchReps"] = null;
  let benchNote = "Needs two bench sessions with a set at RIR 2";
  if (tops.length === 2) {
    const [a, b] = tops; // a = latest
    if (a.weight === b.weight) benchReps = a.reps > b.reps ? "Up" : a.reps < b.reps ? "Down" : "Flat";
    else benchReps = e1rm(a.weight, a.reps, 2) >= e1rm(b.weight, b.reps, 2) ? "Up" : "Down";
    benchNote = "Top set, last 2 sessions";
  }

  const sore48 = SORE_TILES.filter((t) => sore.levels[t.id] >= 2 && sore.streak2[t.id] >= 2).map((t) => t.n);

  let flags = 0, inputs = 0;
  if (rhr7 != null && rhrNormal != null) { inputs++; if (rhr7 - rhrNormal >= 2) flags++; }
  if (benchReps) { inputs++; if (benchReps === "Down") flags++; }
  inputs++; if (sore48.length >= 2) flags++;
  const state: FatigueSignal["state"] = flags === 0 ? "Fresh" : flags === 1 ? "Building" : "High";
  return { state, rhr7, rhrNormal, benchReps, benchNote, sore48, inputs };
}

/* ---------- Garmin context ---------- */

export interface GarminContext {
  day: string;
  bodyBattery: number | null;
  sleepScore: number | null;
  restingHr: number | null;
  rhrNormal: number | null;
}

export async function garminContext(): Promise<GarminContext | null> {
  const latest = await prisma.garminDaily.findFirst({
    where: { OR: [{ bodyBatteryHigh: { not: null } }, { sleepScore: { not: null } }, { restingHr: { not: null } }] },
    orderBy: { day: "desc" },
  });
  if (!latest) return null;
  const rhr = await restingHrSeries(60);
  return {
    day: latest.day.toISOString().slice(0, 10),
    bodyBattery: latest.bodyBatteryHigh,
    sleepScore: latest.sleepScore,
    restingHr: latest.restingHr,
    rhrNormal: rhr.length >= 14 ? mean(rhr.map((r) => r.rhr)) : null,
  };
}

/* ---------- bands + today's plan ---------- */

export interface BandRow extends MuscleBand {
  today: number;
}

export async function bandsWithToday(): Promise<{ rows: BandRow[]; weeksLogged: number }> {
  const bands = await weeklyMuscleBands();
  // Sets planned today = sets already in an open (not finished) session today.
  const dayStart = new Date(Date.now() - 36 * 3600_000);
  const open = await prisma.workoutSet.findMany({
    where: { isWarmup: false, session: { completedAt: null, date: { gte: dayStart } } },
    select: { exercise: { select: { muscleGroup: true } } },
  });
  const today: Record<string, number> = {};
  for (const s of open) today[s.exercise.muscleGroup] = (today[s.exercise.muscleGroup] ?? 0) + 1;
  const firstSession = await prisma.workoutSession.findFirst({ where: { completedAt: { not: null } }, orderBy: { date: "asc" }, select: { date: true } });
  const weeksLogged = firstSession ? Math.min(14, Math.floor((Date.now() - firstSession.date.getTime()) / (7 * 86400_000))) : 0;
  return { rows: bands.map((b) => ({ ...b, today: today[b.id] ?? 0 })), weeksLogged };
}

export interface LifterBodyData {
  bands: BandRow[];
  weeksLogged: number;
  lifts: LiftTrend[];
  soreness: SorenessMap;
  fatigue: FatigueSignal;
  garmin: GarminContext | null;
  weekLabel: string;
}

export async function lifterBodyData(hasGarmin: boolean): Promise<LifterBodyData> {
  const soreness = await lifterSoreness();
  const [{ rows, weeksLogged }, lifts, fatigue, garmin] = await Promise.all([
    bandsWithToday(),
    liftTrends(),
    fatigueSignal(soreness),
    hasGarmin ? garminContext() : Promise.resolve(null),
  ]);
  const end = new Date();
  const start = new Date(end.getTime() - 6 * 86400_000);
  const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const weekLabel = start.getMonth() === end.getMonth() ? `${f(start)}–${end.getDate()}` : `${f(start)} – ${f(end)}`;
  return { bands: rows, weeksLogged, lifts, soreness, fatigue, garmin, weekLabel };
}
