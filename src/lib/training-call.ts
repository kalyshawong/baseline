/**
 * Server-side data assembly for the integrated training call.
 *
 * Both the dashboard hero and the /body page need the same verdict. Rather
 * than each page replicating the data fetching, this module owns it. /body
 * may also build the call inline (it already has the data); this module
 * gives the dashboard a one-liner.
 */

import { prisma } from "./db";
import { getCurrentUserId } from "./current-user";
import { getScoreForDate } from "./baseline-score";
import {
  computeTrainingCall,
  computeFatigueScore,
  detectRpeCreep,
  hrvCV,
  rollingHrvCvBaseline,
  isHrvCvElevated,
  hrvCvThreshold,
  FLAT_HRV_CV_THRESHOLD,
  volumeZones,
  compoundContributions,
  type TrainingCall,
  type HrvCvBaseline,
} from "./training";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export async function getTrainingCallForDate(
  forDate: Date
): Promise<TrainingCall | null> {
  // Score for the day (primary signal)
  const score = await getScoreForDate(forDate);

  // Cycle phase active on this date — staleness-guarded so a
  // month-old log doesn't drive a current-day training call.
  const { resolveCyclePhase } = await import("@/lib/cycle-phase");
  const cycle = await resolveCyclePhase(forDate);

  // Acute stress for the day
  const dayStress = await prisma.dailyStress.findUnique({
    where: { userId_day: { userId: getCurrentUserId(), day: forDate } },
  });

  // Recent sleep for HRV CV + fatigue signals
  const sevenDaysAgo = new Date(forDate.getTime() - SEVEN_DAYS_MS);
  const recentSleep = await prisma.dailySleep.findMany({
    where: { day: { gte: sevenDaysAgo, lte: forDate } },
    orderBy: { day: "desc" },
    take: 7,
  });

  // HRV CV from the recent sleep window
  const hrvValues = recentSleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const hrvCv = hrvCV(hrvValues);

  // Personal CV baseline from a longer history, so "elevated" means "high
  // for her," not "above a flat 10%." See rollingHrvCvBaseline for why.
  const sixtyDaysAgoForCv = new Date(forDate.getTime() - SIXTY_DAYS_MS);
  const baselineSleep = await prisma.dailySleep.findMany({
    where: { day: { gte: sixtyDaysAgoForCv, lte: forDate }, averageHrv: { not: null } },
    orderBy: { day: "desc" },
    take: 60,
    select: { averageHrv: true },
  });
  const personalBaseline = rollingHrvCvBaseline(
    baselineSleep
      .map((s) => s.averageHrv)
      .filter((v): v is number => v != null)
  );
  // Respect her calibration choice: "standard" reverts to the flat 10%
  // threshold (baseline = null), "personalized"/"pending" use her own baseline.
  const choice = await getHrvBaselineChoice();
  const hrvCvBaseline = choice === "standard" ? null : personalBaseline;
  const hrvCvElevated = isHrvCvElevated(hrvCv, hrvCvBaseline);

  // HRV below baseline (last 2 days under mean - 1 stddev)
  const hrvMean =
    hrvValues.length >= 5
      ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
      : null;
  const hrvStdDev =
    hrvMean != null && hrvValues.length >= 5
      ? Math.sqrt(
          hrvValues.reduce((s, v) => s + (v - hrvMean) ** 2, 0) /
            (hrvValues.length - 1)
        )
      : null;
  const recentHrv2 = hrvValues.slice(0, 2);
  const hrvBelowBaseline =
    hrvMean != null &&
    hrvStdDev != null &&
    recentHrv2.length === 2 &&
    recentHrv2.every((v) => v < hrvMean - hrvStdDev);

  // Resting HR elevated (last 3 days above mean + 5)
  const lowestHR = recentSleep
    .map((s) => s.lowestHeartRate)
    .filter((v): v is number => v != null);
  const rhrMean =
    lowestHR.length >= 5 ? lowestHR.reduce((a, b) => a + b, 0) / lowestHR.length : null;
  const rhrElevated =
    rhrMean != null &&
    lowestHR.slice(0, 3).length === 3 &&
    lowestHR.slice(0, 3).every((v) => v > rhrMean + 5);

  // Sleep quality decline (3 consecutive nights with score < 70)
  const sleepQualityDecline = recentSleep
    .slice(0, 3)
    .every((s) => (s.score ?? 100) < 70);

  // Weekly volume vs MRV (overreaching marker)
  const weekStart = new Date(forDate);
  const dow = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - (dow - 1));
  const weekSets = await prisma.workoutSet.findMany({
    where: { isWarmup: false, session: { date: { gte: weekStart, lte: forDate } } },
    include: { exercise: true },
  });
  const muscleSets: Record<string, number> = {};
  for (const group of Object.keys(volumeZones)) muscleSets[group] = 0;
  for (const set of weekSets) {
    const contributions =
      compoundContributions[set.exercise.name] ?? [set.exercise.muscleGroup];
    for (const mg of contributions) {
      if (muscleSets[mg] !== undefined) muscleSets[mg] += 1;
    }
  }
  const volumeApproachingMRV = Object.entries(muscleSets).some(
    ([group, sets]) => sets >= volumeZones[group].mrv * 0.9
  );

  // RPE creep (any exercise where load is flat and RPE has climbed >= 1)
  const sixtyDaysAgo = new Date(forDate.getTime() - SIXTY_DAYS_MS);
  const allRecentSets = await prisma.workoutSet.findMany({
    where: {
      isWarmup: false,
      session: { date: { gte: sixtyDaysAgo, lte: forDate } },
    },
    include: { exercise: true, session: { select: { date: true } } },
    orderBy: { createdAt: "desc" },
  });
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

  // Weeks since last deload (consecutive weeks with a workout session)
  const allSessions = await prisma.workoutSession.findMany({
    where: { completedAt: { not: null }, date: { lte: forDate } },
    orderBy: { date: "desc" },
    select: { date: true },
    take: 60,
  });
  let weeksSinceDeload = 0;
  if (allSessions.length > 0) {
    const weekSet = new Set<string>();
    for (const s of allSessions) {
      const d = s.date;
      const dayOfWeek = d.getUTCDay() || 7;
      const ws = new Date(d);
      ws.setUTCDate(d.getUTCDate() - (dayOfWeek - 1));
      weekSet.add(ws.toISOString().split("T")[0]);
    }
    const sortedWeeks = Array.from(weekSet).sort().reverse();
    for (let i = 0; i < sortedWeeks.length; i++) {
      if (i === 0) {
        weeksSinceDeload++;
        continue;
      }
      const prev = new Date(sortedWeeks[i - 1] + "T00:00:00Z");
      const curr = new Date(sortedWeeks[i] + "T00:00:00Z");
      const diff = (prev.getTime() - curr.getTime()) / (7 * 24 * 3600 * 1000);
      if (Math.abs(diff - 1) < 0.5) weeksSinceDeload++;
      else break;
    }
  }

  const { score: fatigueScore } = computeFatigueScore({
    weeksSinceLastDeload: weeksSinceDeload,
    hrvBelowBaseline,
    hrvCvElevated,
    sleepQualityDecline,
    rhrElevated,
    rpeCreep: anyRpeCreep,
    volumeApproachingMRV,
  });

  return computeTrainingCall({
    baselineScore: score?.overall ?? null,
    cyclePhase: cycle.phase,
    hrvCv,
    hrvCvBaseline,
    fatigueScore,
    stressSummary: dayStress?.daySummary ?? null,
  });
}

