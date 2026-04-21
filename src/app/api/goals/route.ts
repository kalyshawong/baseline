import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import { syncHyroxPlanForGoal } from "@/lib/hyrox-plan-sync";

export async function GET(request: NextRequest) {
  try {
    const status = new URL(request.url).searchParams.get("status");
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

    if (!title || !type) {
      return NextResponse.json({ error: "title and type are required" }, { status: 400 });
    }

    const validTypes = ["race", "strength", "physique", "cognitive", "weight", "health", "custom"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
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
