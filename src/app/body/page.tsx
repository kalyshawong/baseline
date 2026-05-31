import Link from "next/link";
import { prisma } from "@/lib/db";
import { getLocalDay } from "@/lib/date-utils";
import { getScoreForDate } from "@/lib/baseline-score";
import {
  cyclePhaseGuidance,
  compoundContributions,
  volumeZones,
  hrvCV,
  rollingHrvCvBaseline,
  isHrvCvElevated,
  hrvCvThreshold,
  estimate1RM,
  ffmFromBodyComposition,
  energyAvailability as computeEA,
  computeFatigueScore,
  computeTrainingCall,
  detectRpeCreep,
} from "@/lib/training";
import { getHrvBaselineChoice } from "@/lib/training-call";
import { ReadinessTierCard } from "@/components/body/readiness-tier-card";
import { VolumeZones } from "@/components/body/volume-zones";
import { CyclePhaseGuidanceCard } from "@/components/body/cycle-phase-guidance-card";
import { CyclePhaseSelector } from "@/components/dashboard/cycle-phase-selector";
import { RecoverySignalsRow } from "@/components/body/recovery-signals-row";
import { NutritionCheck } from "@/components/body/nutrition-check";
import { TrendsCharts } from "@/components/body/trends-charts";
import { WeightCard } from "@/components/weight/weight-card";
import { WeightTrendChart } from "@/components/weight/weight-trend-chart";
import { TdeeCard } from "@/components/weight/tdee-card";
import { RunningMetricsCard } from "@/components/body/running-metrics-card";
import { HyroxSummaryCard } from "@/components/hyrox-summary-card";
import {
  totalDailyEnergyExpenditure,
  goalCalories,
  weightTrendDirection,
  movingAverage,
} from "@/lib/tdee";
import { DateNav } from "@/components/date-nav";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export const dynamic = "force-dynamic";

