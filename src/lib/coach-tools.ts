import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { hrvCV } from "@/lib/training";
import { dateStrToUTC, getLocalDayBounds } from "@/lib/date-utils";
import { computePaceBudget, formatKmPace } from "@/lib/hyrox-pace";
import { getHyroxToday } from "@/lib/hyrox-today";
import { getPreWorkoutFuel } from "@/lib/pre-workout-fuel";
import { getCurrentUserId } from "@/lib/current-user";

/**
 * Format helpers — every timestamp returned to the model goes through
 * one of these so the model never sees raw UTC ISO. Bug history
 * (2026-05-28): without local-formatted output, the model interpreted
 * "2026-05-28T00:33Z" (a workout at 8:33 PM EDT) as "12:33 AM" and
 * "2026-05-27T21:00Z" (a 5 PM meal) as "9 PM." Returning explicit
 * local strings eliminates the ambiguity.
 */
function formatLocalDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocalTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocalDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Coach tool definitions + Prisma-backed handlers.
 *
 * Design intent (per the user, 2026-05-28): the coach should be able
 * to "pull and analyze all inputted context and data to find the
 * reason behind a bad workout" — i.e. it's connected to everything
 * and shouldn't need us to pre-stuff data into the prompt. Each tool
 * here is a lookup the model can call mid-conversation.
 *
 * Tools are stateless Prisma queries that return JSON-stringified
 * results. The /api/coach endpoint handles the tool_use → tool_result
 * loop; the model decides when to call which tool based on the
 * user's question.
 *
 * Adding a tool: define it in COACH_TOOLS, then add a case to
 * runCoachTool. Keep return payloads compact — Claude reads them as
 * raw JSON, and token cost compounds fast.
 */

