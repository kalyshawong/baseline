import { prisma } from "@/lib/db";
import {
  recommendSession,
  type RecommendedSession,
} from "@/lib/hyrox-session-recommender";
import { maybeArchivePlan } from "@/lib/hyrox-archive";
import { resolveCyclePhase } from "@/lib/cycle-phase";
import { computeHrvCvSignals } from "@/lib/training-call";

// Canonical HRV-CV signal helper lives in training-call.ts (the HRV home);
// re-exported here so the dashboard card, /api/hyrox/today, and /body/hyrox can
// keep importing it from the hyrox module they already depend on.
export { computeHrvCvSignals, type HrvCvSignals } from "@/lib/training-call";

/**
 * Shared "today's hyrox session" computation used by:
 *   - /api/hyrox/today (client-fetch endpoint)
 *   - /dashboard server component (HyroxCountdownCard)
 *
 * Returns null when there's no active plan — the dashboard renders
 * nothing in that case rather than a "no plan" empty state, since the
 * majority of Baseline users won't have a Hyrox plan and the
 * countdown card is only relevant when one exists.
 */

const HARD_SESSION_TYPES = [
  "intervals",
  "tempo",
  "compromised",
  "long_run",
  "race_simulation",
] as const;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export interface HyroxTodayResult {
  planId: string;
  goalId: string;
  raceDate: Date;
  targetTimeSeconds: number;
  context: {
    readiness: number | null;
    hrvCv: number | null;
    sleepHours: number | null;
    cyclePhase: string | null;
    daysSinceLastHardSession: number | null;
  };
  recommendation: RecommendedSession;
}

export async function getHyroxToday(
  today: Date = new Date(),
): Promise<HyroxTodayResult | null> {
  const plan = await prisma.hyroxPlan.findFirst({
    where: { status: "active" },
    orderBy: { updatedAt: "desc" },
  });
  if (!plan) return null;

  const archived = await maybeArchivePlan(plan);
  if (archived.status !== "active") return null;

  const [readinessRow, sleepRow, cvSignals, cycleRow, lastHardSession] =
    await Promise.all([
      prisma.dailyReadiness.findFirst({
        where: { day: { lte: today } },
        orderBy: { day: "desc" },
      }),
      prisma.dailySleep.findFirst({
        where: { day: { lte: today }, totalSleepDuration: { not: null } },
        orderBy: { day: "desc" },
      }),
      // Personal-baseline-aware CV signals (see computeHrvCvSignals).
      computeHrvCvSignals(today),
      // Staleness-guarded — returns phase: null when last log is
      // older than its phase's max-days cap. See cycle-phase.ts.
      resolveCyclePhase(today),
      prisma.hyroxSession.findFirst({
        where: {
          planId: archived.id,
          sessionType: { in: [...HARD_SESSION_TYPES] },
          day: { lte: today },
        },
        orderBy: { day: "desc" },
      }),
    ]);

  const readiness = readinessRow?.score ?? null;
  const sleepSeconds = sleepRow?.totalSleepDuration ?? null;
  const sleepHours = sleepSeconds !== null ? sleepSeconds / 3600 : null;

  const { hrvCv, hrvCvBaseline, hrvBelowBaseline } = cvSignals;

  const cyclePhase = cycleRow.phase;

  const daysSinceLastHardSession: number | null = lastHardSession
    ? Math.max(
        0,
        Math.floor(
          (startOfDay(today).getTime() -
            startOfDay(lastHardSession.day).getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  const recommendation = recommendSession({
    plan: archived,
    readiness,
    hrvCv,
    hrvCvBaseline,
    hrvBelowBaseline,
    sleepHours,
    cyclePhase,
    daysSinceLastHardSession,
    today,
  });

  return {
    planId: archived.id,
    goalId: archived.goalId,
    raceDate: archived.raceDate,
    targetTimeSeconds: archived.targetTime,
    context: {
      readiness,
      hrvCv,
      sleepHours,
      cyclePhase,
      daysSinceLastHardSession,
    },
    recommendation,
  };
}