export type HrvBaselineChoice = "pending" | "personalized" | "standard";

/** Her saved HRV-calibration choice from UserProfile, defaulting to "pending"
 *  (treated as personalized until she answers the prompt). */
export async function getHrvBaselineChoice(): Promise<HrvBaselineChoice> {
  const p = await prisma.userProfile.findUnique({
    where: { userId: getCurrentUserId() },
    select: { hrvBaselineChoice: true },
  });
  const c = p?.hrvBaselineChoice;
  return c === "standard" || c === "personalized" ? c : "pending";
}

export interface HrvCvSignals {
  /** Short-window (7-night) HRV CV %, sample-SD. Null when <3 nights. */
  hrvCv: number | null;
  /** Personal rolling-CV baseline; null when "standard" or too little history. */
  hrvCvBaseline: HrvCvBaseline | null;
  /** Overnight HRV itself trending below baseline (last 2 nights < mean-1SD). */
  hrvBelowBaseline: boolean | null;
}

/**
 * The HRV-CV signal bundle consumers need to judge overreaching *for her*:
 * today's short-window CV, her personal rolling-CV baseline (mean + 1 SD via
 * {@link hrvCvThreshold}), and whether overnight HRV itself is below baseline.
 *
 * Centralized so every surface — the integrated training call, the Hyrox
 * recommender, and the coach tradeoff detector — judges CV against HER baseline
 * rather than a flat 10%, and treats CV as a corroborating signal rather than a
 * solo trigger. CV on her low (~20ms), HR-coupled HRV is mechanically inflated,
 * so a flat threshold reads "overreaching" almost every day. Self-contained:
 * does its own queries so callers stay consistent.
 */
