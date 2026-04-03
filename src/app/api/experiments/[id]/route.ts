import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const experiment = await prisma.experiment.findUnique({
    where: { id },
    include: {
      logs: { orderBy: { day: "desc" } },
      tags: { orderBy: { timestamp: "desc" }, take: 20 },
    },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(experiment);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const allowedFields = ["title", "hypothesis", "status", "endDate"] as const;
  const data: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      data[field] = field === "endDate" && body[field] ? new Date(body[field]) : body[field];
    }
  }

  const experiment = await prisma.experiment.update({
    where: { id },
    data,
  });

  return NextResponse.json(experiment);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.experiment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
