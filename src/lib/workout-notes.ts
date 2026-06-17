import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { classifyNarrative } from "@/lib/gi-classifier";

/**
 * Classify a narrative into the WorkoutNote gi* fields at write-time, so new
 * notes are labeled the moment they're saved (the meal->GI analyzer reads
 * these). Fail-safe: if the classifier errors (e.g. Anthropic hiccup), returns
 * an unlabeled set so saving a note NEVER fails because of GI classification.
 * The keyword pre-filter in gi-classifier means most saves cost zero API calls.
 */
export async function classifyGiFields(narrative: string) {
  try {
    const c = await classifyNarrative(narrative);
    return {
      giOutcome: c.outcome,
      giConfidence: c.confidence,
      giEvidence: c.evidence || null,
      giNeedsReview: c.needsReview,
    };
  } catch {
    return {
      giOutcome: null,
      giConfidence: null,
      giEvidence: null,
      giNeedsReview: false,
    };
  }
}

/**
 * Helpers for the WorkoutNote feature.
 *
 * - `getWorkoutByIdAndSource` — fetches a workout by polymorphic
 *   (source, id) so the API can validate that the target workout
 *   exists before creating/updating a note for it.
 * - `captureSignalsForDate` — snapshots the day's signals into a JSON-
 *   stringifiable object. Used at note-create time to freeze the
 *   relevant context so future analysis isn't surprised by later
 *   data changes (e.g. corrected HRV after a late sync).
 */

export type WorkoutSource = "healthkit" | "oura";

export function isValidWorkoutSource(s: unknown): s is WorkoutSource {
  return s === "healthkit" || s === "oura";
}

export interface ResolvedWorkout {
  source: WorkoutSource;
  id: string;
  name: string;
  startedAt: Date;
  durationSeconds: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  /** UTC midnight of the workout's local day (matches NutritionLog.day pattern) */
  workoutDate: Date;
}

/**
 * Strip a Date to UTC midnight of its LOCAL calendar day. Mirrors how
 * the rest of the app stores `day` fields (UTC-midnight-of-the-local-
 * date, the SQLite-friendly daily-bucket convention).
 *
 * Bug history (2026-05-27): an earlier version used `getUTCDate()`
 * here, which rolled late-evening EDT workouts into the next UTC day.
 * A workout starting at 8:33 PM EDT (00:33 UTC) resolved to May 28,
 * but the user's dailySleep / dailyReadiness / dailyStress rows for
 * that same physical day were keyed to May 27. Exact-day lookups
 * returned null and the AI analysis correctly reported "physiological
 * signals are absent." Switching to local getters (getFullYear /
 * getMonth / getDate) anchors the bucket to the workout's local date,
 * matching the daily tables.
 */
function toUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export async function getWorkoutByIdAndSource(
  source: WorkoutSource,
  id: string,
): Promise<ResolvedWorkout | null> {
  if (source === "healthkit") {
    const w = await prisma.healthKitWorkout.findUnique({ where: { id } });
    if (!w) return null;
    return {
      source: "healthkit",
      id: w.id,
      name: w.name,
      startedAt: w.startedAt,
      durationSeconds: w.durationSeconds,
      avgHeartRate: w.avgHeartRate ?? null,
      maxHeartRate: w.maxHeartRate ?? null,
      workoutDate: toUtcMidnight(w.startedAt),
    };
  }
  const s = await prisma.ouraSession.findUnique({ where: { id } });
  if (!s) return null;
  return {
    source: "oura",
    id: s.id,
    name: s.type,
    startedAt: s.startedAt,
    durationSeconds: s.durationSeconds,
    avgHeartRate: s.avgHeartRate != null ? Math.round(s.avgHeartRate) : null,
    maxHeartRate: null,
    workoutDate: toUtcMidnight(s.startedAt),
  };
}

export interface SignalSnapshot {
  /** Overnight HRV in ms, single-night value (NOT to be confused with hrvCv) */
  hrv: number | null;
  /** HRV coefficient of variation over the trailing 7-day window, as a
   *  percentage. >10% suggests autonomic instability / overreaching
   *  (Flatt & Esco 2016). This is the metric Baseline's training-call
   *  logic uses, not the raw hrv ms value. */
  hrvCv: number | null;
  sleepScore: number | null;
  sleepDurationSec: number | null;
  /** Baseline-proprietary composite score (0-100). Combines readiness,
   *  HRV trend, sleep quality, temp deviation. NOT the same as
   *  readinessScore — those are independent numbers. */
  baselineScore: number | null;
  /** Oura Readiness score (0-100). Computed by Oura. */
  readinessScore: number | null;
  stressSummary: string | null;
  /**
   * Cycle phase active on this day, or null when staleness guard
   * rejected the lookup (see resolveCyclePhase). Do NOT treat a stale
   * log as authoritative — `cyclePhaseStaleDays` carries the "last
   * logged N days ago" detail for staleness-aware prompts.
   */
  cyclePhase: string | null;
  /**
   * Days since the most recent CyclePhaseLog entry on or before this
   * day. Surfaced even when `cyclePhase` is null so downstream
   * prompts/UI can say "last logged N days ago — log current phase
   * for accuracy" instead of silently dropping the field.
   */
  cyclePhaseStaleDays: number | null;
  /** The raw most-recent phase logged, even if stale. Use only for
   *  staleness-aware copy; do NOT treat as active. */
  cyclePhaseLastLogged: string | null;
  /**
   * Day within the current period (1-indexed from the earliest day
   * of the consecutive menstrual streak ending on or before this
   * day). Null when not in menstrual phase or when no streak ends
   * here. Use this when narrating "day N of period" — never compute
   * it from `cyclePhase` + a single log entry, which always returns
   * day 1 (verified bug 2026-05-28: coach said "day 2" for what was
   * actually day 6).
   */
  periodDay: number | null;
  /**
   * Daily temperature deviation from the user's baseline, in °C
   * (Oura). Positive = above baseline, negative = below. Load-bearing
   * for any cycle narrative — luteal runs ~+0.3-0.5°C; temp DROPS at
   * menstrual onset and is at/below baseline during menstruation.
   * Snapshot this so the analyze endpoint can cite the actual value
   * instead of inventing one.
   */
  temperatureDeviationC: number | null;
  /** 7-day temperature trend deviation (Oura), in °C. */
  temperatureTrendDeviationC: number | null;
  capturedAt: string; // ISO timestamp
}

