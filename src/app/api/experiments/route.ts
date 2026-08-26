import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { getLocalDay, getRequestTz } from "@/lib/date-utils";
import { apiError } from "@/lib/utils";
import { planRigorousExperiment } from "@/lib/experiment-rigor";

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

    const today = getLocalDay(await getRequestTz());

    // RIGOROUS MODE (audit §2.5): the app sizes and schedules the test.
    // Self-selected days and "Begin when I feel like it" are gone — both
    // were identification killers (unbounded confounding, regression to
    // the mean). A refusal is returned honestly when the design can't
    // detect an effect worth caring about.
    const plan = await planRigorousExperiment({
      metricSource,
      dependentMetric,
      swc: typeof body.swc === "number" ? body.swc : null,
      lagDays,
    });

    if (plan.refused) {
      return NextResponse.json({ refused: true, reason: plan.reason }, { status: 422 });
    }

    const experiment = await prisma.experiment.create({
      data: {
        userId: await getCurrentUserId(),
        title,
        hypothesis,
        independentVariable,
        dependentVariable,
        dependentMetric,
        metricSource,
        lagDays,
        minDays,
        startDate: plan.startDate,
        status: "scheduled",
        assignments: JSON.stringify(plan.assignments),
        preReg: JSON.stringify(plan.preReg),
      },
    });

    return NextResponse.json({ ...experiment, plan: plan.preReg }, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