export const COACH_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_food_log",
    description:
      "Get nutrition entries (food/drink logged) for a specific date or date range. Returns entries with timestamps (when actually eaten), descriptions, calories, and macros (protein/carbs/fat), plus `meal_type` (breakfast/lunch/dinner/snack) and `time_unknown` (boolean). When `time_unknown` is true, `eaten_at_local` is null but `meal_type` still narrows the time band — the user's logging convention is breakfast = before noon, lunch = 12-5pm, dinner = 5pm onward. Always use that band when computing meal-to-workout gaps; do NOT skip time-unknown entries (≈15% of the dataset) as 'unusable.' Use this tool for ANY question about pre-workout meals, daily nutrition, meal timing, calorie/macro accumulation, or correlations between food and how the user felt.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "YYYY-MM-DD format (local date) for a single day. Use either `date` OR `start_date`+`end_date`, not both.",
        },
        start_date: {
          type: "string",
          description: "YYYY-MM-DD start of range (inclusive)",
        },
        end_date: {
          type: "string",
          description: "YYYY-MM-DD end of range (inclusive)",
        },
      },
    },
  },
  {
    name: "get_workouts",
    description:
      "Get workouts (Apple Watch / HealthKit) for a date or range. Returns a list with id, name, start time, duration, calories, avg/max HR. Use this to see training history, find a specific workout, or assess cumulative training load over a week.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD for a single day" },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "get_workout_details",
    description:
      "Get full details for a single workout by id: structured data + HR sample statistics + any attached WorkoutNote narrative + signal snapshot frozen at note-save time + **live-derived `live_cycle` and `live_temperature` fields for the workout's local day**. Use this when discussing a specific workout in depth. IMPORTANT: when citing cycle phase, period day, or temperature for the workout, prefer `live_cycle` and `live_temperature` over fields in `note.signal_snapshot` — the snapshot is frozen at note-save time and historical snapshots may be missing the day/temperature fields entirely. For 'day N of period' claims, always cite `live_cycle.period_day`; never derive from snapshot's cyclePhase alone.",
    input_schema: {
      type: "object",
      properties: {
        workout_id: {
          type: "string",
          description:
            "The workout's HealthKitWorkout.id. Get this from get_workouts first if you don't have it.",
        },
      },
      required: ["workout_id"],
    },
  },
  {
    name: "get_signals",
    description:
      "Get physiological signals for a specific date: readiness (Oura), sleep (duration + Oura score + stages), overnight HRV in ms, HRV CV % (7-day coefficient of variation — the overreaching metric, >10% suggests autonomic instability per Flatt & Esco 2016), stress summary, Baseline composite score (Baseline-proprietary 0-100). Use this to understand the user's recovery state on a given day.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "YYYY-MM-DD (local date)",
        },
      },
      required: ["date"],
    },
  },
  {
    name: "get_cycle",
    description:
      "Get cycle phase information for a date. Returns: `active_phase` (staleness-guarded; null when last log is too old), `current_period` (`{start_day, period_day}` — the LOAD-BEARING fields for 'you're on day N of your period'; computed by walking back through consecutive menstrual entries, NOT by computing days since the most recent log), `temperature_deviation_c` and `temperature_trend_deviation_c` (Oura, in °C from baseline; positive = above, negative = below), `staleness`, and `recent_phase_log`. Phases: menstrual, follicular, ovulation, luteal. Cycle physiology to respect when narrating: luteal runs +0.3-0.5°C above baseline; temperature DROPS at menstrual onset and is typically at/below baseline during menstruation — do NOT invert this. Pull this for any conversation about a female athlete's training response.",
    input_schema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "YYYY-MM-DD (optional; defaults to today)",
        },
      },
    },
  },
  {
    name: "get_goals",
    description:
      "Get the user's active goals (weight cut/bulk/maintain, Hyrox race prep, etc.) with deadlines and targets. Use this to align advice with what the athlete is actually working toward — never recommend a direction that conflicts with an active goal without flagging the conflict.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_pre_workout_fuel",
    description:
      "Compute what the user actually ate in the N hours before a specific workout, with meal-band handling for time-unknown entries. Returns totals (kcal/P/C/F), a per-item list with `gapHours` (min/max — exact for known-time entries, a range for time-unknown ones), `lastMealGapHours`, and `includesEstimated` (true when any item is band-only). This is the canonical answer for 'what did I eat before this workout?' — prefer it over reconstructing the calculation from `get_food_log`, because it already applies the breakfast/lunch/dinner band convention and handles workouts that span midnight. Default window is 4 hours.",
    input_schema: {
      type: "object",
      properties: {
        workout_id: {
          type: "string",
          description: "The HealthKitWorkout.id to fuel-window. Get this from get_workouts first if you don't have it.",
        },
        hours: {
          type: "number",
          description: "Lookback window in hours (default 4). Use 6 for big morning meals, 2 for tight pre-warmup checks.",
        },
      },
      required: ["workout_id"],
    },
  },
  // --- Hyrox-specific tools (phase 2, 2026-05-28) ---
  {
    name: "get_hyrox_plan",
    description:
      "Get the user's active Hyrox race prep plan: race date, target time, current block (accumulation/transmutation/realization/taper), weeks-into-block, weekly volume targets (run/strength/compromised hours). Returns null if no active plan. Use for ANY conversation about race readiness, taper protocol, pace pacing, or whether today fits the plan.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_hyrox_today",
    description:
      "Get today's recommended Hyrox session (title, prescription, duration, rationale, warnings) AND the days-to-race. The recommender already weighs readiness, sleep, HRV CV, cycle phase, and time-since-last-hard-session into the verdict. Use this when the user asks 'what should I do today?' or 'is today's plan still right given how I feel?'",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_hyrox_sessions",
    description:
      "Get logged HyroxSession records (compromised running, intervals, race simulations, etc.) over a date range. Returns each session's type, day, and any prescriptionNotes / rationale. Use for trending — has the user been hitting their weekly compromised-running target? Are they skipping intervals?",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "get_station_benchmarks",
    description:
      "Get the user's per-station Hyrox benchmark times (ski_erg, sled_push, sled_pull, burpee_broad_jump, row, farmers_carry, sandbag_lunges, wall_balls). Each station has 0+ benchmark records with timeSeconds and weightKg. Use to identify which station is the bottleneck for sub-target race time.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_race_brief",
    description:
      "Get the pace math derived from the target time: per-km run pace (e.g. 5:00/km for sub-85), per-station time budget (seconds allocated to each of the 8 stations), and total time accounting. Use when the user asks 'what splits do I need?' or 'how fast does my sled_push need to be?'. Pure derivation from the plan's target time — no DB writes.",
    input_schema: { type: "object", properties: {} },
  },
];

