import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { getScoreForDate } from "@/lib/baseline-score";
import { TodayCallHero } from "@/components/dashboard/today-call-hero";
import { DoSection } from "@/components/dashboard/do-section";
import { TonightSection } from "@/components/dashboard/tonight-section";
import { SleepRing } from "@/components/dashboard/sleep-ring";
import { ActivityCard } from "@/components/dashboard/activity-card";
import { CalorieBalanceCard } from "@/components/dashboard/calorie-balance-card";
import { SyncButton } from "@/components/dashboard/sync-button";
import { DateNav } from "@/components/date-nav";
import { getDateFromParams, getDateStrFromParams, getLocalDay, getLocalDayBounds } from "@/lib/date-utils";
import { getTrainingCallForDate } from "@/lib/training-call";

/**
 * Dashboard structure (2026-05-27, post-brainstorm convergence):
 *
 *   Header → DateNav + sync controls
 *   Hero   → TodayCallHero (verdict + why + action + evidence strip)
 *           with typewriter reveal on first daily open
 *   Do     → three deep-link CTAs (Log food, Log workout, Open coach)
 *   Tonight → sleep target + one-line "captured today" summary
 *
 * Removed from this page: Sessions, MacroSummary, WeightCard, TdeeCard,
 * SleepBreakdown, BaselineScoreCard, the 6-MetricCard grid, TrendChart,
 * CyclePhaseSelector. ActivityCard + CalorieBalanceCard were briefly
 * also removed and then put back (2026-05-27) — they show today's
 * actual physical activity + cal in/out, which are the two cards the
 * user found genuinely useful to watch fill up through the day. Deep
 * data review lives on /body; logging lives on /mind; coach
 * conversation lives on /coach. The dashboard's only job is to honor
 * the morning verdict and let the user see today's tally accumulate.
 *
 * Still missing (deferred): a WHY section showing past-7-day call
 * context. Needs a getCallsForRange() data layer that doesn't exist yet
 * — adding it as placeholder data here would feel like the widgets we
 * just removed. Better to ship the structure honestly and add WHY when
 * we can compute meaningful comparisons.
 */

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

