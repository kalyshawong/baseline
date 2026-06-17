import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { getLocalDay, getLocalDayStr, dateStrToUTC } from "@/lib/date-utils";
import { getScoreForDate } from "@/lib/baseline-score";
import { apiError, parseIntInRange, validateString } from "@/lib/utils";

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

    // BUG-H1: validate inputs before they flow into Date constructors / Prisma.
    const errors: string[] = [];
    const templateErr = validateString(templateName, "templateName", { maxLen: 200 });
    if (templateErr) errors.push(templateErr);

    if (date !== undefined && date !== null) {
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push("date must be a YYYY-MM-DD string");
      } else if (Number.isNaN(dateStrToUTC(date).getTime())) {
        errors.push("date must be a valid calendar date");
      } else if (date > getLocalDayStr()) {
        // Lexicographic compare is chronological for YYYY-MM-DD.
        errors.push("date cannot be in the future");
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const isBackfill = !!date;
    const sessionDate = isBackfill ? dateStrToUTC(date) : getLocalDay();

    // For backfilled sessions, anchor startedAt at noon on the chosen date
    // so it doesn't look like a workout that happened just now.
    const startedAt = isBackfill
      ? new Date(dateStrToUTC(date).getTime() + 12 * 60 * 60 * 1000)
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
        userId: getCurrentUserId(),
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
