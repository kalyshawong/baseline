import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, parseIntInRange } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const days = parseIntInRange(url.searchParams.get("days"), 30, 1, 365);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const workouts = await prisma.healthKitWorkout.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
    });

    return NextResponse.json(workouts);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
