import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  const { setId } = await params;
  await prisma.workoutSet.delete({ where: { id: setId } });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  const { setId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.reps !== undefined) data.reps = body.reps;
  if (body.weight !== undefined) data.weight = body.weight;
  if (body.rpe !== undefined) data.rpe = body.rpe;
  if (body.notes !== undefined) data.notes = body.notes;

  const set = await prisma.workoutSet.update({ where: { id: setId }, data });
  return NextResponse.json(set);
}
