import { prisma } from "./db";

export interface BaselineScore {
  overall: number;
  color: "green" | "yellow" | "red";
  label: string;
  components: {
    readiness: { value: number | null; weight: number; weighted: number };
    hrvTrend: { value: number | null; weight: number; weighted: number };
    sleepQuality: { value: number | null; weight: number; weighted: number };
    tempDeviation: { value: number | null; weight: number; weighted: number };
  };
}

export interface DaySnapshot {
  day: string;
  readinessScore: number | null;
  sleepScore: number | null;
  averageHrv: number | null;
  deepSleep: number | null;
  remSleep: number | null;
  tempDeviation: number | null;
  stressSummary: string | null;
  baselineScore: number | null;
  baselineColor: "green" | "yellow" | "red";
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// HRV trend: compare 3-day rolling average to 14-day baseline
// Returns 0-100 where 100 = 3-day avg is well above baseline
function hrvTrendScore(
  threeDay: number | null,
  fourteenDay: number | null
): number | null {
  if (threeDay == null || fourteenDay == null || fourteenDay === 0) return null;
  const ratio = threeDay / fourteenDay;
  // ratio 1.0 = on baseline (score 70), 1.1+ = above (score 90+), 0.8 = below (score 40)
  const score = 70 + (ratio - 1.0) * 200;
  return clamp(Math.round(score), 0, 100);
}

// Sleep quality: normalize (deep + REM) duration
// Target: ~2h deep + ~2h REM = 4h combined = 14400s
function sleepQualityScore(
  deepSeconds: number | null,
  remSeconds: number | null
): number | null {
  if (deepSeconds == null && remSeconds == null) return null;
  const total = (deepSeconds ?? 0) + (remSeconds ?? 0);
  const targetSeconds = 14400; // 4 hours
  const ratio = total / targetSeconds;
  const score = ratio * 80; // 100% of target = 80 score, 125% = 100
  return clamp(Math.round(score), 0, 100);
}

// Temp deviation: closer to 0 is better, larger deviations reduce score
// Cycle-phase-aware: luteal phase naturally elevates temp by ~0.3-0.5°C,
// so we offset the deviation before scoring to avoid penalizing normal physiology
function tempDeviationScore(deviation: number | null, cyclePhase: string | null): number | null {
  if (deviation == null) return null;
  let adjusted = deviation;
  if (cyclePhase === "luteal") {
    // Luteal phase: +0.3-0.5°C is expected. Shift baseline so 0.4°C reads as ~0
    adjusted = deviation - 0.4;
  } else if (cyclePhase === "ovulation") {
    // Ovulation: slight elevation is normal
    adjusted = deviation - 0.15;
  }
  const absDev = Math.abs(adjusted);
  // 0°C deviation = 90 score, ±0.5°C = 60, ±1.0°C = 30
  const score = 90 - absDev * 60;
  return clamp(Math.round(score), 0, 100);
}

export function computeBaselineScore(
  readinessScore: number | null,
  hrvThreeDay: number | null,
  hrvFourteenDay: number | null,
  deepSleep: number | null,
  remSleep: number | null,
  tempDev: number | null,
  cyclePhase?: string | null
): BaselineScore {
  const hrv = hrvTrendScore(hrvThreeDay, hrvFourteenDay);
  const sleep = sleepQualityScore(deepSleep, remSleep);
  // Bug 5 fix: cycle-phase-aware temp scoring — don't penalize normal luteal elevation
  const temp = tempDeviationScore(tempDev, cyclePhase ?? null);

  // Bug 4 fix: redistribute weights when components are null instead of scoring them as 0
  const rawComponents = [
    { key: "readiness" as const, value: readinessScore, baseWeight: 0.4 },
    { key: "hrvTrend" as const, value: hrv, baseWeight: 0.25 },
    { key: "sleepQuality" as const, value: sleep, baseWeight: 0.2 },
    { key: "tempDeviation" as const, value: temp, baseWeight: 0.15 },
  ];

  const availableWeight = rawComponents
    .filter((c) => c.value != null)
    .reduce((sum, c) => sum + c.baseWeight, 0);

  const scale = availableWeight > 0 ? 1 / availableWeight : 0;

  const components = {
    readiness: {
      value: readinessScore,
      weight: readinessScore != null ? 0.4 * scale : 0,
      weighted: readinessScore != null ? readinessScore * 0.4 * scale : 0,
    },
    hrvTrend: {
      value: hrv,
      weight: hrv != null ? 0.25 * scale : 0,
      weighted: hrv != null ? hrv * 0.25 * scale : 0,
    },
    sleepQuality: {
      value: sleep,
      weight: sleep != null ? 0.2 * scale : 0,
      weighted: sleep != null ? sleep * 0.2 * scale : 0,
    },
    tempDeviation: {
      value: temp,
      weight: temp != null ? 0.15 * scale : 0,
      weighted: temp != null ? temp * 0.15 * scale : 0,
    },
  };

  const overall = availableWeight > 0
    ? Math.round(
        components.readiness.weighted +
          components.hrvTrend.weighted +
          components.sleepQuality.weighted +
          components.tempDeviation.weighted
      )
    : 0;

  let color: "green" | "yellow" | "red";
  let label: string;
  if (overall >= 80) {
    color = "green";
    label = "Go Hard";
  } else if (overall >= 60) {
    color = "yellow";
    label = "Moderate";
  } else {
    color = "red";
    label = "Recover";
  }

  return { overall, color, label, components };
}

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function utcDaysAgo(from: Date, n: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export async function getTodayScore(): Promise<BaselineScore | null> {
  const today = utcToday();

  const readiness = await prisma.dailyReadiness.findUnique({
    where: { day: today },
  });

  if (!readiness) return null;

  // Get sleep data — today if complete, otherwise most recent with HRV data
  const sleep =
    await prisma.dailySleep.findFirst({
      where: { day: { lte: today }, averageHrv: { not: null } },
      orderBy: { day: "desc" },
    }) ??
    await prisma.dailySleep.findUnique({ where: { day: today } });

  // 3-day HRV average
  const threeDaysAgo = utcDaysAgo(today, 3);
  const recentSleep = await prisma.dailySleep.findMany({
    where: { day: { gte: threeDaysAgo, lte: today } },
    select: { averageHrv: true },
  });
  const hrvValues = recentSleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const hrvThreeDay =
    hrvValues.length > 0
      ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
      : null;

  // 14-day HRV baseline
  const fourteenDaysAgo = utcDaysAgo(today, 14);
  const baselineSleep = await prisma.dailySleep.findMany({
    where: { day: { gte: fourteenDaysAgo, lte: today } },
    select: { averageHrv: true },
  });
  const baselineHrv = baselineSleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const hrvFourteenDay =
    baselineHrv.length > 0
      ? baselineHrv.reduce((a, b) => a + b, 0) / baselineHrv.length
      : null;

  // Get current cycle phase for temp deviation adjustment
  const phaseLog = await prisma.cyclePhaseLog.findFirst({
    where: { day: { lte: today } },
    orderBy: { day: "desc" },
  });

  return computeBaselineScore(
    readiness.score,
    hrvThreeDay,
    hrvFourteenDay,
    sleep?.deepSleepDuration ?? null,
    sleep?.remSleepDuration ?? null,
    readiness.temperatureDeviation,
    phaseLog?.phase
  );
}

export async function getWeekSnapshots(): Promise<DaySnapshot[]> {
  const today = utcToday();
  const sevenDaysAgo = utcDaysAgo(today, 7);

  const [readinessData, sleepData, stressData] = await Promise.all([
    prisma.dailyReadiness.findMany({
      where: { day: { gte: sevenDaysAgo, lte: today } },
      orderBy: { day: "asc" },
    }),
    prisma.dailySleep.findMany({
      where: { day: { gte: sevenDaysAgo, lte: today } },
      orderBy: { day: "asc" },
    }),
    prisma.dailyStress.findMany({
      where: { day: { gte: sevenDaysAgo, lte: today } },
      orderBy: { day: "asc" },
    }),
  ]);

  // Get 14-day HRV baseline for trend scoring
  const fourteenDaysAgo = utcDaysAgo(today, 14);
  const allSleep = await prisma.dailySleep.findMany({
    where: { day: { gte: fourteenDaysAgo, lte: today } },
    orderBy: { day: "asc" },
  });
  const allHrvValues = allSleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const hrvBaseline =
    allHrvValues.length > 0
      ? allHrvValues.reduce((a, b) => a + b, 0) / allHrvValues.length
      : null;

  const sleepByDay = new Map(
    sleepData.map((s) => [s.day.toISOString().split("T")[0], s])
  );
  const stressByDay = new Map(
    stressData.map((s) => [s.day.toISOString().split("T")[0], s])
  );

  return readinessData.map((r) => {
    const dayStr = r.day.toISOString().split("T")[0];
    const sleep = sleepByDay.get(dayStr);
    const stress = stressByDay.get(dayStr);

    // Simple 3-day rolling HRV (use available data up to this day)
    const dayIndex = allSleep.findIndex(
      (s) => s.day.toISOString().split("T")[0] === dayStr
    );
    const recentSlice = allSleep.slice(Math.max(0, dayIndex - 2), dayIndex + 1);
    const recentHrvValues = recentSlice
      .map((s) => s.averageHrv)
      .filter((v): v is number => v != null);
    const hrvThreeDay =
      recentHrvValues.length > 0
        ? recentHrvValues.reduce((a, b) => a + b, 0) / recentHrvValues.length
        : null;

    const score = computeBaselineScore(
      r.score,
      hrvThreeDay,
      hrvBaseline,
      sleep?.deepSleepDuration ?? null,
      sleep?.remSleepDuration ?? null,
      r.temperatureDeviation
    );

    return {
      day: dayStr,
      readinessScore: r.score,
      sleepScore: sleep?.score ?? null,
      averageHrv: sleep?.averageHrv ?? null,
      deepSleep: sleep?.deepSleepDuration ?? null,
      remSleep: sleep?.remSleepDuration ?? null,
      tempDeviation: r.temperatureDeviation ?? null,
      stressSummary: stress?.daySummary ?? null,
      baselineScore: score.overall,
      baselineColor: score.color,
    };
  });
}
