import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLocalDay } from "@/lib/date-utils";
import { getScoreForDate } from "@/lib/baseline-score";
import { apiError, parseIntInRange } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const limit = parseIntInRange(url.searchParams.get("limit"), 20, 1, 200);

    const sessions = await prisma.workoutSession.findMany({
      orderBy: { date: "desc" },
      take: limit,
      include: {
        sets: {
          include: { exercise: { select: { name: true, muscleGroup: true } } },
        },
      },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateName, date } = body;

    const isBackfill = !!date;
    const sessionDate = isBackfill
      ? new Date(date + "T00:00:00.000Z")
      : getLocalDay();

    // For backfilled sessions, anchor startedAt at noon on the chosen date
    // so it doesn't look like a workout that happened just now.
    const startedAt = isBackfill
      ? new Date(date + "T12:00:00.000Z")
      : new Date();

    // Snapshot readiness + cycle phase at session start (uses historical date for backfill).
    // Cycle phase is staleness-guarded — if the most recent log on or
    // before `sessionDate` is older than its phase's max-days cap, we
    // record null instead of the stale phase. Prevents the bug where
    // backfilled WorkoutSessions inherit a month-old cycle phase.
    const { resolveCyclePhase } = await import("@/lib/cycle-phase");
    const [score, cycle] = await Promise.all([
      getScoreForDate(sessionDate),
      resolveCyclePhase(sessionDate),
    ]);

    const session = await prisma.workoutSession.create({
      data: {
        date: sessionDate,
        startedAt,
        readinessScore: score?.overall ?? null,
        cyclePhase: cycle.phase,
        templateName: templateName ?? null,
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
