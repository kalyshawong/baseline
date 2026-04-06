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
import { WeightTrendChart } from "@/components/weight/weight-trend-chart";
import { WeightGoalSettings } from "@/components/weight/weight-goal-settings";
import { TdeeCard } from "@/components/weight/tdee-card";
import { ActivityCard } from "@/components/dashboard/activity-card";
import { CalorieBalanceCard } from "@/components/dashboard/calorie-balance-card";
import {
  totalDailyEnergyExpenditure,
  goalCalories,
  calorieFlag,
  movingAverage,
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
  let dayActivity: Awaited<ReturnType<typeof prisma.dailyActivity.findFirst>> = null;

  try {
    const token = await prisma.ouraToken.findFirst();
    isConnected = !!token;

    [score, weekData, dayReadiness, lastSync, daySleep, dayStress, nutritionLog, dayActivity] =
      await Promise.all([
        getScoreForDate(viewDate),
        getWeekSnapshots(viewDate),
        prisma.dailyReadiness.findFirst({
          where: { day: { lte: viewDate } },
          orderBy: { day: "desc" },
        }),
        prisma.syncLog.findFirst({ orderBy: { syncDate: "desc" } }),
        prisma.dailySleep.findFirst({
          where: { day: { lte: viewDate }, totalSleepDuration: { not: null } },
          orderBy: { day: "desc" },
        }),
        prisma.dailyStress.findFirst({
          where: { day: { lte: viewDate }, daySummary: { not: null } },
          orderBy: { day: "desc" },
        }),
        prisma.nutritionLog.findUnique({
          where: { day: viewDate },
          include: { entries: true },
        }),
        prisma.dailyActivity.findFirst({
          where: { day: { lte: viewDate } },
          orderBy: { day: "desc" },
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
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Readiness"
          value={dayReadiness?.score ?? null}
          detail="Oura readiness"
        />
        <MetricCard
          label="Sleep"
          value={daySleep ? formatDuration(daySleep.totalSleepDuration) : null}
          detail={
            daySleep?.sleepEfficiency
              ? `${daySleep.sleepEfficiency}% efficiency`
              : undefined
          }
        />
        <MetricCard
          label="HRV"
          value={daySleep?.averageHrv ?? null}
          unit="ms"
          detail="Avg overnight"
        />
        <MetricCard
          label="Stress"
          value={
            dayStress?.daySummary
              ? dayStress.daySummary.charAt(0).toUpperCase() +
                dayStress.daySummary.slice(1)
              : null
          }
          detail={
            dayStress?.recoveryHigh
              ? `${Math.round(dayStress.recoveryHigh / 60)}m recovery`
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
      </div>

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