// --- Handlers ---

interface DateRangeInput {
  date?: unknown;
  start_date?: unknown;
  end_date?: unknown;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build [start, end) bounds for queries against real-timestamp fields
 * (HealthKitWorkout.startedAt, NutritionEntry.eatenAt, HeartRateSample.timestamp).
 * Anchored at LOCAL midnight so a YYYY-MM-DD parameter means the
 * user's local day — not UTC's day (which would slice a workout that
 * started at 8:33 PM EDT into the NEXT UTC day's bucket).
 */
function parseLocalDayBounds(
  input: DateRangeInput,
): { gte: Date; lt: Date } | null {
  if (typeof input.date === "string" && YMD_RE.test(input.date)) {
    const { start, end } = getLocalDayBounds(input.date);
    return { gte: start, lt: end };
  }
  if (
    typeof input.start_date === "string" &&
    typeof input.end_date === "string" &&
    YMD_RE.test(input.start_date) &&
    YMD_RE.test(input.end_date)
  ) {
    const { start } = getLocalDayBounds(input.start_date);
    const { end } = getLocalDayBounds(input.end_date);
    return { gte: start, lt: end };
  }
  return null;
}

/**
 * Build [day_start, day_after_end) bounds for queries against `day`-
 * keyed tables (NutritionLog.day, DailySleep.day, DailyReadiness.day,
 * CyclePhaseLog.day). These store UTC-midnight-of-local-day per the
 * app-wide convention. Exact-match lookups use dateStrToUTC for the
 * key value.
 */
function parseDayKeyBounds(
  input: DateRangeInput,
): { gte: Date; lt: Date } | null {
  const oneDayLater = (d: Date) => {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  };
  if (typeof input.date === "string" && YMD_RE.test(input.date)) {
    const d = dateStrToUTC(input.date);
    return { gte: d, lt: oneDayLater(d) };
  }
  if (
    typeof input.start_date === "string" &&
    typeof input.end_date === "string" &&
    YMD_RE.test(input.start_date) &&
    YMD_RE.test(input.end_date)
  ) {
    const s = dateStrToUTC(input.start_date);
    const e = dateStrToUTC(input.end_date);
    return { gte: s, lt: oneDayLater(e) };
  }
  return null;
}

async function handleFoodLog(input: DateRangeInput): Promise<unknown> {
  // NutritionLog.day is keyed by UTC-midnight-of-local-day, so use the
  // day-keyed bounds. Individual NutritionEntry.eatenAt timestamps are
  // returned as local-formatted strings (no UTC ISO so the model can't
  // misread the timezone).
  const bounds = parseDayKeyBounds(input);
  if (!bounds) {
    return {
      error:
        "Provide either `date` (YYYY-MM-DD) or both `start_date` and `end_date`.",
    };
  }
  const logs = await prisma.nutritionLog.findMany({
    where: { day: { gte: bounds.gte, lt: bounds.lt } },
    include: { entries: { orderBy: { eatenAt: "asc" } } },
    orderBy: { day: "asc" },
  });
  return logs.map((log) => ({
    date: formatLocalDate(log.day),
    totals: {
      calories: Math.round(log.calories),
      protein: Math.round(log.protein),
      carbs: Math.round(log.carbs),
      fat: Math.round(log.fat),
    },
    entries: log.entries.map((e) => ({
      eaten_at_local: e.timeUnknown ? null : formatLocalTime(e.eatenAt),
      time_unknown: e.timeUnknown,
      meal_type: e.mealType,
      description: e.description,
      food_name: e.foodName,
      calories: Math.round(e.calories),
      protein: Math.round(e.protein),
      carbs: Math.round(e.carbs),
      fat: Math.round(e.fat),
      source: e.source,
    })),
  }));
}

async function handleWorkouts(input: DateRangeInput): Promise<unknown> {
  // HealthKitWorkout.startedAt is a real timestamp — use local-day
  // bounds so the day param matches the user's calendar day, not UTC's.
  const bounds = parseLocalDayBounds(input);
  if (!bounds) {
    return {
      error:
        "Provide either `date` (YYYY-MM-DD) or both `start_date` and `end_date`.",
    };
  }
  const workouts = await prisma.healthKitWorkout.findMany({
    where: { startedAt: { gte: bounds.gte, lt: bounds.lt } },
    orderBy: { startedAt: "desc" },
  });
  return workouts.map((w) => ({
    id: w.id,
    name: w.name,
    source: w.source,
    started_at_local: formatLocalDateTime(w.startedAt),
    ended_at_local: formatLocalDateTime(w.endedAt),
    duration_min: Math.round(w.durationSeconds / 60),
    active_calories: w.activeCalories,
    distance: w.distance,
    distance_unit: w.distanceUnit,
    avg_heart_rate: w.avgHeartRate,
    max_heart_rate: w.maxHeartRate,
    min_heart_rate: w.minHeartRate,
  }));
}

async function handleWorkoutDetails(input: {
  workout_id?: unknown;
}): Promise<unknown> {
  if (typeof input.workout_id !== "string") {
    return { error: "Provide `workout_id` as a string." };
  }
  const workout = await prisma.healthKitWorkout.findUnique({
    where: { id: input.workout_id },
  });
  if (!workout) return { error: "Workout not found." };

  // Anchor cycle + temp lookups to the workout's LOCAL day (matches
  // how daily tables are keyed). Doing this here means the response
  // always carries live-derived period_day and temperature_deviation,
  // even when the WorkoutNote's frozen signalSnapshot was captured
  // before those fields existed. The May 27 puke note is the canonical
  // example: its snapshot says cyclePhase: "menstrual" with no day,
  // so the coach guessed "day 1" — adding live fields here lets the
  // model cite the correct day 6.
  const workoutLocalDay = new Date(
    Date.UTC(
      workout.startedAt.getFullYear(),
      workout.startedAt.getMonth(),
      workout.startedAt.getDate(),
    ),
  );
  const { resolveCyclePhase, findCurrentPeriodStart, getCurrentPeriodDay } =
    await import("@/lib/cycle-phase");
  const [hrStats, note, resolvedCycle, periodStart, periodDay, dayReadiness] =
    await Promise.all([
      prisma.heartRateSample.aggregate({
        where: {
          source: { startsWith: "apple" },
          timestamp: { gte: workout.startedAt, lte: workout.endedAt },
        },
        _avg: { bpm: true },
        _max: { bpm: true },
        _min: { bpm: true },
        _count: { _all: true },
      }),
      prisma.workoutNote.findUnique({
        where: {
          userId_workoutSource_workoutId: {
            userId: getCurrentUserId(),
            workoutSource: "healthkit",
            workoutId: workout.id,
          },
        },
      }),
      resolveCyclePhase(workoutLocalDay),
      findCurrentPeriodStart(workoutLocalDay),
      getCurrentPeriodDay(workoutLocalDay),
      prisma.dailyReadiness.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day: workoutLocalDay } } }),
    ]);

  return {
    workout: {
      id: workout.id,
      name: workout.name,
      source: workout.source,
      started_at_local: formatLocalDateTime(workout.startedAt),
      ended_at_local: formatLocalDateTime(workout.endedAt),
      duration_min: Math.round(workout.durationSeconds / 60),
      active_calories: workout.activeCalories,
      distance: workout.distance,
      distance_unit: workout.distanceUnit,
      avg_heart_rate: workout.avgHeartRate,
      max_heart_rate: workout.maxHeartRate,
      min_heart_rate: workout.minHeartRate,
    },
    hr_samples: {
      count: hrStats._count._all,
      avg: hrStats._avg.bpm != null ? Math.round(hrStats._avg.bpm) : null,
      max: hrStats._max.bpm ?? null,
      min: hrStats._min.bpm ?? null,
    },
    note: note
      ? {
          narrative: note.narrative,
          signal_snapshot: note.signalSnapshot
            ? safeParse(note.signalSnapshot)
            : null,
          created_at_local: formatLocalDateTime(note.createdAt),
          updated_at_local: formatLocalDateTime(note.updatedAt),
        }
      : null,
    /**
     * Live-derived cycle + temperature for the workout's local day.
     *
     * IMPORTANT for the model: prefer these fields over any cycle/temp
     * values nested inside `note.signal_snapshot`. The snapshot is
     * frozen at note-save time and historical snapshots are missing
     * these fields entirely (the schema was extended 2026-05-28). If
     * a conflict exists, the live fields are the source of truth —
     * they reflect the user's current best understanding of her cycle.
     *
     * Specifically for "day N of period" claims about a menstrual-
     * phase workout: ALWAYS cite `live_cycle.period_day` here, never
     * derive a day from `signal_snapshot.cyclePhase` alone (which
     * would always come out as "day 1" without an anchor).
     */
    live_cycle: {
      phase: resolvedCycle.phase,
      period_start_day: periodStart
        ? periodStart.toISOString().slice(0, 10)
        : null,
      period_day:
        resolvedCycle.phase === "menstrual" ? periodDay : null,
      is_stale: resolvedCycle.isStale,
      staleness_days_ago: resolvedCycle.lastLoggedDaysAgo,
    },
    /**
     * Temperature deviation from baseline (Oura), in °C. Positive =
     * above baseline (typical for luteal); negative = below (typical
     * for menstrual onset). Cite the actual number; do not paraphrase
     * to "elevated" or "lower" without the value. Cycle physiology:
     * luteal = +0.3-0.5°C; menstrual = at or below baseline. Do NOT
     * claim "temp runs higher during menstruation" — inverted.
     */
    live_temperature: {
      deviation_c: dayReadiness?.temperatureDeviation ?? null,
      trend_deviation_c: dayReadiness?.temperatureTrendDeviation ?? null,
    },
  };
}