export default async function BodyPage() {
  const localToday = getLocalDay();

  // Week window (Monday-Sunday)
  const weekStart = new Date(localToday);
  const dayOfWeek = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - (dayOfWeek - 1));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    score,
    phaseLog,
    weekSets,
    recentSessions,
    profile,
    recentSleep,
    todayNutrition,
    allRecentSets,
    weightLogs,
    todayRunning,
    latestVO2Max,
    todaySleep,
    sleepTimeRec,
  ] = await Promise.all([
    getScoreForDate(localToday),
    (async () => {
      const { resolveCyclePhase } = await import("@/lib/cycle-phase");
      return resolveCyclePhase(localToday);
    })(),
    prisma.workoutSet.findMany({
      where: { isWarmup: false, session: { date: { gte: weekStart } } },
      include: { exercise: true },
    }),
    prisma.workoutSession.findMany({
      orderBy: { date: "desc" },
      take: 5,
      include: {
        sets: {
          where: { isWarmup: false },
          include: { exercise: { select: { name: true, muscleGroup: true } } },
        },
      },
    }),
    prisma.userProfile.findUnique({ where: { id: 1 } }),
    prisma.dailySleep.findMany({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
      take: 14,
    }),
    prisma.nutritionLog.findUnique({
      where: { day: localToday },
      include: { entries: true },
    }),
    prisma.workoutSet.findMany({
      where: { isWarmup: false, rpe: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { exercise: { select: { name: true } }, session: { select: { date: true } } },
    }),
    prisma.weightLog.findMany({
      where: { day: { gte: thirtyDaysAgo } },
      orderBy: { day: "asc" },
    }),
    prisma.dailyRunningMetrics.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),
    prisma.dailyVO2Max.findFirst({ orderBy: { day: "desc" } }),
    prisma.dailySleep.findFirst({
      where: { day: localToday },
    }),
    prisma.sleepTimeRecommendation.findFirst({ orderBy: { day: "desc" } }),
  ]);

  const [dayStress, daySpO2, dayResilience] = await Promise.all([
    prisma.dailyStress.findUnique({ where: { day: localToday } }),
    prisma.dailySpO2.findUnique({ where: { day: localToday } }),
    prisma.dailyResilience.findUnique({ where: { day: localToday } }),
  ]);

  const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1] : null;
  const weightKg = latestWeight?.weightKg ?? profile?.bodyWeightKg ?? null;
  const latestBodyFat = latestWeight?.bodyFatPct ?? profile?.bodyFatPct ?? null;
  const unit = (profile?.unit ?? "lb") as "lb" | "kg";
  const weightTrend = weightTrendDirection(
    weightLogs.map((l) => ({ day: l.day, weightKg: l.weightKg }))
  );

  const guidance = cyclePhaseGuidance(phaseLog.phase);

  const tdee = weightKg && profile
    ? totalDailyEnergyExpenditure({
        weightKg,
        heightCm: profile.heightCm,
        age: profile.age,
        sex: profile.sex,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
        targetWeightKg: profile.targetWeightKg,
      })
    : null;
  const goalCals = tdee ? goalCalories(tdee, profile?.goal ?? "maintain") : null;

  const weightChartData = movingAverage(
    weightLogs.map((l) => ({
      date: l.day.toISOString().split("T")[0],
      weight: l.weightKg,
    }))
  ).map((p) => ({
    date: p.date,
    weightKg: p.weight,
    avg: p.avg,
  }));

  // --- Compute weekly sets per muscle group ---
  const muscleSets: Record<string, number> = {};
  for (const group of Object.keys(volumeZones)) muscleSets[group] = 0;

  for (const set of weekSets) {
    const contributions = compoundContributions[set.exercise.name] ?? [set.exercise.muscleGroup];
    for (const mg of contributions) {
      if (muscleSets[mg] !== undefined) muscleSets[mg] += 1;
    }
  }

  const weeklyVolumeData = Object.entries(muscleSets).map(([muscleGroup, sets]) => ({
    muscleGroup,
    sets,
  }));

  // --- Personal records ---
  const prs = await prisma.workoutSet.findMany({
    where: { isPR: true, isWarmup: false },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { exercise: { select: { name: true } } },
  });

  // --- HRV CV ---
  const hrvValues = recentSleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const cv = hrvCV(hrvValues.slice(0, 7));

  const hrvBaselineSleep = await prisma.dailySleep.findMany({
    where: { day: { lte: localToday }, averageHrv: { not: null } },
    orderBy: { day: "desc" },
    take: 60,
    select: { averageHrv: true },
  });
  const personalHrvBaseline = rollingHrvCvBaseline(
    hrvBaselineSleep
      .map((s) => s.averageHrv)
      .filter((v): v is number => v != null)
  );
  const hrvChoice = await getHrvBaselineChoice();
  const hrvCvBaseline = hrvChoice === "standard" ? null : personalHrvBaseline;
  const hrvCvElevated = isHrvCvElevated(cv, hrvCvBaseline);

  // --- Fatigue score ---
  const volumeApproachingMRV = Object.entries(muscleSets).some(
    ([group, sets]) => sets >= volumeZones[group].mrv * 0.9
  );

  const exerciseSetCounts = new Map<string, typeof allRecentSets>();
  for (const s of allRecentSets) {
    const list = exerciseSetCounts.get(s.exercise.name) ?? [];
    list.push(s);
    exerciseSetCounts.set(s.exercise.name, list);
  }
  let anyRpeCreep = false;
  for (const [, exSets] of exerciseSetCounts) {
    if (exSets.length < 3) continue;
    const crept = detectRpeCreep(
      exSets.map((s) => ({ weight: s.weight, rpe: s.rpe, date: s.session.date }))
    );
    if (crept) {
      anyRpeCreep = true;
      break;
    }
  }

  const hrvMean = hrvValues.length >= 5
    ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
    : null;
  const hrvStdDev = hrvMean != null && hrvValues.length >= 5
    ? Math.sqrt(hrvValues.reduce((s, v) => s + (v - hrvMean) ** 2, 0) / (hrvValues.length - 1))
    : null;
  const recentHrv2 = hrvValues.slice(0, 2);
  const hrvBelowBaseline = hrvMean != null && hrvStdDev != null && recentHrv2.length === 2
    && recentHrv2.every((v) => v < hrvMean - hrvStdDev);

  const lowestHRValues = recentSleep
    .map((s) => s.lowestHeartRate)
    .filter((v): v is number => v != null);
  const rhrMean = lowestHRValues.length >= 5
    ? lowestHRValues.reduce((a, b) => a + b, 0) / lowestHRValues.length
    : null;
  const rhrElevated = rhrMean != null && lowestHRValues.slice(0, 3).length === 3
    && lowestHRValues.slice(0, 3).every((v) => v > rhrMean + 5);

  // Weeks since last deload
  const allSessions = await prisma.workoutSession.findMany({
    where: { completedAt: { not: null } },
    orderBy: { date: "desc" },
    select: { date: true },
    take: 60,
  });
  let weeksSinceDeload = 0;
  if (allSessions.length > 0) {
    const weekSet = new Set<string>();
    for (const s of allSessions) {
      const d = s.date;
      const dow = d.getUTCDay() || 7;
      const ws = new Date(d);
      ws.setUTCDate(d.getUTCDate() - (dow - 1));
      weekSet.add(ws.toISOString().split("T")[0]);
    }
    const sortedWeeks = Array.from(weekSet).sort().reverse();
    for (let i = 0; i < sortedWeeks.length; i++) {
      if (i === 0) { weeksSinceDeload++; continue; }
      const prev = new Date(sortedWeeks[i - 1] + "T00:00:00Z");
      const curr = new Date(sortedWeeks[i] + "T00:00:00Z");
      const diff = (prev.getTime() - curr.getTime()) / (7 * 24 * 3600 * 1000);
      if (Math.abs(diff - 1) < 0.5) weeksSinceDeload++;
      else break;
    }
  }

  const fatigue = computeFatigueScore({
    weeksSinceLastDeload: weeksSinceDeload,
    hrvBelowBaseline,
    hrvCvElevated,
    sleepQualityDecline: recentSleep
      .slice(0, 3)
      .every((s) => (s.score ?? 100) < 70),
    rhrElevated,
    rpeCreep: anyRpeCreep,
    volumeApproachingMRV,
  });

  const trainingCall = computeTrainingCall({
    baselineScore: score?.overall ?? null,
    cyclePhase: phaseLog.phase,
    hrvCv: cv,
    hrvCvBaseline,
    fatigueScore: fatigue.score,
    stressSummary: dayStress?.daySummary ?? null,
  });

  // --- Nutrition data ---
  const perMealProtein = new Map<string, number>();
  for (const entry of todayNutrition?.entries ?? []) {
    const mt = entry.mealType;
    perMealProtein.set(mt, (perMealProtein.get(mt) ?? 0) + entry.protein);
  }

  const ffm = weightKg && latestBodyFat
    ? ffmFromBodyComposition(weightKg, latestBodyFat)
    : null;

  const weekVolume = weekSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  const todaysExerciseCal = weekVolume * 0.06 / 7;

  const eaValue = ffm && todayNutrition
    ? computeEA(todayNutrition.calories, todaysExerciseCal, ffm)
    : null;

  return (
    <div>
      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-center justify-between" style={{ paddingTop: "26px" }}>
        <div>
          <h1 className="disp text-[46px] leading-[0.9] tracking-[0.02em] whitespace-nowrap">BODY</h1>
          <p className="mt-[3px] text-sm font-medium text-[var(--color-text-muted)]">
            Training readiness, recovery &amp; composition
          </p>
        </div>
        <DateNav basePath="/body" />
      </div>

      {/* ─── HYROX STRIP ─── */}
      <div className="mt-6">
        <HyroxSummaryCard />
      </div>

      {/* ─── READINESS HERO BAND ─── */}
      <div className="mt-6">
        <ReadinessTierCard
          call={trainingCall}
          baselineScore={score?.overall ?? null}
          hrvCv={cv}
          hrvCvElevated={hrvCvElevated}
        />
      </div>

      {/* ─── RECOVERY SIGNALS ─── */}
      <SectionLabel>Recovery Signals</SectionLabel>
      <div className="mt-6">
        <RecoverySignalsRow
          hrv={todaySleep?.averageHrv ?? null}
          stress={
            dayStress
              ? {
                  daySummary: dayStress.daySummary ?? null,
                  stressHigh: dayStress.stressHigh ?? null,
                  recoveryHigh: dayStress.recoveryHigh ?? null,
                }
              : null
          }
          spO2={daySpO2?.avgSpO2 ?? null}
          resilience={
            dayResilience
              ? {
                  level: dayResilience.level ?? null,
                  sleepRecovery: dayResilience.sleepRecovery ?? null,
                  daytimeRecovery: dayResilience.daytimeRecovery ?? null,
                  stress: dayResilience.stress ?? null,
                }
              : null
          }
        />
      </div>

      {/* ─── CYCLE + FATIGUE ─── */}
      <div className="mt-[14px] grid grid-cols-2 gap-[14px] items-stretch">
        {/* Left: Cycle Phase */}
        <div className="flex flex-col gap-[14px]">
          {guidance && <CyclePhaseGuidanceCard guidance={guidance} />}
          <CyclePhaseSelector currentPhase={phaseLog.phase} />
        </div>

        {/* Right: Fatigue Signal */}
        <div>
          {fatigue.score > 0 ? (
            <div
              className="h-full p-[20px_24px]"
              style={{
                background: "color-mix(in oklch, var(--color-yellow), var(--color-surface) 88%)",
                border: "1px solid color-mix(in oklch, var(--color-yellow), transparent 60%)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="ov">
                    Fatigue Signal <span className="normal-case tracking-normal">(Pritchard 2024)</span>
                  </p>
                  <p className="mt-1 text-[15px] font-bold">{fatigue.recommendation}</p>
                </div>
                <div className="text-right flex-none">
                  <span className="disp text-[48px] leading-[0.8] num" style={{ color: "var(--color-yellow)" }}>
                    {fatigue.score}
                  </span>
                  <p className="text-[10px] text-[var(--color-faint)] mt-[2px]">/8 composite</p>
                </div>
              </div>
              <ul className="mt-[14px] flex flex-col gap-[5px] list-none">
                {weeksSinceDeload >= 5 && (
                  <li className="text-[12.5px]" style={{ color: "var(--color-yellow)" }}>
                    {weeksSinceDeload} consecutive training weeks (deload every 5-6)
                  </li>
                )}
                {hrvCvElevated && (
                  <li className="text-[12.5px]" style={{ color: "var(--color-yellow)" }}>
                    HRV CV elevated: {cv?.toFixed(1)}%
                    {hrvCvBaseline
                      ? ` (your normal ~${Math.round(hrvCvThreshold(hrvCvBaseline))}%)`
                      : " (Flatt threshold 10%)"}
                  </li>
                )}
                {anyRpeCreep && (
                  <li className="text-[12.5px] font-semibold" style={{ color: "var(--color-red)" }}>
                    RPE creep: +1 pt at same loads over recent sessions
                  </li>
                )}
                {volumeApproachingMRV && (
                  <li className="text-[12.5px]" style={{ color: "var(--color-yellow)" }}>
                    Volume approaching MRV in 1+ muscle groups
                  </li>
                )}
              </ul>
              {fatigue.score >= 3 && (
                <div className="mt-[14px] bg-[var(--color-surface-2)] p-[12px_14px] text-[12.5px] text-[var(--color-text-muted)] leading-relaxed">
                  <b className="text-[var(--color-text)]">Deload protocol:</b> Reduce volume 40-60% for 1 week. Keep frequency &amp; loads, fewer sets. Resume after 7 days.
                </div>
              )}
            </div>
          ) : (
            <div className="panel h-full flex items-center justify-center">
              <p className="text-xs text-[var(--color-text-muted)]">No fatigue signals detected</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── RUNNING & CARDIO ─── */}
      <SectionLabel>Running &amp; Cardio</SectionLabel>
      <div className="mt-6">
        <RunningMetricsCard
          metrics={todayRunning ? {
            runningSpeed: todayRunning.runningSpeed,
            runningPower: todayRunning.runningPower,
            groundContactTime: todayRunning.groundContactTime,
            verticalOscillation: todayRunning.verticalOscillation,
            strideLength: todayRunning.strideLength,
            cardioRecovery: todayRunning.cardioRecovery,
            walkingRunningDistance: todayRunning.walkingRunningDistance,
            respiratoryRate: todayRunning.respiratoryRate,
            physicalEffort: todayRunning.physicalEffort,
          } : null}
          vo2Max={latestVO2Max?.vo2Max ?? null}
          vo2MaxDate={latestVO2Max?.day
            ? `Updated ${latestVO2Max.day.toLocaleDateString()}`
            : null}
        />
      </div>

      {/* ─── STRENGTH TRAINING ─── */}
      <SectionLabel>Strength Training</SectionLabel>
      <div className="mt-6">
        <div className="flex items-center gap-[14px] mb-[14px]">
          <Link href="/body/workout/new" className="btn">
            + Add Workout
          </Link>
          <Link href="/body/workout/new?backfill=1" className="linklike">
            Log past workout
          </Link>
        </div>

        {/* Two-column: VolumeZones left (1.5fr), PRs + Workouts right (1fr) */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-[14px] items-stretch">
          <VolumeZones data={weeklyVolumeData} />

          <div className="flex flex-col gap-[14px] h-full justify-between">
            {/* Recent PRs */}
            {prs.length > 0 && (
              <div className="panel p-[22px_24px]">
                <p className="ov mb-[14px]">Recent PRs</p>
                {prs.map((pr) => (
                  <div
                    key={pr.id}
                    className="flex items-center justify-between bg-[var(--color-surface-2)] px-[14px] py-[11px] text-[13px]"
                    style={{ marginTop: prs.indexOf(pr) > 0 ? "7px" : 0 }}
                  >
                    <div>
                      <p className="font-semibold">{pr.exercise.name}</p>
                      <p className="text-[11.5px] text-[var(--color-faint)] mt-[2px]">
                        {pr.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <div className="text-right num">
                      <p className="disp text-[20px] tracking-[0.02em]">
                        {pr.weight} &times; {pr.reps}
                      </p>
                      <p className="text-[11px] text-[var(--color-faint)]">
                        e1RM {Math.round(estimate1RM(pr.weight, pr.reps))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Workouts */}
            <div className="panel p-[22px_24px]">
              <p className="ov mb-[14px]">Recent Workouts</p>
              {recentSessions.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  No workouts logged yet.{" "}
                  <Link href="/body/workout/new" className="underline hover:text-white">
                    Start your first session
                  </Link>
                  .
                </p>
              ) : (
                recentSessions.map((session, i) => (
                  <Link
                    key={session.id}
                    href={`/body/workout/${session.id}`}
                    className="flex items-center justify-between bg-[var(--color-surface-2)] px-[14px] py-[11px] text-[13px] hover:bg-white/10"
                    style={{ marginTop: i > 0 ? "7px" : 0 }}
                  >
                    <div>
                      <p className="font-semibold">{session.templateName ?? "Freestyle"}</p>
                      <p className="text-[11.5px] text-[var(--color-faint)] mt-[2px]">
                        {session.date.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                        {" · "}{session.sets.length} sets
                        {session.completedAt && session.sessionVolume != null && (
                          <> · {Math.round(session.sessionVolume).toLocaleString()} vol</>
                        )}
                      </p>
                    </div>
                    {session.completedAt ? (
                      <span
                        className="text-[10px] font-bold uppercase px-[9px] py-[3px] rounded-full"
                        style={{
                          background: "color-mix(in oklch, var(--color-green), transparent 80%)",
                          color: "var(--color-green)",
                        }}
                      >
                        done
                      </span>
                    ) : (
                      <span
                        className="text-[10px] font-bold uppercase px-[9px] py-[3px] rounded-full"
                        style={{
                          background: "color-mix(in oklch, var(--color-yellow), transparent 80%)",
                          color: "var(--color-yellow)",
                        }}
                      >
                        active
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── RECOVERY ─── */}
      <SectionLabel>Recovery</SectionLabel>
      <div className="mt-6 grid grid-cols-2 gap-[14px] items-stretch">
        {/* Sleep Breakdown */}
        {todaySleep ? (
          <div className="panel p-[22px_24px]">
            <p className="ov">Sleep Breakdown</p>
            <div
              className="grid grid-cols-3 mt-[6px]"
              style={{ gap: "1px", background: "var(--color-border)" }}
            >
              <div className="bg-[var(--color-surface)] p-4 text-center">
                <p className="disp text-[38px] leading-[0.85] num" style={{ color: "var(--color-blue)" }}>
                  {formatDuration(todaySleep.deepSleepDuration)}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-faint)] mt-[5px]">
                  Deep
                </p>
              </div>
              <div className="bg-[var(--color-surface)] p-4 text-center">
                <p className="disp text-[38px] leading-[0.85] num" style={{ color: "var(--color-gold)" }}>
                  {formatDuration(todaySleep.remSleepDuration)}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-faint)] mt-[5px]">
                  REM
                </p>
              </div>
              <div className="bg-[var(--color-surface)] p-4 text-center">
                <p className="disp text-[38px] leading-[0.85] num">
                  {formatDuration(todaySleep.lightSleepDuration)}
                </p>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-faint)] mt-[5px]">
                  Light
                </p>
              </div>
            </div>
            {todaySleep.lowestHeartRate && (
              <p className="mt-3 text-center text-[12.5px] text-[var(--color-faint)]">
                Lowest HR: <b className="text-[var(--color-text)]">{todaySleep.lowestHeartRate} bpm</b>
              </p>
            )}
          </div>
        ) : (
          <div className="panel flex items-center justify-center">
            <p className="text-xs text-[var(--color-text-muted)]">No sleep data today</p>
          </div>
        )}

        {/* Nutrition Check */}
        <NutritionCheck
          nutrition={
            todayNutrition
              ? {
                  calories: todayNutrition.calories,
                  protein: todayNutrition.protein,
                  perMealProtein: Array.from(perMealProtein.entries()).map(
                    ([mealType, protein]) => ({ mealType, protein })
                  ),
                }
              : null
          }
          bodyWeightKg={weightKg}
          dailyCalorieTarget={profile?.dailyCalorieTarget ?? null}
          energyAvailability={eaValue}
        />
      </div>

      {/* Multi-week trend charts */}
      <div className="mt-6">
        <TrendsCharts />
      </div>

      {/* ─── COMPOSITION & ENERGY ─── */}
      <SectionLabel>Composition &amp; Energy</SectionLabel>
      <div className="mt-6 grid grid-cols-[1.5fr_1fr] gap-[14px] items-stretch">
        {/* Left: Weight + Trend Chart — single card per design */}
        <div className="panel p-[22px_24px]">
          <WeightCard
            latestWeightKg={weightKg}
            latestBodyFat={latestBodyFat}
            unit={unit}
            goal={profile?.goal ?? null}
            targetWeightKg={profile?.targetWeightKg ?? null}
            weightTrend={weightTrend}
            tdee={tdee}
            goalCals={goalCals}
          />
          <WeightTrendChart
            logs={weightChartData}
            unit={unit}
            targetWeightKg={profile?.targetWeightKg ?? null}
          />
        </div>

        {/* Right: TDEE & Targets — single card per design */}
        <TdeeCard
          tdee={tdee}
          goalCals={goalCals}
          actualCals={todayNutrition?.calories ?? null}
          proteinTarget={weightKg ? Math.round(weightKg * 1.6) : null}
          actualProtein={todayNutrition?.protein ?? null}
          flag={null}
          energyAvailability={eaValue}
        />
      </div>

      {/* bottom spacing */}
      <div className="h-8" />
    </div>
  );
}

/** Section label with trailing line — matches design's .seclabel */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-[30px]">
      <span className="ov flex-none">{children}</span>
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}
