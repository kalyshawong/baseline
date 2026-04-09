import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { getScoreForDate, getWeekSnapshots } from "@/lib/baseline-score";
import { BaselineScoreCard } from "@/components/dashboard/baseline-score-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { CyclePhaseSelector } from "@/components/dashboard/cycle-phase-selector";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SyncButton } from "@/components/dashboard/sync-button";
import { MacroSummary } from "@/components/dashboard/macro-summary";
import { DateNav } from "@/components/date-nav";
import { getDateFromParams } from "@/lib/date-utils";
import { WeightCard } from "@/components/weight/weight-card";
import { WeightInput } from "@/components/weight/weight-input";
import { TdeeCard } from "@/components/weight/tdee-card";
import { ActivityCard } from "@/components/dashboard/activity-card";
import { CalorieBalanceCard } from "@/components/dashboard/calorie-balance-card";
import { HealthKitStatus } from "@/components/dashboard/healthkit-status";
import {
  totalDailyEnergyExpenditure,
  goalCalories,
  calorieFlag,
  weightTrendDirection,
} from "@/lib/tdee";
import {
  proteinTarget as proteinTargetFn,
  ffmFromBodyComposition,
  energyAvailability as computeEA,
} from "@/lib/training";

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

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewDate = getDateFromParams(params);

  let score = null;
  let weekData: Awaited<ReturnType<typeof getWeekSnapshots>> = [];
  let daySleep = null;
  let dayReadiness = null;
  let dayStress = null;
  let currentPhase: string | null = null;
  let lastSync = null;
  let isConnected = false;
  let nutritionLog: { calories: number; protein: number; carbs: number; fat: number; entries: unknown[] } | null = null;
  let weightLogs: Array<{ day: Date; weightKg: number; bodyFatPct: number | null }> = [];
  let profile: Awaited<ReturnType<typeof prisma.userProfile.findUnique>> = null;
  let dayActivity: Awaited<ReturnType<typeof prisma.dailyActivity.findUnique>> = null;
  let lastHkSync: Awaited<ReturnType<typeof prisma.healthKitSync.findFirst>> = null;
  let todayHkWorkout: Awaited<ReturnType<typeof prisma.healthKitWorkout.findFirst>> = null;
  let daySpO2: Awaited<ReturnType<typeof prisma.dailySpO2.findUnique>> = null;
  let dayResilience: Awaited<ReturnType<typeof prisma.dailyResilience.findUnique>> = null;
  let sleepTimeRec: Awaited<ReturnType<typeof prisma.sleepTimeRecommendation.findFirst>> = null;
  let todaySessions: Awaited<ReturnType<typeof prisma.ouraSession.findMany>> = [];

  try {
    const token = await prisma.ouraToken.findFirst();
    isConnected = !!token;

    [score, weekData, dayReadiness, lastSync, daySleep, dayStress, nutritionLog, dayActivity, daySpO2, dayResilience, sleepTimeRec, todaySessions] =
      await Promise.all([
        getScoreForDate(viewDate),
        getWeekSnapshots(viewDate),
        prisma.dailyReadiness.findUnique({ where: { day: viewDate } }),
        prisma.syncLog.findFirst({ orderBy: { syncDate: "desc" } }),
        prisma.dailySleep.findUnique({ where: { day: viewDate } }),
        prisma.dailyStress.findUnique({ where: { day: viewDate } }),
        prisma.nutritionLog.findUnique({
          where: { day: viewDate },
          include: { entries: true },
        }),
        prisma.dailyActivity.findUnique({ where: { day: viewDate } }),
        prisma.dailySpO2.findUnique({ where: { day: viewDate } }),
        prisma.dailyResilience.findUnique({ where: { day: viewDate } }),
        prisma.sleepTimeRecommendation.findFirst({ orderBy: { day: "desc" } }),
        prisma.ouraSession.findMany({
          where: { day: viewDate },
          orderBy: { startedAt: "desc" },
        }),
      ]);

    const phaseLog = await prisma.cyclePhaseLog.findFirst({
      where: { day: { lte: viewDate } },
      orderBy: { day: "desc" },
    });
    currentPhase = phaseLog?.phase ?? null;

    // Weight & profile
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    [weightLogs, profile] = await Promise.all([
      prisma.weightLog.findMany({
        where: { day: { gte: thirtyDaysAgo } },
        orderBy: { day: "asc" },
      }),
      prisma.userProfile.findUnique({ where: { id: 1 } }),
    ]);

    // HealthKit data
    const viewDayStart = viewDate;
    const viewDayEnd = new Date(viewDate.getTime() + 24 * 60 * 60 * 1000);
    [lastHkSync, todayHkWorkout] = await Promise.all([
      prisma.healthKitSync.findFirst({ orderBy: { syncedAt: "desc" } }),
      prisma.healthKitWorkout.findFirst({
        where: { startedAt: { gte: viewDayStart, lt: viewDayEnd } },
        orderBy: { startedAt: "desc" },
      }),
    ]);
  } catch {
    // DB not connected yet — show empty state
  }

  // --- Weight / TDEE calculations ---
  const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1] : null;
  const weightKg = latestWeight?.weightKg ?? profile?.bodyWeightKg ?? null;
  const bodyFat = latestWeight?.bodyFatPct ?? profile?.bodyFatPct ?? null;
  const unit = (profile?.unit ?? "lb") as "lb" | "kg";

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
  const trendDirection = weightTrendDirection(
    weightLogs.map((l) => ({ day: l.day, weightKg: l.weightKg }))
  );
  const flag = tdee && goalCals && nutritionLog
    ? calorieFlag(nutritionLog.calories, goalCals, trendDirection, profile?.goal ?? "maintain")
    : null;

  const proteinGoal = weightKg ? proteinTargetFn(weightKg) : null;

  // Energy availability (Loucks)
  const ffm = weightKg && bodyFat ? ffmFromBodyComposition(weightKg, bodyFat) : null;
  // Rough exercise burn estimate: 300 kcal/day avg if moderately active
  const exerciseCals = profile?.activityLevel === "very_active" ? 500
    : profile?.activityLevel === "active" ? 400
    : profile?.activityLevel === "moderate" ? 300
    : profile?.activityLevel === "light" ? 200 : 100;
  const ea = ffm && nutritionLog ? computeEA(nutritionLog.calories, exerciseCals, ffm) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Suspense>
          <DateNav basePath="/" />
        </Suspense>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <SyncButton />
          ) : (
            <a
              href="/api/auth/oura"
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20"
            >
              Connect Oura
            </a>
          )}
          {lastSync && (
            <span className="text-xs text-[var(--color-text-muted)]">
              Last sync:{" "}
              {lastSync.syncDate.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Baseline Score */}
      <div className="mb-6">
        <BaselineScoreCard score={score} isConnected={isConnected} />
      </div>

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Readiness"
          value={dayReadiness?.score ?? null}
          detail="Oura readiness"
        />
        <MetricCard
          label="Sleep"
          value={
            daySleep
              ? daySleep.totalSleepDuration
                ? formatDuration(daySleep.totalSleepDuration)
                : `Score: ${daySleep.score}`
              : null
          }
          detail={
            daySleep?.sleepEfficiency
              ? `${daySleep.sleepEfficiency}% efficiency`
              : daySleep && !daySleep.totalSleepDuration
                ? "Details pending"
                : undefined
          }
        />
        <MetricCard
          label="HRV"
          value={daySleep?.averageHrv ?? null}
          unit="ms"
          detail={daySleep && !daySleep.averageHrv ? "Details pending" : "Avg overnight"}
        />
        <MetricCard
          label="Stress"
          value={
            dayStress?.daySummary
              ? dayStress.daySummary.charAt(0).toUpperCase() +
                dayStress.daySummary.slice(1)
              : dayStress?.stressHigh != null
                ? `${Math.round(dayStress.stressHigh / 60)}m high`
                : null
          }
          detail={
            dayStress?.recoveryHigh != null
              ? `${Math.round(dayStress.recoveryHigh / 60)}m recovery`
              : dayStress && !dayStress.daySummary
                ? "Summary pending"
                : undefined
          }
        />
        <MetricCard
          label="SpO2"
          value={daySpO2?.avgSpO2 ?? null}
          unit="%"
          detail={
            daySpO2?.avgSpO2 != null && daySpO2.avgSpO2 < 95
              ? "⚠ Below normal"
              : "Blood oxygen"
          }
        />
        <MetricCard
          label="Resilience"
          value={
            dayResilience?.level
              ? dayResilience.level.charAt(0).toUpperCase() + dayResilience.level.slice(1)
              : null
          }
          detail={
            dayResilience?.sleepRecovery != null
              ? `Sleep: ${dayResilience.sleepRecovery}, Recovery: ${dayResilience.daytimeRecovery}, Stress: ${dayResilience.stress}`
              : undefined
          }
        />
      </div>

      {/* Activity + Calorie Balance */}
      <div className="mb-6 space-y-3">
        <ActivityCard
          data={
            dayActivity
              ? {
                  totalCalories: dayActivity.totalCalories,
                  activeCalories: dayActivity.activeCalories,
                  steps: dayActivity.steps,
                  highActivityTime: dayActivity.highActivityTime,
                  mediumActivityTime: dayActivity.mediumActivityTime,
                }
              : null
          }
        />
        <CalorieBalanceCard
          caloriesIn={nutritionLog?.calories ?? null}
          caloriesOut={dayActivity?.totalCalories ?? null}
          goal={profile?.goal ?? null}
          goalCals={goalCals}
        />
        <HealthKitStatus
          data={{
            lastSync: lastHkSync
              ? {
                  syncedAt: lastHkSync.syncedAt.toISOString(),
                  status: lastHkSync.status,
                  details: lastHkSync.details,
                }
              : null,
            todayWorkout: todayHkWorkout
              ? {
                  name: todayHkWorkout.name,
                  durationSeconds: todayHkWorkout.durationSeconds,
                  activeCalories: todayHkWorkout.activeCalories,
                  avgHeartRate: todayHkWorkout.avgHeartRate,
                  maxHeartRate: todayHkWorkout.maxHeartRate,
                }
              : null,
          }}
        />
      </div>

      {/* Bedtime Recommendation */}
      <div className="mb-6">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Bedtime</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {sleepTimeRec?.optimalBedtimeStart != null
              ? formatSecondsFromMidnight(sleepTimeRec.optimalBedtimeStart)
              : "—"}
            {sleepTimeRec?.optimalBedtimeEnd != null
              ? ` – ${formatSecondsFromMidnight(sleepTimeRec.optimalBedtimeEnd)}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {sleepTimeRec?.recommendation?.replace(/_/g, " ") ?? "Oura recommendation"}
          </p>
        </div>
      </div>

      {/* Sessions */}
      {todaySessions.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Sessions
          </h2>
          <div className="space-y-3">
            {todaySessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium capitalize">{s.type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {Math.round(s.durationSeconds / 60)} min
                    {s.avgHeartRate ? ` · ${Math.round(s.avgHeartRate)} bpm` : ""}
                    {s.avgHrv ? ` · HRV ${Math.round(s.avgHrv)}` : ""}
                  </p>
                </div>
                {s.mood && <span className="text-xs text-[var(--color-text-muted)]">{s.mood}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend Chart */}
      <div className="mb-6">
        <TrendChart data={weekData} />
      </div>

      {/* Cycle Phase */}
      <CyclePhaseSelector currentPhase={currentPhase} />

      {/* Nutrition */}
      <MacroSummary
        compact
        data={
          nutritionLog
            ? {
                calories: nutritionLog.calories,
                protein: nutritionLog.protein,
                carbs: nutritionLog.carbs,
                fat: nutritionLog.fat,
                entryCount: nutritionLog.entries.length,
              }
            : null
        }
      />

      {/* Weight + TDEE section */}
      <div className="mt-6 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <WeightCard
            latestWeightKg={weightKg}
            latestBodyFat={bodyFat}
            unit={unit}
            goal={profile?.goal ?? null}
            targetWeightKg={profile?.targetWeightKg ?? null}
            weightTrend={trendDirection}
          />
          <WeightInput currentUnit={unit} latestWeightKg={weightKg} />
        </div>
        <TdeeCard
          tdee={tdee}
          goalCals={goalCals}
          actualCals={nutritionLog?.calories ?? null}
          proteinTarget={proteinGoal}
          actualProtein={nutritionLog?.protein ?? null}
          flag={flag}
          energyAvailability={ea}
        />
      </div>

      {/* Sleep Breakdown */}
      {daySleep && (
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Sleep Breakdown
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-bold tabular-nums">
                {formatDuration(daySleep.deepSleepDuration)}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">Deep</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">
                {formatDuration(daySleep.remSleepDuration)}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">REM</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">
                {formatDuration(daySleep.lightSleepDuration)}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">Light</p>
            </div>
          </div>
          {daySleep.lowestHeartRate && (
            <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">
              Lowest HR: {daySleep.lowestHeartRate} bpm
            </p>
          )}
        </div>
      )}
    </main>
  );
}