async function handleSignals(input: { date?: unknown }): Promise<unknown> {
  if (typeof input.date !== "string" || !YMD_RE.test(input.date)) {
    return { error: "Provide `date` as YYYY-MM-DD." };
  }
  // dailySleep / dailyReadiness / dailyStress are day-keyed (UTC-
  // midnight-of-local-day). Use dateStrToUTC for the exact key value.
  const day = dateStrToUTC(input.date);
  const sevenDaysAgo = new Date(day.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [sleep, readiness, stress, recentSleep] = await Promise.all([
    prisma.dailySleep.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day } } }),
    prisma.dailyReadiness.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day } } }),
    prisma.dailyStress.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day } } }),
    prisma.dailySleep.findMany({
      where: { day: { gte: sevenDaysAgo, lte: day } },
      orderBy: { day: "desc" },
      select: { averageHrv: true },
    }),
  ]);

  const hrvValues = recentSleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null && v > 0);
  const hrv_cv = hrvCV(hrvValues);

  let baseline_score: number | null = null;
  try {
    const { getScoreForDate } = await import("@/lib/baseline-score");
    const score = await getScoreForDate(day);
    baseline_score = score?.overall ?? null;
  } catch {
    baseline_score = null;
  }

  return {
    date: input.date,
    hrv_overnight_ms: sleep?.averageHrv ?? null,
    hrv_cv_percent: hrv_cv != null ? Math.round(hrv_cv * 10) / 10 : null,
    sleep: sleep
      ? {
          score: sleep.score,
          total_duration_sec: sleep.totalSleepDuration,
          rem_sec: sleep.remSleepDuration,
          deep_sec: sleep.deepSleepDuration,
          light_sec: sleep.lightSleepDuration,
          efficiency: sleep.sleepEfficiency,
          lowest_hr: sleep.lowestHeartRate,
        }
      : null,
    readiness: readiness?.score ?? null,
    baseline_composite_score: baseline_score,
    stress: stress
      ? {
          summary: stress.daySummary,
          high_seconds: stress.stressHigh,
          recovery_seconds: stress.recoveryHigh,
        }
      : null,
  };
}

