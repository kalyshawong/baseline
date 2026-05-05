import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  apiError,
  collectErrors,
  validateString,
  validateEnum,
  validateDateString,
} from "@/lib/utils";
import { syncHyroxPlanForGoal } from "@/lib/hyrox-plan-sync";

const GOAL_TYPES = ["race", "strength", "physique", "cognitive", "weight", "health", "custom"] as const;
const GOAL_STATUSES = ["active", "completed", "abandoned", "archived"] as const;
const GOAL_PRIORITIES = ["low", "medium", "high"] as const;
const TITLE_MAX = 200;
const TARGET_MAX = 200;
const SUBTYPE_MAX = 80;
const NOTES_MAX = 4_000;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Validate any field that's present (PATCH = all optional, but if provided must be valid)
    const validationError = collectErrors(
      body.title !== undefined ? validateString(body.title, "title", { maxLen: TITLE_MAX }) : null,
      body.type !== undefined ? validateEnum(body.type, GOAL_TYPES, "type") : null,
      body.subtype !== undefined ? validateString(body.subtype, "subtype", { maxLen: SUBTYPE_MAX }) : null,
      body.target !== undefined ? validateString(body.target, "target", { maxLen: TARGET_MAX }) : null,
      body.notes !== undefined ? validateString(body.notes, "notes", { maxLen: NOTES_MAX }) : null,
      body.status !== undefined ? validateEnum(body.status, GOAL_STATUSES, "status") : null,
      body.priority !== undefined ? validateEnum(body.priority, GOAL_PRIORITIES, "priority") : null,
      body.deadline !== undefined && body.deadline != null ? validateDateString(body.deadline, "deadline") : null
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    if (body.isPrimary !== undefined && typeof body.isPrimary !== "boolean") {
      return NextResponse.json({ error: "isPrimary must be a boolean" }, { status: 400 });
    }

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
