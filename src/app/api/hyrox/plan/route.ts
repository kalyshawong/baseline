import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import { maybeArchivePlan } from "@/lib/hyrox-archive";

/**
 * GET /api/hyrox/plan?goalId=X
 * Returns the plan for the given goal, or 404. No POST — plans auto-create
 * via the goals integration.
 */
export async function GET(request: NextRequest) {
  try {
    const goalId = new URL(request.url).searchParams.get("goalId");
    if (!goalId) {
      return NextResponse.json({ error: "goalId is required" }, { status: 400 });
    }

    const plan = await prisma.hyroxPlan.findUnique({ where: { goalId } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const archived = await maybeArchivePlan(plan);
    return NextResponse.json(archived);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