async function handleCycle(input: { date?: unknown }): Promise<unknown> {
  // CyclePhaseLog.day is day-keyed (UTC-midnight-of-local-day).
  let target: Date;
  if (typeof input.date === "string") {
    if (!YMD_RE.test(input.date)) {
      return { error: "Date must be YYYY-MM-DD." };
    }
    target = dateStrToUTC(input.date);
  } else {
    const now = new Date();
    target = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
  }

  const { resolveCyclePhase, findCurrentPeriodStart, getCurrentPeriodDay } =
    await import("@/lib/cycle-phase");
  const [resolved, recent, periodStart, periodDay, readiness] = await Promise.all([
    // Staleness-guarded — phase will be null when the last log is
    // older than its max-days cap. We still surface the raw
    // last-logged info so the model can tell the user "data is
    // stale, log current phase" rather than inventing a current one.
    resolveCyclePhase(target),
    prisma.cyclePhaseLog.findMany({
      where: {
        day: {
          gte: new Date(target.getTime() - 60 * 24 * 60 * 60 * 1000),
          lte: target,
        },
      },
      orderBy: { day: "desc" },
      take: 10,
    }),
    // Earliest day of the consecutive menstrual streak ending on/before
    // `target` — the right anchor for "day N of your period."
    findCurrentPeriodStart(target),
    getCurrentPeriodDay(target),
    // Daily temperature deviation from Oura — load-bearing for the
    // physiological story (luteal: elevated; menstrual onset: drops
    // 0.3-0.5°C). Without this in the tool result the model invents
    // numbers like "0.3-0.5°C higher" without checking the actual log.
    prisma.dailyReadiness.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day: target } } }),
  ]);

  return {
    target_date: target.toISOString().slice(0, 10),
    // `active_phase` is non-null ONLY when the resolver accepted the
    // log (not stale). When stale, active_phase is null AND
    // `staleness` carries the "last logged N days ago" detail.
    active_phase: resolved.phase && resolved.loggedDay
      ? { day: resolved.loggedDay.toISOString().slice(0, 10), phase: resolved.phase }
      : null,
    // Current period anchor — only present when phase is "menstrual"
    // and there is a streak of consecutive menstrual logs ending at
    // or before `target`. `period_day` is 1-indexed from the streak's
    // earliest day. This is the load-bearing field for "you're on day
    // N of your period" — do NOT compute day-of-period from
    // `active_phase.day`; that's always day 1.
    current_period: resolved.phase === "menstrual" && periodStart && periodDay
      ? {
          start_day: periodStart.toISOString().slice(0, 10),
          period_day: periodDay,
        }
      : null,
    // Temperature deviation from baseline in °C (Oura). Positive =
    // above baseline, negative = below. Physiology to respect when
    // narrating this: luteal phase runs +0.3-0.5°C above baseline;
    // temperature DROPS at menstrual onset and is typically at or
    // below baseline during menstruation. Do NOT claim "temp runs
    // higher during menstruation" — that's the inverted version of
    // the actual cycle physiology.
    temperature_deviation_c: readiness?.temperatureDeviation ?? null,
    temperature_trend_deviation_c: readiness?.temperatureTrendDeviation ?? null,
    staleness: resolved.phase
      ? null
      : {
          last_logged_phase: resolved.lastLoggedPhase,
          last_logged_days_ago: resolved.lastLoggedDaysAgo,
          message:
            resolved.lastLoggedPhase != null
              ? `Cycle phase data is stale (last logged ${resolved.lastLoggedDaysAgo} days ago as ${resolved.lastLoggedPhase}). Do not extrapolate a current phase or cycle-day count from this anchor. Tell the user to log their current phase for accurate cycle-aware advice.`
              : "No cycle phase has ever been logged. Tell the user to log their current phase if cycle-aware advice is relevant to their question.",
        },
    recent_phase_log: recent.map((r) => ({
      day: r.day.toISOString().slice(0, 10),
      phase: r.phase,
    })),
  };
}

