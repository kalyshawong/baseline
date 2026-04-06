import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getScoreForDate } from "@/lib/baseline-score";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "20");

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
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { templateName, date } = body;

  const now = new Date();
  const sessionDate = date
    ? new Date(date + "T00:00:00.000Z")
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

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
}