/**
 * Snapshot today's signals for the workout's local day. Each lookup is
 * defensive — missing data is fine; we just record null for that field.
 * The snapshot is intended to be JSON-stringified into
 * WorkoutNote.signalSnapshot at create time.
 */
export async function captureSignalsForDate(day: Date): Promise<SignalSnapshot> {
  const utcDay = toUtcMidnight(day);

  // Pull trailing 7-day sleep window so we can compute HRV CV — the
  // metric the training-call logic actually uses (raw single-night HRV
  // is misleading on its own).
  const sevenDaysAgo = new Date(utcDay.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { resolveCyclePhase, getCurrentPeriodDay } = await import(
    "@/lib/cycle-phase"
  );
  const [sleep, readiness, stress, phase, periodDay, recentSleep] =
    await Promise.all([
      prisma.dailySleep.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day: utcDay } } }),
      prisma.dailyReadiness.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day: utcDay } } }),
      prisma.dailyStress.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day: utcDay } } }),
      // Staleness-guarded — returns phase: null when the most recent
      // log is older than its phase's max-days cap. Prevents the May 27
      // bug where a 32-day-old "menstrual" log got echoed as current.
      resolveCyclePhase(utcDay),
      // Walked-back period day so signal snapshots carry the right
      // anchor at write time. Without this, the analyze prompt has to
      // re-derive day-of-period and the model invents wrong numbers.
      getCurrentPeriodDay(utcDay),
      prisma.dailySleep.findMany({
        where: { day: { gte: sevenDaysAgo, lte: utcDay } },
        orderBy: { day: "desc" },
        select: { averageHrv: true },
      }),
    ]);

  // Baseline score has its own derivation — import lazily to keep this
  // helper free of heavy circular deps if the score lib grows.
  let baselineScore: number | null = null;
  try {
    const { getScoreForDate } = await import("@/lib/baseline-score");
    const score = await getScoreForDate(utcDay);
    baselineScore = score?.overall ?? null;
  } catch {
    baselineScore = null;
  }

  // HRV CV — coefficient of variation over the trailing window.
  let hrvCv: number | null = null;
  try {
    const { hrvCV } = await import("@/lib/training");
    const values = recentSleep
      .map((s) => s.averageHrv)
      .filter((v): v is number => v != null && v > 0);
    hrvCv = hrvCV(values);
  } catch {
    hrvCv = null;
  }

  return {
    hrv: sleep?.averageHrv ?? null,
    hrvCv: hrvCv != null ? Math.round(hrvCv * 10) / 10 : null,
    sleepScore: sleep?.score ?? null,
    sleepDurationSec: sleep?.totalSleepDuration ?? null,
    baselineScore,
    readinessScore: readiness?.score ?? null,
    stressSummary: stress?.daySummary ?? null,
    cyclePhase: phase.phase,
    cyclePhaseStaleDays: phase.lastLoggedDaysAgo,
    cyclePhaseLastLogged: phase.lastLoggedPhase,
    periodDay: phase.phase === "menstrual" ? periodDay : null,
    temperatureDeviationC: readiness?.temperatureDeviation ?? null,
    temperatureTrendDeviationC: readiness?.temperatureTrendDeviation ?? null,
    capturedAt: new Date().toISOString(),
  };
}

export interface HrChartPoint {
  /** Milliseconds since epoch (serializable across the RSC boundary). */
  t: number;
  bpm: number;
}

/**
 * Fetch HR samples for a workout window and downsample to a target
 * point count for sparkline-style rendering. 877 raw samples over a
 * 75-min workout would render fine but is wasteful — ~100 points is
 * plenty for a small chart and keeps the client JSON payload tiny.
 *
 * Bucket-average rather than naive every-Nth sampling so spikes don't
 * disappear if they happen to land between picks.
 */
export async function getDownsampledHrForWorkout(
  startedAt: Date,
  endedAt: Date,
  targetCount = 100,
): Promise<HrChartPoint[]> {
  const samples = await prisma.heartRateSample.findMany({
    where: {
      source: { startsWith: "apple" },
      timestamp: { gte: startedAt, lte: endedAt },
    },
    orderBy: { timestamp: "asc" },
    select: { timestamp: true, bpm: true },
  });

  if (samples.length === 0) return [];
  if (samples.length <= targetCount) {
    return samples.map((s) => ({ t: s.timestamp.getTime(), bpm: s.bpm }));
  }

  const bucketSize = Math.ceil(samples.length / targetCount);
  const out: HrChartPoint[] = [];
  for (let i = 0; i < samples.length; i += bucketSize) {
    const bucket = samples.slice(i, i + bucketSize);
    const sum = bucket.reduce((acc, s) => acc + s.bpm, 0);
    const mid = bucket[Math.floor(bucket.length / 2)];
    out.push({
      t: mid.timestamp.getTime(),
      bpm: Math.round(sum / bucket.length),
    });
  }
  return out;
}
