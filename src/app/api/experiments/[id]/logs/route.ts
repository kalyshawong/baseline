import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const logs = await prisma.experimentLog.findMany({
    where: { experimentId: id },
    orderBy: { day: "desc" },
  });

  return NextResponse.json(logs);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const { day, independentValue, intensity, notes } = body;

  if (independentValue === undefined) {
    return NextResponse.json({ error: "independentValue is required" }, { status: 400 });
  }

  const dayDate = day
    ? new Date(day)
    : (() => {
        const now = new Date();
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      })();

  // Upsert log (one per experiment per day)
  const log = await prisma.experimentLog.upsert({
    where: {
      experimentId_day: { experimentId: id, day: dayDate },
    },
    update: { independentValue, intensity, notes },
    create: {
      experimentId: id,
      day: dayDate,
      independentValue,
      intensity,
      notes,
    },
  });

  // Auto-transition draft → active on first log
  const experiment = await prisma.experiment.findUnique({ where: { id } });
  if (experiment?.status === "draft") {
    await prisma.experiment.update({
      where: { id },
      data: { status: "active" },
    });
  }

  return NextResponse.json(log, { status: 201 });
}
