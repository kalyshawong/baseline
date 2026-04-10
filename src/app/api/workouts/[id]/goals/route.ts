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
