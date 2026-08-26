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

    let {
      title,
      hypothesis,
      independentVariable,
      dependentVariable,
      dependentMetric,
      metricSource,
      lagDays = 0,
      minDays = 14,
    } = body;
    let replicationOf: string | null = null;
    let swcOverride: number | null = typeof body.swc === "number" ? body.swc : null;

    // REPLICATION (audit §2.5: replication before "rule" status). Everything
    // is inherited from the original's locked pre-registration — same IV,
    // same outcome, same SWC — only the randomized schedule is fresh. The
    // link is stored inside the new run's preReg, so the pairing itself is
    // pre-registered.
    if (typeof body.replicationOf === "string") {
      const original = await prisma.experiment.findUnique({ where: { id: body.replicationOf } });
      if (!original?.resultJson || !original.preReg) {
        return NextResponse.json({ error: "Original run not found or has no verdict" }, { status: 400 });
      }
      const verdict = JSON.parse(original.resultJson);
      if (verdict.decision !== "effect_found") {
        return NextResponse.json({ error: "Only effect_found runs get replications" }, { status: 400 });
      }
      const originalPreReg = JSON.parse(original.preReg);
      replicationOf = original.id;
      title = `Replication: ${original.title}`;
      hypothesis = `Independent rerun of "${original.title}" — the effect must hold in a fresh randomized schedule before it becomes a rule.`;
      independentVariable = original.independentVariable;
      dependentVariable = original.dependentVariable;
      dependentMetric = original.dependentMetric;
      metricSource = original.metricSource;
      lagDays = original.lagDays;
      minDays = original.minDays;
      swcOverride = originalPreReg.swc ?? null;
    }

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
      swc: swcOverride,
      lagDays,
    });

    if (plan.refused) {
      return NextResponse.json({ refused: true, reason: plan.reason }, { status: 422 });
    }

    if (replicationOf) plan.preReg.replicationOf = replicationOf;

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
