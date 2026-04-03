import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const status = new URL(request.url).searchParams.get("status");

  const experiments = await prisma.experiment.findMany({
    where: status ? { status } : undefined,
    include: {
      _count: { select: { logs: true, tags: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(experiments);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    title,
    hypothesis,
    independentVariable,
    dependentVariable,
    dependentMetric,
    metricSource,
    lagDays = 0,
    minDays = 14,
  } = body;

  if (!title || !hypothesis || !independentVariable || !dependentVariable || !dependentMetric || !metricSource) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const experiment = await prisma.experiment.create({
    data: {
      title,
      hypothesis,
      independentVariable,
      dependentVariable,
      dependentMetric,
      metricSource,
      lagDays,
      minDays,
      startDate: today,
      status: "draft",
    },
  });

  return NextResponse.json(experiment, { status: 201 });
}
