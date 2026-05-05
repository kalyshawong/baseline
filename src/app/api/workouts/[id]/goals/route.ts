import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";

// GET: list goals tagged to this workout
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tags = await prisma.goalWorkoutTag.findMany({
      where: { sessionId: id },
      include: { goal: { select: { id: true, title: true, type: true, subtype: true } } },
    });
    return NextResponse.json(tags.map((t) => t.goal));
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

// Cap to prevent DOS via huge fake-id array swelling the transaction.
// In practice a workout maps to ≤5 goals; 50 is generous headroom.
const GOAL_IDS_MAX = 50;

// PUT: replace all goal tags for this workout
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { goalIds } = await request.json();

    if (!Array.isArray(goalIds)) {
      return NextResponse.json({ error: "goalIds must be an array" }, { status: 400 });
    }
    if (goalIds.length > GOAL_IDS_MAX) {
      return NextResponse.json(
        { error: `goalIds must contain at most ${GOAL_IDS_MAX} entries` },
        { status: 400 }
      );
    }
    for (const gid of goalIds) {
      if (typeof gid !== "string" || gid.length === 0) {
        return NextResponse.json(
          { error: "goalIds entries must be non-empty strings" },
          { status: 400 }
        );
      }
    }

    // Delete existing tags and create new ones in a transaction
    await prisma.$transaction([
      prisma.goalWorkoutTag.deleteMany({ where: { sessionId: id } }),
      ...goalIds.map((goalId: string) =>
        prisma.goalWorkoutTag.create({ data: { goalId, sessionId: id } })
      ),
    ]);

    return NextResponse.json({ success: true, tagged: goalIds.length });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
