import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await prisma.workoutSession.findUnique({
    where: { id },
    include: {
      sets: {
        orderBy: { createdAt: "asc" },
        include: { exercise: true },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.sessionRPE !== undefined) data.sessionRPE = body.sessionRPE;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.completedAt !== undefined) data.completedAt = new Date(body.completedAt);
  if (body.durationMin !== undefined) data.durationMin = body.durationMin;

  // If completing the session, compute total volume
  if (body.completedAt) {
    const sets = await prisma.workoutSet.findMany({
      where: { sessionId: id, isWarmup: false },
    });
    const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    data.sessionVolume = totalVolume;
  }

  const session = await prisma.workoutSession.update({
    where: { id },
    data,
  });

  return NextResponse.json(session);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.workoutSession.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
