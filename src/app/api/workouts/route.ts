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

    const sessionDate = date
      ? new Date(date + "T00:00:00.000Z")
      : getLocalDay();

    // Snapshot readiness + cycle phase at session start
    const score = await getScoreForDate(sessionDate);
    const cyclePhaseLog = await prisma.cyclePhaseLog.findFirst({
      where: { day: { lte: sessionDate } },
      orderBy: { day: "desc" },
    });

    const session = await prisma.workoutSession.create({
      data: {
        date: sessionDate,
        startedAt: new Date(),
        readinessScore: score?.overall ?? null,
        cyclePhase: cyclePhaseLog?.phase ?? null,
        templateName: templateName ?? null,
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