export async function computeHrvCvSignals(
  forDate: Date = new Date(),
): Promise<HrvCvSignals> {
  const sevenDaysAgo = new Date(forDate.getTime() - SEVEN_DAYS_MS);
  const sixtyDaysAgo = new Date(forDate.getTime() - SIXTY_DAYS_MS);

  const [recentSleeps, baselineSleeps, choice] = await Promise.all([
    prisma.dailySleep.findMany({
      where: {
        day: { gte: sevenDaysAgo, lte: forDate },
        averageHrv: { not: null },
      },
      orderBy: { day: "desc" },
      take: 7,
      select: { averageHrv: true },
    }),
    prisma.dailySleep.findMany({
      where: {
        day: { gte: sixtyDaysAgo, lte: forDate },
        averageHrv: { not: null },
      },
      orderBy: { day: "desc" },
      take: 60,
      select: { averageHrv: true },
    }),
    getHrvBaselineChoice(),
  ]);

  const hrvValues = recentSleeps
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const hrvCv = hrvCV(hrvValues);

  // "Elevated for her," not "above flat 10%." Respect her calibration choice:
  // "standard" reverts to the flat threshold (baseline = null).
  const personalBaseline = rollingHrvCvBaseline(
    baselineSleeps
      .map((s) => s.averageHrv)
      .filter((v): v is number => v != null),
  );
  const hrvCvBaseline = choice === "standard" ? null : personalBaseline;

  // HRV below baseline: last 2 nights both under mean - 1 SD (same rule the
  // training call uses). Needs >=5 nights to define a mean/SD; otherwise null.
  const hrvMean =
    hrvValues.length >= 5
      ? hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length
      : null;
  const hrvStdDev =
    hrvMean != null
      ? Math.sqrt(
          hrvValues.reduce((s, v) => s + (v - hrvMean) ** 2, 0) /
            (hrvValues.length - 1),
        )
      : null;
  const recentHrv2 = hrvValues.slice(0, 2);
  const hrvBelowBaseline =
    hrvMean != null && hrvStdDev != null && recentHrv2.length === 2
      ? recentHrv2.every((v) => v < hrvMean - hrvStdDev)
      : null;

  return { hrvCv, hrvCvBaseline, hrvBelowBaseline };
}

