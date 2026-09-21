import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId, runAsUser } from "@/lib/current-user";
import { getDownsampledHrForWorkout } from "@/lib/workout-notes";
import { volumeZones, classifyVolume, compoundContributions, type VolumeStatus } from "@/lib/training";

/**
 * Data for the desktop dashboard cards added with the Claude Design
 * "desktop grid" handoff (2026-09-21): each workout read against the user's
 * own last 60 days, the strength session + weekly volume, and the run-HR
 * block on Your Baseline.
 *
 * Every block the handoff draws is rendered whenever the user has ANY prior
 * workout of the same kind in the window (Kalysha, 2026-09-21: implement the
 * handoff as drawn — no extra gates). The session count is shown next to the
 * comparison so a thin history reads as thin. Nothing falls back to a
 * population number.
 */

const DAY = 86_400_000;
const WINDOW_DAYS = 60;
const MIN_HISTORY = 1;
const ZONE_HISTORY = 6; // prior workouts whose HR curve we read for zone share
const FLAG_PCT_SLOWER = 15; // run flag threshold (handoff: "far off pace")

export type WorkoutKind = "run" | "strength" | "other";
export type Tone = "ink" | "amber" | "red";

export function workoutKind(name: string): WorkoutKind {
  if (/run/i.test(name)) return "run";
  if (/strength|lift|weights/i.test(name)) return "strength";
  return "other";
}

/** Same five-zone split the workout chart uses (fractions of observed max). */
export function zoneOf(bpm: number, maxHr: number): number {
  const f = bpm / maxHr;
  if (f < 0.6) return 0;
  if (f < 0.7) return 1;
  if (f < 0.8) return 2;
  if (f < 0.9) return 3;
  return 4;
}

export function toKm(distance: number | null | undefined, unit: string | null | undefined): number | null {
  if (distance == null || !(distance > 0)) return null;
  const u = (unit ?? "km").toLowerCase();
  if (u === "m") return distance / 1000;
  if (u === "mi") return distance * 1.609344;
  return distance;
}

export function fmtPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtDur(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};

const inBand = (value: number, usual: number[]) => {
  const s = sd(usual);
  return s === 0 ? value === mean(usual) : Math.abs((value - mean(usual)) / s) < 1;
};

/** In band within 1 SD of her usual, watch within 2, abnormal beyond. */
function toneFor(value: number, usual: number[], badDirection: "high" | "low" | "either"): Tone {
  const s = sd(usual);
  if (s === 0) return "ink";
  const z = (value - mean(usual)) / s;
  const bad = badDirection === "high" ? z : badDirection === "low" ? -z : Math.abs(z);
  return bad >= 2 ? "red" : bad >= 1 ? "amber" : "ink";
}

export interface BaselineStat {
  label: string;
  value: string;
  unit?: string;
  sub: string;
  tone: Tone;
}

export interface WorkoutBaseline {
  n: number; // prior same-kind workouts the comparison rests on
  stats: BaselineStat[];
  /** Runs only: far slower than usual while working at least as hard. */
  flag: { paceStr: string; avgHr: number; pctSlower: number; usualPaceStr: string } | null;
}

interface WorkoutLite {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  avgHeartRate: number | null;
  distance: number | null;
  distanceUnit: string | null;
}

/** Share of a finished workout's HR curve spent in the given zones. Immutable
 *  once the workout is in the past, so cached per user + workout. */
const cachedZoneShare = unstable_cache(
  async (userId: string, startIso: string, endIso: string, maxHr: number, fromZone: number, toZone: number) =>
    runAsUser(userId, async () => {
      const pts = await getDownsampledHrForWorkout(new Date(startIso), new Date(endIso));
      if (pts.length < 2) return null;
      const hit = pts.filter((p) => {
        const z = zoneOf(p.bpm, maxHr);
        return z >= fromZone && z <= toZone;
      }).length;
      return Math.round((hit / pts.length) * 100);
    }),
  ["dd-zone-share-v1"],
  { revalidate: 86_400 },
);

