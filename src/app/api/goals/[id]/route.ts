import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  for (const field of ["title", "type", "target", "notes", "status"] as const) {
    if (body[field] !== undefined) data[field] = body[field];
  }
  if (body.deadline !== undefined) {
    data.deadline = body.deadline ? new Date(body.deadline) : null;
  }

  const goal = await prisma.goal.update({ where: { id }, data });
  return NextResponse.json(goal);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.goal.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
