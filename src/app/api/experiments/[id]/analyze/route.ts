import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeExperiment } from "@/lib/correlation";
import { apiError } from "@/lib/utils";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: { _count: { select: { logs: true } } },
    });

    if (!experiment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await analyzeExperiment(id);

    if (!result) {
      return NextResponse.json(
        {
          error: "Not enough data for analysis",
          logsCount: experiment._count.logs,
          minRequired: experiment.minDays * 2,
        },
        { status: 422 }
      );
    }

    // Update experiment status to analyzed
    if (experiment.status === "completed" || experiment.status === "active") {
      await prisma.experiment.update({
        where: { id },
        data: { status: "analyzed" },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
