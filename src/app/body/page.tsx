import Link from "next/link";
import { prisma } from "@/lib/db";
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
import { weightTrendDirection } from "@/lib/tdee";

export const dynamic = "force-dynamic";

export default async function BodyPage() {
  const now = new Date();
  const localToday = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );

  // Week window (Monday-Sunday)
  const weekStart = new Date(localToday);
  const dayOfWeek = weekStart.getUTCDay() || 7; // Sunday = 7
  weekStart.setUTCDate(weekStart.getUTCDate() - (dayOfWeek - 1));

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
      orderBy: { day: "desc" },
      take: 14,
    }),
  ]);

  const latestWeight = weightLogs[0] ?? null;
  const weightKg = latestWeight?.weightKg ?? profile?.bodyWeightKg ?? null;
  const latestBodyFat = latestWeight?.bodyFatPct ?? profile?.bodyFatPct ?? null;
  const unit = (profile?.unit ?? "lb") as "lb" | "kg";
  const weightTrend = weightTrendDirection(
    weightLogs.map((l) => ({ day: l.day, weightKg: l.weightKg }))
  );

  const tier = readinessTier(score?.overall ?? null);
  const guidance = cyclePhaseGuidance(phaseLog?.phase ?? null);

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
  const hrvCvElevated = cv != null && cv > 8; // rough threshold

  // --- Fatigue score ---
  const volumeApproachingMRV = Object.entries(muscleSets).some(
    ([group, sets]) => sets >= volumeZones[group].mrv * 0.9
  );

  // RPE creep detection: check most-used exercise
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

  const fatigue = computeFatigueScore({
    weeksSinceLastDeload: 0, // not tracked yet — placeholder
    hrvBelowBaseline: false,
    hrvCvElevated,
    sleepQualityDecline: recentSleep
      .slice(0, 3)
      .every((s) => (s.score ?? 100) < 70),
    rhrElevated: false,
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

  // Rough exercise calorie estimate: 0.06 kcal per lb of volume (very rough)
  const weekVolume = weekSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  const todaysExerciseCal = weekVolume * 0.06 / 7; // flat-averaged

  const eaValue = ffm && todayNutrition
    ? computeEA(todayNutrition.calories, todaysExerciseCal, ffm)
    : null;

  return (
    <div className="space-y-6">
      {/* Weight snapshot */}
      <WeightCard
        latestWeightKg={weightKg}
        latestBodyFat={latestBodyFat}
        unit={unit}
        goal={profile?.goal ?? null}
        targetWeightKg={profile?.targetWeightKg ?? null}
        weightTrend={weightTrend}
      />

      {/* Readiness tier */}
      <ReadinessTierCard tier={tier} baselineScore={score?.overall ?? null} />

      {/* Cycle phase guidance */}
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
                Fatigue Signal
              </p>
              <p className="mt-1 text-sm font-semibold">{fatigue.recommendation}</p>
            </div>
            <span className="font-mono text-2xl font-bold">{fatigue.score}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
            {hrvCvElevated && <span>HRV CV elevated ({cv?.toFixed(1)}%)</span>}
            {anyRpeCreep && <span>RPE creep detected</span>}
            {volumeApproachingMRV && <span>Volume near MRV</span>}
          </div>
        </div>
      )}

      {/* Volume zones */}
      <VolumeZones data={weeklyVolumeData} />

      {/* Multi-week trend charts */}
      <TrendsCharts />

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
  );
}