export async function getWorkoutBaseline(
  w: WorkoutLite,
  zoneMaxHr: number | null,
  todayCurve: { bpm: number }[],
): Promise<WorkoutBaseline | null> {
  const kind = workoutKind(w.name);
  const since = new Date(w.startedAt.getTime() - WINDOW_DAYS * DAY);
  const candidates = await prisma.healthKitWorkout.findMany({
    where: { startedAt: { gte: since, lt: w.startedAt } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true, name: true, startedAt: true, endedAt: true, durationSeconds: true,
      avgHeartRate: true, distance: true, distanceUnit: true,
    },
  });
  const prior = candidates.filter((c) =>
    kind === "other" ? c.name === w.name : workoutKind(c.name) === kind,
  );
  if (prior.length < MIN_HISTORY) return null;

  const stats: BaselineStat[] = [];

  // Avg HR
  const hrs = prior.map((p) => p.avgHeartRate).filter((v): v is number => v != null);
  if (w.avgHeartRate != null && hrs.length >= MIN_HISTORY) {
    const usual = Math.round(mean(hrs));
    const d = w.avgHeartRate - usual;
    stats.push({
      label: "Avg HR",
      value: `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}`,
      unit: "bpm",
      sub: `your usual ${usual} bpm`,
      tone: toneFor(w.avgHeartRate, hrs, "high"),
    });
  }

  // Pace (runs with a distance)
  let flag: WorkoutBaseline["flag"] = null;
  const km = toKm(w.distance, w.distanceUnit);
  if (kind === "run" && km) {
    const paces = prior
      .map((p) => {
        const k = toKm(p.distance, p.distanceUnit);
        return k && k >= 1 ? p.durationSeconds / k : null;
      })
      .filter((v): v is number => v != null);
    if (paces.length >= MIN_HISTORY) {
      const pace = w.durationSeconds / km;
      const usual = mean(paces);
      const pct = Math.round(((pace - usual) / usual) * 100);
      const tone = toneFor(pace, paces, "high");
      stats.push({
        label: "Pace",
        value: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`,
        unit: pct > 0 ? "slower" : pct < 0 ? "faster" : undefined,
        sub: `your usual ${fmtPace(usual)}/km`,
        tone,
      });
      // Handoff: the flag fires when a run is far off her usual pace.
      if (pct >= FLAG_PCT_SLOWER && w.avgHeartRate != null) {
        flag = { paceStr: fmtPace(pace), avgHr: w.avgHeartRate, pctSlower: pct, usualPaceStr: fmtPace(usual) };
      }
    }
  }

  // Zone share — Z4+ for runs (how hard), Z1 for strength (how easy)
  if (zoneMaxHr && todayCurve.length > 1 && kind !== "other") {
    const [from, to, label] = kind === "run" ? [3, 4, "Time in Z4+"] as const : [0, 0, "Zone 1 share"] as const;
    const todayPct = Math.round(
      (todayCurve.filter((p) => { const z = zoneOf(p.bpm, zoneMaxHr); return z >= from && z <= to; }).length /
        todayCurve.length) * 100,
    );
    const userId = await getCurrentUserId();
    const shares = (
      await Promise.all(
        prior.slice(0, ZONE_HISTORY).map((p) =>
          cachedZoneShare(userId, p.startedAt.toISOString(), p.endedAt.toISOString(), zoneMaxHr, from, to),
        ),
      )
    ).filter((v): v is number => v != null);
    if (shares.length >= MIN_HISTORY) {
      const usual = Math.round(mean(shares));
      const tone = toneFor(todayPct, shares, kind === "run" ? "high" : "low");
      stats.push({
        label,
        value: `${todayPct}%`,
        sub: `your usual ${usual}%${inBand(todayPct, shares) ? " · in band" : ""}`,
        tone,
      });
    }
  }

  // Duration — fills the third slot when a zone curve isn't available
  if (stats.length < 3) {
    const durs = prior.map((p) => p.durationSeconds);
    const usual = mean(durs);
    const dMin = Math.round((w.durationSeconds - usual) / 60);
    stats.push({
      label: "Duration",
      value: `${dMin > 0 ? "+" : dMin < 0 ? "−" : ""}${Math.abs(dMin)}`,
      unit: "m",
      sub: `your usual ${fmtDur(usual)}`,
      tone: "ink",
    });
  }

  if (stats.length === 0) return null;
  return { n: prior.length, stats: stats.slice(0, 3), flag };
}

// ---------------------------------------------------------------------------
// Strength: what was logged in the app that day + this week's sets per muscle
// ---------------------------------------------------------------------------

export interface StrengthSummary {
  /** "Bench Press 4×8 @ 50 kg" — one entry per exercise, in logged order. */
  exercises: string[];
  weekly: { group: string; sets: number; status: VolumeStatus }[];
}

export async function getStrengthSummary(viewDate: Date, unit: string | null): Promise<StrengthSummary | null> {
  const weekStart = new Date(viewDate);
  const dow = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - (dow - 1));

  const [todaySets, weekSets] = await Promise.all([
    prisma.workoutSet.findMany({
      where: { isWarmup: false, session: { date: viewDate } },
      orderBy: [{ createdAt: "asc" }, { setNumber: "asc" }],
      include: { exercise: { select: { name: true } } },
    }),
    prisma.workoutSet.findMany({
      where: { isWarmup: false, session: { date: { gte: weekStart, lte: viewDate } } },
      include: { exercise: { select: { name: true, muscleGroup: true } } },
    }),
  ]);
  if (todaySets.length === 0) return null;

  const byExercise = new Map<string, { reps: number[]; weight: number }>();
  for (const s of todaySets) {
    const e = byExercise.get(s.exercise.name) ?? { reps: [], weight: 0 };
    e.reps.push(s.reps);
    e.weight = Math.max(e.weight, s.weight);
    byExercise.set(s.exercise.name, e);
  }
  const lb = (unit ?? "lb") === "lb";
  const exercises = [...byExercise.entries()].map(([name, e]) => {
    const sameReps = e.reps.every((r) => r === e.reps[0]);
    const scheme = sameReps ? `${e.reps.length}×${e.reps[0]}` : `${e.reps.length} sets`;
    const load = e.weight > 0 ? ` @ ${Math.round(lb ? e.weight * 2.20462 : e.weight)} ${lb ? "lb" : "kg"}` : "";
    return `${name} ${scheme}${load}`;
  });

  const muscleSets: Record<string, number> = {};
  for (const s of weekSets) {
    const groups = compoundContributions[s.exercise.name] ?? [s.exercise.muscleGroup];
    for (const g of groups) if (volumeZones[g]) muscleSets[g] = (muscleSets[g] ?? 0) + 1;
  }
  const weekly = Object.entries(muscleSets)
    .filter(([, sets]) => sets > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([group, sets]) => ({ group, sets, status: classifyVolume(sets, volumeZones[group]) }));

  return { exercises, weekly };
}

export interface RunDetail {
  splits: number[] | null; // seconds per km
  walkBreakCount: number | null;
  walkBreakSeconds: number | null;
}

export function parseRunDetail(w: {
  splitsJson: string | null;
  walkBreakCount: number | null;
  walkBreakSeconds: number | null;
}): RunDetail | null {
  let splits: number[] | null = null;
  if (w.splitsJson) {
    try {
      const v = JSON.parse(w.splitsJson);
      if (Array.isArray(v) && v.every((x) => typeof x === "number")) splits = v;
    } catch {
      /* malformed → no splits */
    }
  }
  if (!splits && w.walkBreakCount == null) return null;
  return { splits, walkBreakCount: w.walkBreakCount, walkBreakSeconds: w.walkBreakSeconds };
}

export interface RunZones {
  mev: number;
  mav: number;
  mrv: number;
  status: "below_mev" | "at_mev" | "in_mav" | "above_mav" | "at_mrv" | "above_mrv";
}

export function classifyRunVolume(
  km: number,
  p: { runMevKm: number | null; runMavKm: number | null; runMrvKm: number | null } | null,
): RunZones | null {
  if (!p || p.runMevKm == null || p.runMavKm == null || p.runMrvKm == null) return null;
  const status =
    km < p.runMevKm ? "below_mev" : km < p.runMavKm ? "at_mev" : km <= p.runMrvKm ? "in_mav" : "above_mrv";
  return { mev: p.runMevKm, mav: p.runMavKm, mrv: p.runMrvKm, status };
}

/** Run distance logged so far this week (Mon → viewed day), in km. */
export async function getWeeklyRunKm(viewDayEnd: Date, viewDate: Date): Promise<number | null> {
  const weekStart = new Date(viewDate);
  const dow = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - (dow - 1));
  const runs = await prisma.healthKitWorkout.findMany({
    where: { startedAt: { gte: weekStart, lt: viewDayEnd } },
    select: { name: true, distance: true, distanceUnit: true },
  });
  const km = runs
    .filter((r) => workoutKind(r.name) === "run")
    .reduce((a, r) => a + (toKm(r.distance, r.distanceUnit) ?? 0), 0);
  return km > 0 ? Math.round(km * 10) / 10 : null;
}

// ---------------------------------------------------------------------------
// Your Baseline — run heart rate across distances, last 60 days
// ---------------------------------------------------------------------------

export interface RunHrBaseline {
  avgHr: number;
  nRuns: number;
  minKm: number;
  maxKm: number;
  bands: { label: string; avgHr: number; n: number }[];
  /** HR barely moves with distance (band spread ≤ 6 bpm, or one band). */
  flat: boolean;
  /** Average run HR sits above her Z2 ceiling (0.7 × observed max). */
  aboveZ2: boolean;
}

export async function getRunHrBaseline(viewDayEnd: Date, zoneMaxHr: number | null): Promise<RunHrBaseline | null> {
  const since = new Date(viewDayEnd.getTime() - WINDOW_DAYS * DAY);
  const rows = await prisma.healthKitWorkout.findMany({
    where: { startedAt: { gte: since, lt: viewDayEnd }, avgHeartRate: { not: null } },
    select: { name: true, avgHeartRate: true, distance: true, distanceUnit: true },
  });
  const runs = rows
    .filter((r) => workoutKind(r.name) === "run")
    .map((r) => ({ hr: r.avgHeartRate as number, km: toKm(r.distance, r.distanceUnit) }))
    .filter((r): r is { hr: number; km: number } => r.km != null && r.km >= 1);
  if (runs.length < 2) return null;

  const defs: [string, (k: number) => boolean][] = [
    ["under 5 km", (k) => k < 5],
    ["5–10 km", (k) => k >= 5 && k < 10],
    ["over 10 km", (k) => k >= 10],
  ];
  const bands = defs
    .map(([label, test]) => {
      const inBand = runs.filter((r) => test(r.km));
      return { label, n: inBand.length, avgHr: inBand.length ? Math.round(mean(inBand.map((r) => r.hr))) : 0 };
    })
    .filter((b) => b.n > 0);

  const avgHr = Math.round(mean(runs.map((r) => r.hr)));
  const spread = bands.length >= 2 ? Math.max(...bands.map((b) => b.avgHr)) - Math.min(...bands.map((b) => b.avgHr)) : null;
  const z2Ceiling = zoneMaxHr ? zoneMaxHr * 0.7 : null;
  return {
    avgHr,
    nRuns: runs.length,
    minKm: Math.round(Math.min(...runs.map((r) => r.km))),
    maxKm: Math.round(Math.max(...runs.map((r) => r.km))),
    bands,
    flat: spread == null || spread <= 6,
    aboveZ2: z2Ceiling != null && avgHr > z2Ceiling,
  };
}
