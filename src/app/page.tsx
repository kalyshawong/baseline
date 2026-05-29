import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { getScoreForDate } from "@/lib/baseline-score";
import { TodayCallHero } from "@/components/dashboard/today-call-hero";
import { DoSection } from "@/components/dashboard/do-section";
import { TonightSection } from "@/components/dashboard/tonight-section";
import { SleepRing } from "@/components/dashboard/sleep-ring";
import { ActivityCard } from "@/components/dashboard/activity-card";
import { CalorieBalanceCard } from "@/components/dashboard/calorie-balance-card";
import { CycleCard } from "@/components/dashboard/cycle-card";
import { SleepCard } from "@/components/dashboard/sleep-card";
import { WorkoutCard } from "@/components/dashboard/workout-card";
import { ManualWorkoutEntry } from "@/components/dashboard/manual-workout-entry";
import { HyroxCountdownCard } from "@/components/dashboard/hyrox-countdown-card";
import { getHyroxToday } from "@/lib/hyrox-today";
import { SyncButton } from "@/components/dashboard/sync-button";
import { DateNav } from "@/components/date-nav";
import { getDateFromParams, getDateStrFromParams, getLocalDay, getLocalDayBounds } from "@/lib/date-utils";
import { getTrainingCallForDate } from "@/lib/training-call";
import { getDownsampledHrForWorkout, type HrChartPoint } from "@/lib/workout-notes";

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
  let todayHkWorkouts: Awaited<ReturnType<typeof prisma.healthKitWorkout.findMany>> = [];
  let lastHkSync: Awaited<ReturnType<typeof prisma.healthKitSync.findFirst>> = null;
  let dayActivity: Awaited<ReturnType<typeof prisma.dailyActivity.findUnique>> = null;
  let profile: Awaited<ReturnType<typeof prisma.userProfile.findUnique>> = null;
  let sleepTimeRec: Awaited<ReturnType<typeof prisma.sleepTimeRecommendation.findFirst>> = null;
  let weightLoggedToday = false;
  let cyclePhase: string | null = null;
  let cycleDayNumber: number | null = null;

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
      cycleResult,
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
      // All workouts for the viewed day, most-recent-first. The dashboard
      // renders one WorkoutCard per workout — supports back-to-back
      // morning-lift + evening-run patterns that are common for hybrid
      // athletes.
      prisma.healthKitWorkout.findMany({
        where: { startedAt: { gte: viewDayStart, lt: viewDayEnd } },
        orderBy: { startedAt: "desc" },
      }),
      prisma.weightLog.findFirst({ where: { day: viewDate } }),
      prisma.dailyActivity.findUnique({ where: { day: viewDate } }),
      prisma.healthKitSync.findFirst({ orderBy: { syncedAt: "desc" } }),
      prisma.userProfile.findUnique({ where: { id: 1 } }),
      // Cycle phase + period day for the viewed date.
      //
      // Both go through helpers in src/lib/cycle-phase.ts:
      // - resolveCyclePhase applies a phase-aware staleness cap so a
      //   month-old menstrual log doesn't render as "currently
      //   menstruating" (2026-05-28 audit).
      // - getCurrentPeriodDay walks back through consecutive menstrual
      //   entries to find the *start* of the current period instead
      //   of using the most recent log, which always returned "Day 1"
      //   no matter how many days into bleeding the user actually was
      //   (also 2026-05-28).
      (async () => {
        const { resolveCyclePhase, getCurrentPeriodDay } = await import(
          "@/lib/cycle-phase"
        );
        const [resolved, periodDay] = await Promise.all([
          resolveCyclePhase(viewDate),
          getCurrentPeriodDay(viewDate),
        ]);
        return { resolved, periodDay };
      })(),
    ]);

    score = scoreResult;
    dayReadiness = dayReadinessResult;
    lastSync = lastSyncResult;
    daySleep = daySleepResult;
    nutritionEntryCount = nutritionLog?.entries.length ?? 0;
    nutritionCalories = nutritionLog?.calories ?? null;
    sleepTimeRec = sleepTimeRecResult;
    todayHkWorkouts = todayHkWorkoutResult;
    weightLoggedToday = !!todayWeightLog;
    dayActivity = dayActivityResult;
    lastHkSync = lastHkSyncResult;
    profile = profileResult;
    if (cycleResult) {
      // cycleResult.resolved.phase is null when the most recent log
      // is past its staleness cap (see resolveCyclePhase). Treat that
      // as "no current phase" rather than echoing a stale value.
      cyclePhase = cycleResult.resolved.phase;
      // Period day = days into the current consecutive menstrual
      // streak. Only meaningful when the resolved phase is menstrual.
      cycleDayNumber =
        cycleResult.resolved.phase === "menstrual"
          ? cycleResult.periodDay
          : null;
    }
  } catch {
    // DB not connected yet — render empty states.
  }

  // Training call — computed for every viewed date so the dashboard
  // always shows the hero band (past dates show what the call *was*).
  const isToday = isSameLocalDay(viewDate, getLocalDay());
  const todayCall = await getTrainingCallForDate(viewDate);

  // Pull the active Hyrox plan + today's session recommendation. Renders
  // nothing if no active plan exists, so non-Hyrox users see no change.
  const hyroxToday = await getHyroxToday(viewDate);

  // Split "real training" from "ambient activity." Walks, breathing,
  // stands etc. shouldn't claim a full WorkoutCard with notes + a
  // Discuss-with-coach button — they roll up into the ActivityCard
  // as a one-line summary. Training workouts (HIIT, lifts, runs,
  // Hyrox, cycling, etc.) keep their full treatment.
  const AMBIENT_NAME_RE = /^(walking|walk|stand|breathing|meditation)$/i;
  const ambientWorkouts = todayHkWorkouts.filter((w) =>
    AMBIENT_NAME_RE.test(w.name),
  );
  const trainingWorkouts = todayHkWorkouts.filter(
    (w) => !AMBIENT_NAME_RE.test(w.name),
  );

  // Downsampled HR curves only for the training workouts — ambient
  // sessions don't render a chart so we skip those queries.
  const hrChartsByWorkoutId: Record<string, HrChartPoint[]> = {};
  if (trainingWorkouts.length > 0) {
    const chartResults = await Promise.all(
      trainingWorkouts.map((w) =>
        getDownsampledHrForWorkout(w.startedAt, w.endedAt),
      ),
    );
    trainingWorkouts.forEach((w, i) => {
      hrChartsByWorkoutId[w.id] = chartResults[i];
    });
  }

  // Format the optional bedtime recommendation for the Tonight section.
  // optimalBedtimeStart is seconds from midnight (negative = before midnight).
  const sleepTargetTime =
    sleepTimeRec?.optimalBedtimeStart != null
      ? formatSecondsFromMidnight(sleepTimeRec.optimalBedtimeStart)
      : null;

  // Tonight section's "captured today" line. With multiple workouts:
  //   1 → "Hyrox HIIT (76 min)"
  //   2 → "Hyrox HIIT (76 min) + Run (32 min)"
  //   3+ → "3 workouts (134 min total)"
  // Keeps the line short when the day is heavy, descriptive when it's not.
  function buildWorkoutSummary(): string | null {
    if (todayHkWorkouts.length === 0) return null;
    if (todayHkWorkouts.length === 1) {
      const w = todayHkWorkouts[0];
      return formatWorkoutSummary(w.name, w.durationSeconds);
    }
    if (todayHkWorkouts.length === 2) {
      return todayHkWorkouts
        .map((w) => formatWorkoutSummary(w.name, w.durationSeconds))
        .join(" + ");
    }
    const totalSec = todayHkWorkouts.reduce(
      (sum, w) => sum + w.durationSeconds,
      0,
    );
    const totalMin = Math.round(totalSec / 60);
    return `${todayHkWorkouts.length} workouts (${totalMin} min total)`;
  }
  const workoutSummary = buildWorkoutSummary();

  return (
    <main>
      {/* Date / sync strip */}
      <div className="flex items-center justify-between border-b-2 border-[var(--color-border)] bg-[var(--color-surface)] px-9 py-3.5">
        <Suspense>
          <DateNav basePath="/" />
        </Suspense>
        <div className="flex items-center gap-4">
          {isConnected ? (
            <SyncButton />
          ) : (
            <a href="/api/auth/oura" className="btn">
              Connect Oura
            </a>
          )}
          {lastSync && (
            <span className="ov">
              Last sync{" "}
              {lastSync.syncDate.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] px-9 pt-6 pb-16">

      {/* Hero — the day's training call */}
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
                    unit: "h:m",
                  },
                ]
              : daySleep?.score != null
                ? [{ label: "Sleep", value: daySleep.score, unit: "score" }]
                : []),
          ]}
        />

      {/* Hyrox countdown — renders only when an active Hyrox plan
       * exists. For a Hyrox athlete this is the most actionable card
       * on the dashboard during the final 14 days. */}
      {hyroxToday && (
        <HyroxCountdownCard today={hyroxToday} />
      )}

      {/* Today's tally: ambient activity → specific workout (or manual
       * entry fallback) → calorie balance. Each is its own card-level
       * concept so they don't fight each other for visual weight. */}
      <div className="grid gap-[14px]">
        {/* Triple row: Activity / Cycle / Calories */}
        <div className="grid grid-cols-[1.4fr_1fr_1.2fr] gap-[14px]">
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
            lastHkSync={
              lastHkSync
                ? {
                    syncedAt: lastHkSync.syncedAt.toISOString(),
                    status: lastHkSync.status,
                  }
                : null
            }
            lastOuraSync={lastSync?.syncDate ?? null}
            ambientSessions={ambientWorkouts.map((w) => ({
              id: w.id,
              name: w.name,
              durationSeconds: w.durationSeconds,
              activeCalories: w.activeCalories,
            }))}
          />
          <CycleCard
            phase={cyclePhase}
            dayNumber={cycleDayNumber}
            temperatureDeviationC={dayReadiness?.temperatureDeviation ?? null}
          />
          <CalorieBalanceCard
            caloriesIn={nutritionCalories}
            caloriesOut={dayActivity?.totalCalories ?? null}
            goal={profile?.goal ?? null}
            goalCals={null}
          />
        </div>

        {/* Sleep */}
        <SleepCard
          daySleep={
            daySleep
              ? {
                  score: daySleep.score,
                  totalSleepDuration: daySleep.totalSleepDuration,
                  remSleepDuration: daySleep.remSleepDuration,
                  deepSleepDuration: daySleep.deepSleepDuration,
                  lightSleepDuration: daySleep.lightSleepDuration,
                  sleepEfficiency: daySleep.sleepEfficiency,
                  latency: daySleep.latency,
                  averageHrv: daySleep.averageHrv,
                  lowestHeartRate: daySleep.lowestHeartRate,
                }
              : null
          }
        />

        {/* Workout slot — one WorkoutCard per synced workout (most
         * recent first), with each card carrying its own Notes editor
         * and "Discuss with coach →" button scoped to that workout.
         * When no workouts exist, the ManualWorkoutEntry fallback lets
         * the athlete log a session without waiting for HAE/Strava. */}
        {trainingWorkouts.length > 0 ? (
          trainingWorkouts.map((w) => (
            <WorkoutCard
              key={w.id}
              workout={{
                id: w.id,
                name: w.name,
                startedAt: w.startedAt.toISOString(),
                endedAt: w.endedAt.toISOString(),
                durationSeconds: w.durationSeconds,
                activeCalories: w.activeCalories,
                avgHeartRate: w.avgHeartRate,
                maxHeartRate: w.maxHeartRate,
                minHeartRate: w.minHeartRate,
              }}
              hrChart={hrChartsByWorkoutId[w.id] ?? []}
            />
          ))
        ) : (
          <div className="panel">
            <span className="ov">Workout</span>
            {ambientWorkouts.length > 0 ? (
              // Walks (and other ambient sessions) still get listed
              // here even when no training workout was logged. They're
              // not displayed as full WorkoutCards because they don't
              // earn the notes/discuss-with-coach affordances, but
              // saying "no Apple Watch workout synced today" when the
              // watch did sync three walks is wrong — the user pushed
              // back on that 2026-05-28. List them compactly.
              <>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  No training workout — just ambient activity.
                </p>
                <div className="mt-3">
                  {ambientWorkouts.map((w) => {
                    const startLabel = w.startedAt.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    });
                    const minutes = Math.round(w.durationSeconds / 60);
                    const durLabel =
                      minutes < 60
                        ? `${minutes}m`
                        : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
                    const distLabel =
                      w.distance != null && w.distance > 0
                        ? w.distance >= 1000 && w.distanceUnit === "m"
                          ? `${(w.distance / 1000).toFixed(2)} km`
                          : w.distanceUnit === "km"
                            ? `${w.distance.toFixed(2)} km`
                            : `${Math.round(w.distance)} ${w.distanceUnit}`
                        : null;
                    const calLabel =
                      w.activeCalories != null
                        ? `${Math.round(w.activeCalories)} cal`
                        : null;
                    const detailBits = [durLabel, distLabel, calLabel].filter(
                      (b): b is string => b !== null,
                    );
                    return (
                      <div
                        key={w.id}
                        className="grid grid-cols-[80px_1fr] items-center gap-5 border-b border-[var(--color-border)] py-3"
                      >
                        <span className="text-[13px] font-bold tracking-[0.03em] text-[var(--color-faint)]">
                          {startLabel}
                        </span>
                        <span className="text-sm text-[var(--color-text-muted)]">
                          <b className="font-bold uppercase tracking-[0.04em] text-[13px] text-[var(--color-text)]">{w.name}</b>
                          {" · "}{detailBits.join(" · ")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              lastHkSync && (
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  No Apple Watch workout synced today yet.
                </p>
              )
            )}
            <ManualWorkoutEntry />
          </div>
        )}

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
      </div>
    </main>
  );
}