async function handleGoals(): Promise<unknown> {
  const goals = await prisma.goal.findMany({
    where: { status: "active" },
    orderBy: [{ isPrimary: "desc" }, { deadline: "asc" }],
  });
  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    type: g.type,
    subtype: g.subtype,
    target: g.target,
    deadline: g.deadline?.toISOString() ?? null,
    is_primary: g.isPrimary,
  }));
}

interface PreWorkoutFuelInput {
  workout_id?: unknown;
  hours?: unknown;
}

async function handlePreWorkoutFuel(
  input: PreWorkoutFuelInput,
): Promise<unknown> {
  const workoutId = typeof input.workout_id === "string" ? input.workout_id : null;
  if (!workoutId) {
    return { error: "workout_id (string) is required." };
  }
  // hours defaults to 4 — matches the helper's default and is the
  // standard pre-workout fueling window for endurance.
  const hours =
    typeof input.hours === "number" && Number.isFinite(input.hours) && input.hours > 0
      ? input.hours
      : 4;
  const workout = await prisma.healthKitWorkout.findUnique({
    where: { id: workoutId },
  });
  if (!workout) {
    return { error: `No workout with id ${workoutId}.` };
  }
  const fuel = await getPreWorkoutFuel(workout.startedAt, hours);
  // Return the structured object directly so the model can both
  // narrate it and quote specific numbers.
  return {
    workout_id: workout.id,
    workout_name: workout.name,
    workout_start_local: fuel.workoutStartLocal,
    window_hours: fuel.windowHours,
    totals: fuel.totals,
    last_meal_gap_hours: fuel.lastMealGapHours,
    last_meal_gap_is_estimated: fuel.includesEstimated,
    items: fuel.items.map((i) => ({
      description: i.description,
      meal_type: i.mealType,
      time_known: i.timeKnown,
      time_label: i.timeLabel,
      gap_hours_min: i.gapHours.min,
      gap_hours_max: i.gapHours.max,
      calories: Math.round(i.calories),
      protein: Math.round(i.protein),
      carbs: Math.round(i.carbs),
      fat: Math.round(i.fat),
    })),
  };
}

