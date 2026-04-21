import Link from "next/link";
import { prisma } from "@/lib/db";
import { getLocalDay } from "@/lib/date-utils";
import { getScoreForDate } from "@/lib/baseline-score";
import {
  readinessTier,
  cyclePhaseGuidance,
  compoundContributions,
  volumeZones,
  hrvCV,
  estimate1RM,
  ffmFromBodyComposition,
  energyAvailability as computeEA,
  computeFatigueScore,
  detectRpeCreep,
} from "@/lib/training";
import { ReadinessTierCard } from "@/components/body/readiness-tier-card";
import { VolumeZones } from "@/components/body/volume-zones";
import { CyclePhaseGuidanceCard } from "@/components/body/cycle-phase-guidance-card";
import { NutritionCheck } from "@/components/body/nutrition-check";
import { TrendsCharts } from "@/components/body/trends-charts";
import { WeightCard } from "@/components/weight/weight-card";
import { WeightInput } from "@/components/weight/weight-input";
import { WeightTrendChart } from "@/components/weight/weight-trend-chart";
import { WeightGoalSettings } from "@/components/weight/weight-goal-settings";
import { TdeeCard } from "@/components/weight/tdee-card";
import { RunningMetricsCard } from "@/components/body/running-metrics-card";
import { HyroxSummaryCard } from "@/components/hyrox-summary-card";
import {
  totalDailyEnergyExpenditure,
  goalCalories,
  weightTrendDirection,
  movingAverage,
} from "@/lib/tdee";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function formatSecondsFromMidnight(seconds: number): string {
  const totalSeconds = seconds < 0 ? 86400 + seconds : seconds;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

export const dynamic = "force-dynamic";

export default async function BodyPage() {
  const localToday = getLocalDay();

  // Week window (Monday-Sunday)
  const weekStart = new Date(localToday);
  const dayOfWeek = weekStart.getUTCDay() || 7; // Sunday = 7
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
    prisma.cyclePhaseLog.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),
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

  const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1] : null;
  const weightKg = latestWeight?.weightKg ?? profile?.bodyWeightKg ?? null;
  const latestBodyFat = latestWeight?.bodyFatPct ?? profile?.bodyFatPct ?? null;
  const unit = (profile?.unit ?? "lb") as "lb" | "kg";
  const weightTrend = weightTrendDirection(
    weightLogs.map((l) => ({ day: l.day, weightKg: l.weightKg }))
  );

  const tier = readinessTier(score?.overall ?? null);
  const guidance = cyclePhaseGuidance(phaseLog?.phase ?? null);

  // --- Weight / TDEE calculations ---
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

  // Weight trend chart data with 7-day moving avg
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

  // --- Personal records (top 5 most recent) ---
  const prs = await prisma.workoutSet.findMany({
    where: { isPR: true, isWarmup: false },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { exercise: { select: { name: true } } },
  });

  // --- HRV CV for overreaching signal ---
  const hrvValues = recentSleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const cv = hrvCV(hrvValues);
  const hrvCvElevated = cv != null && cv > 10;

  // --- Fatigue score ---
  const volumeApproachingMRV = Object.entries(muscleSets).some(
    ([group, sets]) => sets >= volumeZones[group].mrv * 0.9
  );

  // RPE creep detection
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

  // --- Compute real fatigue signals from data ---
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

  // --- Nutrition data for Morton/Moore/Loucks checks ---
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
    <div className="space-y-6">
      <HyroxSummaryCard />

      {/* ─── SECTION 1: COMPOSITION & ENERGY ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Composition & Energy
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <WeightCard
            latestWeightKg={weightKg}
            latestBodyFat={latestBodyFat}
            unit={unit}
            goal={profile?.goal ?? null}
            targetWeightKg={profile?.targetWeightKg ?? null}
            weightTrend={weightTrend}
          />
          <WeightInput currentUnit={unit} latestWeightKg={weightKg} />
        </div>
        <WeightTrendChart
          logs={weightChartData}
          unit={unit}
          targetWeightKg={profile?.targetWeightKg ?? null}
        />
        <WeightGoalSettings
          profile={
            profile
              ? {
                  bodyWeightKg: profile.bodyWeightKg,
                  heightCm: profile.heightCm,
                  age: profile.age,
                  sex: profile.sex,
                  activityLevel: profile.activityLevel,
                  goal: profile.goal,
                  targetWeightKg: profile.targetWeightKg,
                  unit: profile.unit,
                }
              : null
          }
        />
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

      {/* ─── SECTION 2: TRAINING READINESS ─── */}
      <div className="space-y-3">
        <ReadinessTierCard tier={tier} baselineScore={score?.overall ?? null} hrvCv={cv} />

        {guidance && <CyclePhaseGuidanceCard guidance={guidance} />}

        {/* Fatigue / deload signal */}
        {fatigue.score > 0 && (
          <div
            className={`rounded-2xl border p-5 ${
              fatigue.score >= 5
                ? "border-red-500/30 bg-red-500/10"
                : fatigue.score >= 3
                  ? "border-amber-500/30 bg-amber-500/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Fatigue Signal (Pritchard 2024, Cadegiani 2019)
                </p>
                <p className="mt-1 text-sm font-semibold">{fatigue.recommendation}</p>
              </div>
              <div className="text-right">
                <span className="font-mono text-2xl font-bold">{fatigue.score}</span>
                <p className="text-[10px] text-[var(--color-text-muted)]">/8 composite</p>
              </div>
            </div>
            <div className="mt-3 space-y-1 text-xs">
              {weeksSinceDeload >= 5 && (
                <p className="text-amber-400">
                  {weeksSinceDeload} consecutive training weeks (deload every 5-6 per Pritchard)
                </p>
              )}
              {hrvBelowBaseline && (
                <p className="text-amber-400">HRV &gt;1 SD below 14-day baseline for 2+ days</p>
              )}
              {hrvCvElevated && (
                <p className="text-amber-400">HRV CV elevated: {cv?.toFixed(1)}% (Flatt threshold: 10%)</p>
              )}
              {recentSleep.slice(0, 3).every((s) => (s.score ?? 100) < 70) && (
                <p className="text-amber-400">Sleep score &lt;70 for 3+ nights</p>
              )}
              {rhrElevated && (
                <p className="text-amber-400">Resting HR elevated 5+ BPM above baseline for 3+ mornings</p>
              )}
              {anyRpeCreep && (
                <p className="text-red-400 font-medium">RPE creep: +1 point at same loads over recent sessions (2× weight)</p>
              )}
              {volumeApproachingMRV && (
                <p className="text-amber-400">Volume approaching/at MRV in 1+ muscle groups</p>
              )}
            </div>
            {fatigue.score >= 3 && (
              <div className="mt-3 rounded-lg bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-text-muted)]">
                <p className="font-medium text-white">Deload protocol:</p>
                <p className="mt-1">Reduce volume 40-60% for 1 week. Maintain training frequency and intensity (keep same loads, fewer sets). Resume normal programming after 7 days.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── SECTION 3: RUNNING & CARDIO (NEW) ─── */}
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

      {/* ─── SECTION 4: STRENGTH TRAINING ─── */}
      <div className="space-y-3">
        <VolumeZones data={weeklyVolumeData} />

        {/* Personal Records */}
        {prs.length > 0 && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Recent PRs
            </h2>
            <div className="space-y-2">
              {prs.map((pr) => (
                <div
                  key={pr.id}
                  className="flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-medium">{pr.exercise.name}</p>
                    <p className="text-[var(--color-text-muted)]">
                      {pr.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono tabular-nums">
                      {pr.weight} × {pr.reps}
                    </p>
                    <p className="text-[var(--color-text-muted)]">
                      e1RM: {Math.round(estimate1RM(pr.weight, pr.reps))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent sessions */}
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Recent Workouts
          </h2>
          {recentSessions.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              No workouts logged yet.{" "}
              <Link href="/body/workout/new" className="underline hover:text-white">
                Start your first session
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/body/workout/${session.id}`}
                  className="block rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs hover:bg-white/10"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {session.templateName ?? "Freestyle"}
                      </p>
                      <p className="text-[var(--color-text-muted)]">
                        {session.date.toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {session.sets.length} sets
                        {session.completedAt && session.sessionVolume != null && (
                          <> · {Math.round(session.sessionVolume)} vol</>
                        )}
                      </p>
                    </div>
                    {session.completedAt ? (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-400">
                        done
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-400">
                        active
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── SECTION 5: RECOVERY ─── */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Recovery
        </h2>

        {/* Sleep Breakdown */}
        {todaySleep && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
            <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Sleep Breakdown
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold tabular-nums">
                  {formatDuration(todaySleep.deepSleepDuration)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">Deep</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">
                  {formatDuration(todaySleep.remSleepDuration)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">REM</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums">
                  {formatDuration(todaySleep.lightSleepDuration)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">Light</p>
              </div>
            </div>
            {todaySleep.lowestHeartRate && (
              <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">
                Lowest HR: {todaySleep.lowestHeartRate} bpm
              </p>
            )}
          </div>
        )}

        {/* Bedtime Recommendation */}
        {sleepTimeRec && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Bedtime</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {sleepTimeRec.optimalBedtimeStart != null
                ? formatSecondsFromMidnight(sleepTimeRec.optimalBedtimeStart)
                : "—"}
              {sleepTimeRec.optimalBedtimeEnd != null
                ? ` – ${formatSecondsFromMidnight(sleepTimeRec.optimalBedtimeEnd)}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {sleepTimeRec.recommendation?.replace(/_/g, " ") ?? "Oura recommendation"}
            </p>
          </div>
        )}

        {/* Nutrition check */}
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

        {/* Multi-week trend charts */}
        <TrendsCharts />
      </div>
    </div>
  );
}
