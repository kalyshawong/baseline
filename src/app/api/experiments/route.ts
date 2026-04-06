import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLocalDay } from "@/lib/date-utils";
import { apiError } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const status = new URL(request.url).searchParams.get("status");

    const experiments = await prisma.experiment.findMany({
      where: status ? { status } : undefined,
      include: {
        _count: { select: { logs: true, tags: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(experiments);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
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

    const today = getLocalDay();

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
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