// --- Hyrox handlers ---

async function handleHyroxPlan(): Promise<unknown> {
  const plan = await prisma.hyroxPlan.findFirst({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
  });
  if (!plan) return { plan: null, message: "No active Hyrox plan." };
  return {
    plan: {
      id: plan.id,
      goal_id: plan.goalId,
      race_date_local: formatLocalDate(plan.raceDate),
      target_time_seconds: plan.targetTime,
      target_time_label: `${Math.floor(plan.targetTime / 60)}:${String(plan.targetTime % 60).padStart(2, "0")}`,
      current_block: plan.currentBlock,
      block_start_local: formatLocalDate(plan.blockStartDate),
      start_local: formatLocalDate(plan.startDate),
      weekly_run_hours: plan.weeklyRunHours,
      weekly_strength_hours: plan.weeklyStrengthHours,
      weekly_compromised_hours: plan.weeklyCompromisedHours,
      block_schedule_days: {
        accumulation: plan.accumulationDays,
        transmutation: plan.transmutationDays,
        realization: plan.realizationDays,
        taper: plan.taperDays,
      },
    },
  };
}

async function handleHyroxToday(): Promise<unknown> {
  const today = await getHyroxToday(new Date());
  if (!today) return { recommendation: null, message: "No active Hyrox plan." };
  return {
    days_to_race: today.recommendation.daysToRace,
    race_date_local: formatLocalDate(today.raceDate),
    current_block: today.recommendation.block,
    week_in_block: today.recommendation.weekInBlock,
    recommendation: {
      session_type: today.recommendation.sessionType,
      title: today.recommendation.title,
      prescription: today.recommendation.prescription,
      duration_min: today.recommendation.durationMin,
      rationale: today.recommendation.rationale,
      warnings: today.recommendation.warnings,
    },
    context: today.context,
  };
}

