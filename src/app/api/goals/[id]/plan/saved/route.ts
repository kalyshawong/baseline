import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import { getCurrentUserId } from "@/lib/current-user";
import { isNutritionGoal } from "@/lib/goal-plan";
import { resolveAdjustments, type RawAdjustments } from "@/lib/goal-plan-data";

/**
 * POST — save a coach-adjusted plan for this goal. Body: { raw, summary }.
 * Foods are re-fetched from USDA FDC here, so the saved plan never carries
 * nutrient numbers from the client or the model.
 * DELETE — drop the saved versions; the goal goes back to the calculated plan.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const goal = await prisma.goal.findUnique({ where: { id } });
    if (!goal) return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    if (!isNutritionGoal(goal)) return NextResponse.json({ error: "This goal has no nutrition plan" }, { status: 400 });
    const body = (await req.json()) as { raw?: RawAdjustments; summary?: unknown };
    if (!body.raw || typeof body.raw !== "object") return NextResponse.json({ error: "raw adjustments required" }, { status: 400 });
    const { adjustments, errors } = await resolveAdjustments(body.raw);
    if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
    const row = await prisma.savedGoalPlan.create({
      data: {
        userId: await getCurrentUserId(),
        goalId: id,
        adjustments: JSON.stringify(adjustments),
        summary: typeof body.summary === "string" ? body.summary.slice(0, 200) : null,
      },
    });
    return NextResponse.json({ id: row.id, createdAt: row.createdAt }, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { count } = await prisma.savedGoalPlan.deleteMany({ where: { goalId: id } });
    return NextResponse.json({ deleted: count });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
