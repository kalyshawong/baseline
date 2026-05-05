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

export async function GET(request: NextRequest) {
  try {
    const status = new URL(request.url).searchParams.get("status");
    if (status != null && !(GOAL_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${GOAL_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const goals = await prisma.goal.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: "asc" }, { deadline: "asc" }],
    });
    return NextResponse.json(goals);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, type, subtype, target, deadline, notes, isPrimary } = body;

    const validationError = collectErrors(
      validateString(title, "title", { maxLen: TITLE_MAX, required: true }),
      validateEnum(type, GOAL_TYPES, "type", { required: true }),
      validateString(subtype, "subtype", { maxLen: SUBTYPE_MAX }),
      validateString(target, "target", { maxLen: TARGET_MAX }),
      validateString(notes, "notes", { maxLen: NOTES_MAX }),
      deadline != null ? validateDateString(deadline, "deadline") : null
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    if (isPrimary != null && typeof isPrimary !== "boolean") {
      return NextResponse.json({ error: "isPrimary must be a boolean" }, { status: 400 });
    }

    // BUG-C3 fix: wrap the isPrimary cascade + create in a single transaction
    // so two concurrent "set primary" requests can't interleave and leave the
    // DB with 0 or 2 primary goals.
    //
    // Hyrox hook: when a race/hyrox goal is created, auto-create its
    // HyroxPlan inside the same transaction. Any exception rolls the goal
    // save back — we never want an orphaned goal or an orphaned plan.
    const goal = await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.goal.updateMany({
          where: { isPrimary: true },
          data: { isPrimary: false },
        });
      }
      const created = await tx.goal.create({
        data: {
          title,
          type,
          subtype: subtype ?? null,
          target: target ?? null,
          deadline: deadline ? new Date(deadline) : null,
          notes: notes ?? null,
          isPrimary: isPrimary ?? false,
        },
      });
      await syncHyroxPlanForGoal(tx, created);
      return created;
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
