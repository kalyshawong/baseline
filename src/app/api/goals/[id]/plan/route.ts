import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/utils";
import { getGoalPlan } from "@/lib/goal-plan-data";

/** GET /api/goals/:id/plan — the goal's daily nutrition plan (null body = not a nutrition goal). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const plan = await getGoalPlan(id);
    return NextResponse.json(plan);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