function formatWorkoutSummary(name: string, durationSeconds: number): string {
  const m = Math.round(durationSeconds / 60);
  const dur = m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${name} (${dur})`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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
  let daySleep = null;
  let dayReadiness = null;
  let lastSync = null;
  let isConnected = false;
  let nutritionEntryCount = 0;
  let nutritionCalories: number | null = null;
  let todayHkWorkout: Awaited<ReturnType<typeof prisma.healthKitWorkout.findFirst>> = null;
  let lastHkSync: Awaited<ReturnType<typeof prisma.healthKitSync.findFirst>> = null;
  let dayActivity: Awaited<ReturnType<typeof prisma.dailyActivity.findUnique>> = null;
  let profile: Awaited<ReturnType<typeof prisma.userProfile.findUnique>> = null;
  let sleepTimeRec: Awaited<ReturnType<typeof prisma.sleepTimeRecommendation.findFirst>> = null;
  let weightLoggedToday = false;

  try {
    const token = await prisma.ouraToken.findFirst();
    isConnected = !!token;

    // Use local-timezone day bounds for timestamp-based queries (e.g.
    // HealthKitWorkout.startedAt). UTC midnight skews late-evening local
    // workouts into the next day's bucket.
    const viewDateStr = getDateStrFromParams(params);
    const { start: viewDayStart, end: viewDayEnd } = getLocalDayBounds(viewDateStr);

    const [
      scoreResult,
      dayReadinessResult,
      lastSyncResult,
      daySleepResult,
      nutritionLog,
      sleepTimeRecResult,
      todayHkWorkoutResult,
      todayWeightLog,
      dayActivityResult,
      lastHkSyncResult,
      profileResult,
    ] = await Promise.all([
      getScoreForDate(viewDate),
      prisma.dailyReadiness.findUnique({ where: { day: viewDate } }),
      prisma.syncLog.findFirst({ orderBy: { syncDate: "desc" } }),
      prisma.dailySleep.findUnique({ where: { day: viewDate } }),
      prisma.nutritionLog.findUnique({
        where: { day: viewDate },
        include: { entries: { select: { id: true } } },
      }),
      // Fall back to most recent within 7 days when there's no exact-day rec.
      prisma.sleepTimeRecommendation
        .findFirst({ where: { day: viewDate } })
        .then(async (rec) => {
          if (rec) return rec;
          const sevenDaysAgo = new Date(
            viewDate.getTime() - 7 * 24 * 60 * 60 * 1000,
          );
          return prisma.sleepTimeRecommendation.findFirst({
            where: { day: { gte: sevenDaysAgo, lte: viewDate } },
            orderBy: { day: "desc" },
          });
        }),
      prisma.healthKitWorkout.findFirst({
        where: { startedAt: { gte: viewDayStart, lt: viewDayEnd } },
        orderBy: { startedAt: "desc" },
      }),
      prisma.weightLog.findFirst({ where: { day: viewDate } }),
      prisma.dailyActivity.findUnique({ where: { day: viewDate } }),
      prisma.healthKitSync.findFirst({ orderBy: { syncedAt: "desc" } }),
      prisma.userProfile.findUnique({ where: { id: 1 } }),
    ]);

    score = scoreResult;
    dayReadiness = dayReadinessResult;
    lastSync = lastSyncResult;
    daySleep = daySleepResult;
    nutritionEntryCount = nutritionLog?.entries.length ?? 0;
    nutritionCalories = nutritionLog?.calories ?? null;
    sleepTimeRec = sleepTimeRecResult;
    todayHkWorkout = todayHkWorkoutResult;
    weightLoggedToday = !!todayWeightLog;
    dayActivity = dayActivityResult;
    lastHkSync = lastHkSyncResult;
    profile = profileResult;
  } catch {
    // DB not connected yet — render empty states.
  }

  // Today's call — integrated training verdict (baseline score + cycle
  // phase + HRV CV + fatigue + acute stress). Only computed when viewing
  // today's date; past dates are for reviewing data, not making decisions.
  const isToday = isSameLocalDay(viewDate, getLocalDay());
  const todayCall = isToday ? await getTrainingCallForDate(viewDate) : null;

  // Format the optional bedtime recommendation for the Tonight section.
  // optimalBedtimeStart is seconds from midnight (negative = before midnight).
  const sleepTargetTime =
    sleepTimeRec?.optimalBedtimeStart != null
      ? formatSecondsFromMidnight(sleepTimeRec.optimalBedtimeStart)
      : null;

  const workoutSummary =
    todayHkWorkout != null
      ? formatWorkoutSummary(todayHkWorkout.name, todayHkWorkout.durationSeconds)
      : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
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
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition duration-150 ease-out-strong hover:bg-white/20 active:scale-[0.97]"
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

      {/* Hero — the morning call. Renders only on today (past dates are
       * for data review on /body, not for decision-making). */}
      {isToday && (
        <TodayCallHero
          call={todayCall}
          isConnected={isConnected}
          evidence={[
            ...(score
              ? [
                  {
                    label: "Baseline",
                    value: score.overall,
                    valueColor:
                      score.color === "green"
                        ? "text-[var(--color-green)]"
                        : score.color === "yellow"
                          ? "text-[var(--color-yellow)]"
                          : "text-[var(--color-red)]",
                  },
                ]
              : []),
            ...(dayReadiness?.score != null
              ? [{ label: "Readiness", value: dayReadiness.score }]
              : []),
            ...(daySleep?.totalSleepDuration
              ? [
                  {
                    label: "Sleep",
                    value: formatDuration(daySleep.totalSleepDuration),
                    icon: <SleepRing score={daySleep.score ?? null} />,
                  },
                ]
              : daySleep?.score != null
                ? [
                    {
                      label: "Sleep",
                      value: daySleep.score,
                      unit: "score",
                      icon: <SleepRing score={daySleep.score} />,
                    },
                  ]
                : []),
          ]}
        />
      )}

      {/* Today's tally — activity (Oura + Apple Watch) and calorie
       * in/out. These two specifically fill in throughout the day as
       * you log/sync, which is why they earn a place on the dashboard
       * (other display cards were stripped). goalCals is null here —
       * the full TDEE math lives on /body where it has the room. */}
      <div className="mb-8 space-y-3">
        <ActivityCard
          activity={
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
          workout={
            todayHkWorkout
              ? {
                  id: todayHkWorkout.id,
                  name: todayHkWorkout.name,
                  durationSeconds: todayHkWorkout.durationSeconds,
                  activeCalories: todayHkWorkout.activeCalories,
                  avgHeartRate: todayHkWorkout.avgHeartRate,
                  maxHeartRate: todayHkWorkout.maxHeartRate,
                }
              : null
          }
          lastHkSync={
            lastHkSync
              ? {
                  syncedAt: lastHkSync.syncedAt.toISOString(),
                  status: lastHkSync.status,
                }
              : null
          }
          lastOuraSync={lastSync?.syncDate ?? null}
        />
        <CalorieBalanceCard
          caloriesIn={nutritionCalories}
          caloriesOut={dayActivity?.totalCalories ?? null}
          goal={profile?.goal ?? null}
          goalCals={null}
        />
      </div>

      {/* Do — three deep-link CTAs (mid-day use mode). */}
      <DoSection />

      {/* Tonight — sleep target + one-line captured-today summary
       * (evening use mode). Renders nothing if there's no data. */}
      <TonightSection
        sleepTargetTime={sleepTargetTime}
        workoutSummary={workoutSummary}
        mealCount={nutritionEntryCount}
        weightLoggedToday={weightLoggedToday}
      />
    </main>
  );
}
