import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import { maybeArchivePlan } from "@/lib/hyrox-archive";
import { recommendSession } from "@/lib/hyrox-session-recommender";

/**
 * GET /api/hyrox/today
 *
 * Returns today's recommendSession() output for the user's active Hyrox plan.
 * Pulls:
 *   - readiness from DailyReadiness (latest on or before today)
 *   - HRV CV: 7-day rolling coefficient of variation over DailySleep.averageHrv
 *   - sleep from DailySleep.totalSleepDuration (latest with value)
 *   - cycle phase from latest CyclePhaseLog
 *   - daysSinceLastHardSession by scanning HyroxSession.sessionType
 *
 * Returns 404 if there is no active Hyrox plan.
 */
const HARD_SESSION_TYPES = [
  "intervals",
  "tempo",
  "compromised",
  "long_run",
  "race_simulation",
] as const;

export async function GET() {
  try {
    const today = new Date();

    // Find the (single) active plan. Spec says plans are keyed 1:1 to a goal
    // and we only support a solo user in v1, so "active" is unique.
    const plan = await prisma.hyroxPlan.findFirst({
      where: { status: "active" },
      orderBy: { updatedAt: "desc" },
    });

    if (!plan) {
      return NextResponse.json(
        { error: "No active Hyrox plan" },
        { status: 404 }
      );
    }

    const archived = await maybeArchivePlan(plan);
    if (archived.status !== "active") {
      return NextResponse.json(
        { error: "Plan was archived (race date passed)" },
        { status: 404 }
      );
    }

    // Pull context in parallel — no dependencies between these reads.
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      readinessRow,
      sleepRow,
      recentSleeps,
      cycleRow,
      lastHardSession,
    ] = await Promise.all([
      prisma.dailyReadiness.findFirst({
        where: { day: { lte: today } },
        orderBy: { day: "desc" },
      }),
      prisma.dailySleep.findFirst({
        where: { day: { lte: today }, totalSleepDuration: { not: null } },
        orderBy: { day: "desc" },
      }),
      prisma.dailySleep.findMany({
        where: {
          day: { gte: sevenDaysAgo, lte: today },
          averageHrv: { not: null },
        },
        orderBy: { day: "desc" },
        take: 7,
      }),
      prisma.cyclePhaseLog.findFirst({
        where: { day: { lte: today } },
        orderBy: { day: "desc" },
      }),
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

    // HRV CV (%) = (stdev / mean) * 100 over recent averageHrv samples.
    // Need at least 3 points to be meaningful.
    let hrvCv: number | null = null;
    const hrvValues = recentSleeps
      .map((s) => s.averageHrv)
      .filter((v): v is number => v !== null && v !== undefined);
    if (hrvValues.length >= 3) {
      const mean = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
      if (mean > 0) {
        const variance =
          hrvValues.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
          hrvValues.length;
        const stdev = Math.sqrt(variance);
        hrvCv = (stdev / mean) * 100;
      }
    }

    const cyclePhase = cycleRow?.phase ?? null;

    // null = no prior hard session on this plan. The recommender treats null
    // as stale and fires Rule 4 in transmutation — semantically distinct from
    // any finite number, and avoids sentinel values leaking into rationale text.
    const daysSinceLastHardSession: number | null = lastHardSession
      ? Math.max(
          0,
          Math.floor(
            (startOfDay(today).getTime() - startOfDay(lastHardSession.day).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

    const recommendation = recommendSession({
      plan: archived,
      readiness,
      hrvCv,
      sleepHours,
      cyclePhase,
      daysSinceLastHardSession,
      today,
    });

    return NextResponse.json({
      planId: archived.id,
      goalId: archived.goalId,
      raceDate: archived.raceDate,
      context: {
        readiness,
        hrvCv,
        sleepHours,
        cyclePhase,
        daysSinceLastHardSession,
      },
      recommendation,
    });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
