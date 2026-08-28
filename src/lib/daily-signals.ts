import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getLocalDayBounds } from "@/lib/date-utils";

/**
 * Daily signals (daily-signals-plan.md, 2026-08-28: "incorporate all, prune
 * later"). The honest replacements for vendor Readiness/Stress/Resilience:
 * every recipe below is open, every comparison is against HER data, and none
 * of these is an experiment endpoint or a verdict.
 *
 * Live-app pilot versions — the plan doc's full recipes, degraded only where
 * this app's data forces it (documented inline). Regularity (sleep-midpoint
 * drift) is deferred: DailySleep doesn't store bedtimes yet.
 *
 * Everything returns null when its data floor isn't met — an absent line is
 * honest; a guessed line is not.
 */

export interface DailySignals {
  /** #3 sleep debt vs her own median night, trailing 7 nights. */
  sleepDebt: { debtMin: number; needMin: number; nights: number } | null;
  /** #1 revved — sustained daytime HR elevation vs her same-hour baseline. */
  revved: { hours: number; pctAbove: number } | null;
  /** #4 recovery half-life expectation after a recent hard session. */
  recovery: {
    daysSinceHard: number;
    typicalReturnDay: number;
    n: number;
    stillSuppressedTypical: boolean;
  } | null;
  /** #5 Foster monotony/strain over trailing 7 days (open formula). */
  monotony: { monotony: number; strain: number; weeklyLoad: number } | null;
  /** #6 illness combination — exception, not a diagnosis. */
  illness: { tempDev: number; rhrDelta: number } | null;
  /** #2 deviation decomposition for tonight's RHR (cycle component v1). */
  rhrDecomposition: {
    deltaBpm: number;
    cycleBpm: number | null;
    phase: string | null;
    unexplainedBpm: number;
  } | null;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const median = (v: number[]) => {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export async function getDailySignals(dateStr: string, tz: string): Promise<DailySignals> {
  const { start: dayStart, end: dayEnd } = getLocalDayBounds(dateStr, tz);
  const viewDay = new Date(dateStr + "T00:00:00.000Z");

  const [sleeps, readiness, workouts, phaseLogs, weekSets] = await Promise.all([
    prisma.dailySleep.findMany({
      where: { day: { gte: daysAgo(120), lte: viewDay }, totalSleepDuration: { not: null } },
      orderBy: { day: "asc" },
      select: { day: true, totalSleepDuration: true, averageHrv: true, lowestHeartRate: true },
    }),
    prisma.dailyReadiness.findFirst({
      where: { day: viewDay },
      select: { temperatureDeviation: true },
    }),
    prisma.healthKitWorkout.findMany({
      where: { startedAt: { gte: daysAgo(120), lt: dayEnd } },
      select: { startedAt: true, durationSeconds: true, avgHeartRate: true, name: true },
      orderBy: { startedAt: "asc" },
    }),
    prisma.cyclePhaseLog.findMany({
      where: { day: { gte: daysAgo(120), lte: viewDay } },
      select: { day: true, phase: true },
      orderBy: { day: "asc" },
    }),
    prisma.workoutSet.findMany({
      where: { isWarmup: false, rpe: { not: null }, session: { date: { gte: daysAgo(8) } } },
      select: { rpe: true, session: { select: { date: true } } },
    }),
  ]);

  // ---------- #3 Sleep debt (need = her own 60d median night) ----------
  let sleepDebt: DailySignals["sleepDebt"] = null;
  {
    const window = sleeps.filter((s) => s.day >= daysAgo(60));
    const needSec = median(window.map((s) => s.totalSleepDuration!));
    const last7 = sleeps.filter((s) => s.day > daysAgo(8) && s.day <= viewDay);
    if (needSec != null && window.length >= 14 && last7.length >= 3) {
      const debtSec = last7.reduce((sum, s) => sum + Math.max(0, needSec - s.totalSleepDuration!), 0);
      sleepDebt = {
        debtMin: Math.round(debtSec / 60),
        needMin: Math.round(needSec / 60),
        nights: last7.length,
      };
    }
  }

  // ---------- #1 Revved (daytime HR vs same-hour 28d baseline) ----------
  // Hourly means via SQL (raw samples are too many rows to pull). Revved =
  // >=2 consecutive daytime hours (8:00-22:00 viewer time) with mean HR at
  // least 1 SD above her same-hour baseline. Thresholds fixed, not tuned.
  let revved: DailySignals["revved"] = null;
  try {
    const rows = await prisma.$queryRaw<
      { hour: number; day: string; mean_bpm: number }[]
    >(Prisma.sql`
      SELECT EXTRACT(HOUR FROM timestamp AT TIME ZONE ${tz})::int AS hour,
             to_char(timestamp AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
             AVG(bpm)::float AS mean_bpm
      FROM "HeartRateSample"
      WHERE timestamp >= ${daysAgo(28)} AND timestamp < ${dayEnd}
      GROUP BY 1, 2
    `);
    const today = new Map<number, number>();
    const hist = new Map<number, number[]>();
    for (const r of rows) {
      if (r.hour < 8 || r.hour > 21) continue; // daytime only
      if (r.day === dateStr) today.set(r.hour, r.mean_bpm);
      else {
        const a = hist.get(r.hour) ?? [];
        a.push(r.mean_bpm);
        hist.set(r.hour, a);
      }
    }
    let run = 0;
    let best = 0;
    let pctSum = 0;
    let pctN = 0;
    for (let h = 8; h <= 21; h++) {
      const t = today.get(h);
      const base = hist.get(h) ?? [];
      if (t == null || base.length < 10) {
        run = 0;
        continue;
      }
      const mean = base.reduce((a, b) => a + b, 0) / base.length;
      const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / (base.length - 1));
      if (sd > 0 && t >= mean + sd) {
        run++;
        best = Math.max(best, run);
        pctSum += (t - mean) / mean;
        pctN++;
      } else run = 0;
    }
    if (best >= 2) {
      revved = { hours: best, pctAbove: Math.round((pctSum / pctN) * 100) };
    }
  } catch {
    /* raw query unavailable → no revved line */
  }

  // ---------- #4 Recovery half-life (event study on her history) ----------
  let recovery: DailySignals["recovery"] = null;
  {
    const hrvByDay = new Map(sleeps.map((s) => [s.day.toISOString().slice(0, 10), s.averageHrv]));
    const hrvMedian = median(sleeps.map((s) => s.averageHrv).filter((v): v is number => v != null));
    // hard = >=45min with avgHR in her top quartile of workout avgHRs
    const hrs = workouts.map((w) => w.avgHeartRate).filter((v): v is number => v != null).sort((a, b) => a - b);
    const hrQ3 = hrs.length >= 8 ? hrs[Math.floor(hrs.length * 0.75)] : null;
    if (hrvMedian != null && hrQ3 != null) {
      const hard = workouts.filter(
        (w) => w.durationSeconds >= 45 * 60 && w.avgHeartRate != null && w.avgHeartRate >= hrQ3,
      );
      const returnDays: number[] = [];
      for (const w of hard) {
        for (let d = 1; d <= 4; d++) {
          const key = new Date(w.startedAt.getTime() + d * 86_400_000).toISOString().slice(0, 10);
          const hrv = hrvByDay.get(key);
          if (hrv != null && hrv >= hrvMedian) {
            returnDays.push(d);
            break;
          }
          if (d === 4) returnDays.push(5); // didn't return within window
        }
      }
      const typical = median(returnDays);
      if (typical != null && returnDays.length >= 8) {
        // was there a hard session in the last 3 days (before the viewed day)?
        const lastHard = [...hard].reverse().find((w) => w.startedAt < dayStart);
        if (lastHard) {
          const since = Math.floor((dayStart.getTime() - lastHard.startedAt.getTime()) / 86_400_000) + 1;
          if (since <= 3) {
            recovery = {
              daysSinceHard: since,
              typicalReturnDay: Math.round(typical * 10) / 10,
              n: returnDays.length,
              stillSuppressedTypical: since < typical,
            };
          }
        }
      }
    }
  }

  // ---------- #5 Foster monotony/strain (open formula, sRPE or HR proxy) ----------
  let monotony: DailySignals["monotony"] = null;
  {
    // daily load = sum(duration_min * intensity); intensity = mean set RPE
    // that day when logged, else an HR bucket (documented proxy, 1-10).
    const rpeByDay = new Map<string, number[]>();
    for (const s of weekSets) {
      const k = s.session.date.toISOString().slice(0, 10);
      const a = rpeByDay.get(k) ?? [];
      a.push(s.rpe!);
      rpeByDay.set(k, a);
    }
    const hrIntensity = (avg: number | null) =>
      avg == null ? 3 : avg < 110 ? 2 : avg < 130 ? 4 : avg < 150 ? 6 : avg < 170 ? 8 : 9;
    const loadByDay = new Map<string, number>();
    for (let d = 0; d < 7; d++) {
      loadByDay.set(new Date(dayStart.getTime() - d * 86_400_000).toISOString().slice(0, 10), 0);
    }
    for (const w of workouts) {
      const k = w.startedAt.toISOString().slice(0, 10);
      if (!loadByDay.has(k)) continue;
      const rpes = rpeByDay.get(k);
      const intensity = rpes?.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : hrIntensity(w.avgHeartRate);
      loadByDay.set(k, (loadByDay.get(k) ?? 0) + (w.durationSeconds / 60) * intensity);
    }
    const loads = [...loadByDay.values()];
    const trained = loads.filter((l) => l > 0).length;
    if (trained >= 3) {
      const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
      const sd = Math.sqrt(loads.reduce((a, b) => a + (b - mean) ** 2, 0) / (loads.length - 1));
      const m = sd > 0 ? mean / sd : 99;
      monotony = {
        monotony: Math.round(m * 100) / 100,
        weeklyLoad: Math.round(loads.reduce((a, b) => a + b, 0)),
        strain: Math.round(loads.reduce((a, b) => a + b, 0) * m),
      };
    }
  }

  // ---------- #6 Illness combination (Diagnose thresholds, spec §4) ----------
  let illness: DailySignals["illness"] = null;
  {
    const tonight = sleeps.find((s) => s.day.getTime() === viewDay.getTime());
    const rhrMedian = median(
      sleeps.filter((s) => s.day >= daysAgo(60)).map((s) => s.lowestHeartRate).filter((v): v is number => v != null),
    );
    const tempDev = readiness?.temperatureDeviation ?? null;
    if (tonight?.lowestHeartRate != null && rhrMedian != null && tempDev != null) {
      const rhrDelta = tonight.lowestHeartRate - rhrMedian;
      if (rhrDelta >= 2 && tempDev >= 0.3) {
        illness = { tempDev: Math.round(tempDev * 100) / 100, rhrDelta: Math.round(rhrDelta * 10) / 10 };
      }
    }
  }

  // ---------- #2 RHR decomposition (cycle component, v1) ----------
  let rhrDecomposition: DailySignals["rhrDecomposition"] = null;
  {
    const tonight = sleeps.find((s) => s.day.getTime() === viewDay.getTime());
    const all = sleeps.filter((s) => s.lowestHeartRate != null);
    const overall = median(all.map((s) => s.lowestHeartRate!));
    if (tonight?.lowestHeartRate != null && overall != null && all.length >= 30) {
      const delta = tonight.lowestHeartRate - overall;
      if (Math.abs(delta) >= 2) {
        const phaseByDay = new Map(phaseLogs.map((p) => [p.day.toISOString().slice(0, 10), p.phase]));
        const phase = phaseByDay.get(dateStr) ?? null;
        let cycleBpm: number | null = null;
        if (phase) {
          const inPhase = all.filter((s) => phaseByDay.get(s.day.toISOString().slice(0, 10)) === phase);
          if (inPhase.length >= 5) {
            cycleBpm = Math.round((median(inPhase.map((s) => s.lowestHeartRate!))! - overall) * 10) / 10;
          }
        }
        rhrDecomposition = {
          deltaBpm: Math.round(delta * 10) / 10,
          cycleBpm,
          phase,
          unexplainedBpm: Math.round((delta - (cycleBpm ?? 0)) * 10) / 10,
        };
      }
    }
  }

  return { sleepDebt, revved, recovery, monotony, illness, rhrDecomposition };
}