export interface HrvBaselineSummary {
  /** Her overnight HRV set-point (mean), ms. */
  meanMs: number;
  /** Low end of her normal night-to-night range, ms. */
  minMs: number;
  /** High end of her normal night-to-night range, ms. */
  maxMs: number;
  /** Nights the summary is computed from. */
  nNights: number;
  /** Average total sleep over the same window, seconds. Null if no durations. */
  avgSleepSeconds: number | null;
  /** Nights the sleep average is computed from. */
  nSleepNights: number;
}

/**
 * Standing summary of her HRV set-point for the permanent "Your baseline"
 * card. Distinct from the calibration prompt — this is a reference fact, not
 * a decision. Null until there's enough history to be meaningful.
 */
export async function getHrvBaselineSummary(
  forDate?: Date,
): Promise<HrvBaselineSummary | null> {
  const today = forDate ?? new Date();
  const sleep = await prisma.dailySleep.findMany({
    where: { day: { lte: today }, averageHrv: { not: null } },
    orderBy: { day: "desc" },
    take: 60,
    select: { averageHrv: true, totalSleepDuration: true },
  });
  const hrv = sleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  if (hrv.length < 7) return null;
  // Average sleep over the same window — only the nights that actually
  // carry a duration, so the n is honest rather than assumed to match HRV.
  const sleepDurations = sleep
    .map((s) => s.totalSleepDuration)
    .filter((v): v is number => v != null);
  const avgSleepSeconds =
    sleepDurations.length > 0
      ? Math.round(
          sleepDurations.reduce((a, b) => a + b, 0) / sleepDurations.length,
        )
      : null;
  return {
    meanMs: Math.round(hrv.reduce((a, b) => a + b, 0) / hrv.length),
    minMs: Math.round(Math.min(...hrv)),
    maxMs: Math.round(Math.max(...hrv)),
    nNights: hrv.length,
    avgSleepSeconds,
    nSleepNights: sleepDurations.length,
  };
}

export interface HrvCvCalibration {
  /** Her typical overnight HRV, in ms. */
  hrvMeanMs: number;
  /** Personalized overreaching threshold (her rolling-CV mean + 1 SD), %. */
  personalThresholdPct: number;
  /** The flat textbook threshold we replaced, %. */
  flatThresholdPct: number;
  /** Her current 7-night CV, %. Null when fewer than 3 recent nights. */
  currentCvPct: number | null;
  /** Whether her current CV is elevated relative to her own normal. */
  currentlyElevated: boolean;
  /** Rolling windows the baseline was computed from. */
  baselineN: number;
  /** Her saved choice: pending (asking), personalized (confirmed), standard (denied). */
  choice: HrvBaselineChoice;
}

/**
 * Explainer note for the insights feed: why the overreaching/CV signal is
 * judged against her own HRV baseline rather than a flat 10%. Returns null
 * when there isn't enough history to have personalized anything (the feed
 * then shows nothing rather than a half-baked note).
 */
export async function getHrvCvCalibration(
  forDate?: Date
): Promise<HrvCvCalibration | null> {
  const today = forDate ?? new Date();
  const sleep = await prisma.dailySleep.findMany({
    where: { day: { lte: today }, averageHrv: { not: null } },
    orderBy: { day: "desc" },
    take: 60,
    select: { averageHrv: true },
  });
  const hrv = sleep
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const baseline = rollingHrvCvBaseline(hrv);
  if (!baseline) return null;

  const hrvMeanMs = hrv.reduce((a, b) => a + b, 0) / hrv.length;
  const currentCv = hrvCV(hrv.slice(0, 7));

  return {
    hrvMeanMs: Math.round(hrvMeanMs),
    personalThresholdPct: Math.round(hrvCvThreshold(baseline)),
    flatThresholdPct: FLAT_HRV_CV_THRESHOLD,
    currentCvPct: currentCv != null ? Math.round(currentCv) : null,
    currentlyElevated: isHrvCvElevated(currentCv, baseline),
    baselineN: baseline.n,
    choice: await getHrvBaselineChoice(),
  };
}