async function handleHyroxSessions(input: DateRangeInput): Promise<unknown> {
  const bounds = parseLocalDayBounds(input);
  if (!bounds) {
    return {
      error:
        "Provide both `start_date` and `end_date` (YYYY-MM-DD).",
    };
  }
  const sessions = await prisma.hyroxSession.findMany({
    where: { day: { gte: bounds.gte, lt: bounds.lt } },
    orderBy: { day: "desc" },
  });
  return sessions.map((s) => ({
    id: s.id,
    day_local: formatLocalDate(s.day),
    session_type: s.sessionType,
    prescription_notes: s.prescriptionNotes,
    rationale: s.rationale,
  }));
}

async function handleStationBenchmarks(): Promise<unknown> {
  const plan = await prisma.hyroxPlan.findFirst({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
  });
  if (!plan) return { benchmarks: [], message: "No active Hyrox plan." };
  const benchmarks = await prisma.hyroxStationBenchmark.findMany({
    where: { planId: plan.id },
    orderBy: [{ station: "asc" }, { recordedAt: "desc" }],
  });
  // Group by station so the model sees each station's history together.
  const byStation: Record<
    string,
    Array<{
      time_seconds: number;
      time_label: string;
      weight_kg: number | null;
      recorded_at_local: string;
      notes: string | null;
    }>
  > = {};
  for (const b of benchmarks) {
    const sec = b.timeSeconds;
    const label = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    (byStation[b.station] ??= []).push({
      time_seconds: sec,
      time_label: label,
      weight_kg: b.weightKg,
      recorded_at_local: formatLocalDateTime(b.recordedAt),
      notes: b.notes,
    });
  }
  return byStation;
}

async function handleRaceBrief(): Promise<unknown> {
  const plan = await prisma.hyroxPlan.findFirst({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
  });
  if (!plan) return { brief: null, message: "No active Hyrox plan." };
  const budget = computePaceBudget(plan.targetTime);
  return {
    target_time_seconds: plan.targetTime,
    target_time_label: `${Math.floor(plan.targetTime / 60)}:${String(plan.targetTime % 60).padStart(2, "0")}`,
    km_pace: {
      seconds_per_km: budget.kmPaceSeconds,
      label: `${formatKmPace(budget.kmPaceSeconds)}/km`,
    },
    station_budgets: budget.perStationBudget,
    total_seconds: budget.totalSeconds,
    station_seconds: budget.stationSeconds,
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Dispatch a tool call from /api/coach's tool-use loop. Returns a
 * JSON-stringified result that gets fed back to Claude as a
 * tool_result. Errors are returned as `{ error: string }` payloads so
 * the model can recover gracefully (try a different date, fall back
 * to a different tool) rather than failing the conversation.
 */
export async function runCoachTool(
  name: string,
  input: unknown,
): Promise<string> {
  const args = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  try {
    switch (name) {
      case "get_food_log":
        return JSON.stringify(await handleFoodLog(args));
      case "get_workouts":
        return JSON.stringify(await handleWorkouts(args));
      case "get_workout_details":
        return JSON.stringify(await handleWorkoutDetails(args));
      case "get_signals":
        return JSON.stringify(await handleSignals(args));
      case "get_cycle":
        return JSON.stringify(await handleCycle(args));
      case "get_goals":
        return JSON.stringify(await handleGoals());
      case "get_pre_workout_fuel":
        return JSON.stringify(await handlePreWorkoutFuel(args));
      case "get_hyrox_plan":
        return JSON.stringify(await handleHyroxPlan());
      case "get_hyrox_today":
        return JSON.stringify(await handleHyroxToday());
      case "get_hyrox_sessions":
        return JSON.stringify(await handleHyroxSessions(args));
      case "get_station_benchmarks":
        return JSON.stringify(await handleStationBenchmarks());
      case "get_race_brief":
        return JSON.stringify(await handleRaceBrief());
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Tool '${name}' failed: ${message}` });
  }
}
