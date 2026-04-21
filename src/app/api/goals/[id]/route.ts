import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import { syncHyroxPlanForGoal } from "@/lib/hyrox-plan-sync";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    for (const field of ["title", "type", "subtype", "target", "notes", "status", "priority"] as const) {
      if (body[field] !== undefined) data[field] = body[field];
    }
    if (body.isPrimary === true) {
      data.isPrimary = true;
    } else if (body.isPrimary === false) {
      data.isPrimary = false;
    }
    if (body.deadline !== undefined) {
      data.deadline = body.deadline ? new Date(body.deadline) : null;
    }
    if (data.status === "completed") {
      data.status = "archived";
    }

    // BUG-C3 fix: wrap the isPrimary cascade + update in a single transaction
    // so concurrent PATCHes can't leave the DB with multiple primaries or zero.
    //
    // Hyrox hook: if the goal is (or becomes) a race/hyrox goal with a
    // deadline, sync the HyroxPlan inside the same transaction. Exceptions
    // roll the goal update back. Moving a goal away from subtype=hyrox is a
    // no-op — the existing plan is left in place so the user can revert.
    const goal = await prisma.$transaction(async (tx) => {
      if (body.isPrimary === true) {
        await tx.goal.updateMany({
          where: { isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      const updated = await tx.goal.update({ where: { id }, data });
      await syncHyroxPlanForGoal(tx, updated);
      return updated;
    });
    return NextResponse.json(goal);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
