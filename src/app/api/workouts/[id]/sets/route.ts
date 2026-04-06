import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { estimate1RM } from "@/lib/training";
import { apiError } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await request.json();
    const { exerciseId, setNumber, reps, weight, rpe, restSeconds, isWarmup, notes } = body;

    if (!exerciseId || reps == null || weight == null) {
      return NextResponse.json(
        { error: "exerciseId, reps, and weight are required" },
        { status: 400 }
      );
    }

    // BUG-011: Input validation
    const errors: string[] = [];
    if (typeof reps !== "number" || reps < 1 || reps > 100) errors.push("reps must be 1-100");
    if (typeof weight !== "number" || weight < 0 || weight > 1000) errors.push("weight must be 0-1000");
    if (rpe != null && (typeof rpe !== "number" || rpe < 1 || rpe > 10)) errors.push("RPE must be 1-10");
    if (setNumber != null && (typeof setNumber !== "number" || setNumber < 1 || setNumber > 50)) errors.push("setNumber must be 1-50");
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    // Detect PR: compare new e1RM against all previous non-warmup sets for this exercise
    let isPR = false;
    if (!isWarmup) {
      const newE1RM = estimate1RM(weight, reps);
      const previousBest = await prisma.workoutSet.findMany({
        where: { exerciseId, isWarmup: false },
        select: { weight: true, reps: true },
      });
      const bestPriorE1RM = previousBest.reduce(
        (max, s) => Math.max(max, estimate1RM(s.weight, s.reps)),
        0
      );
      isPR = newE1RM > bestPriorE1RM;
    }

    const set = await prisma.workoutSet.create({
      data: {
        sessionId,
        exerciseId,
        setNumber: setNumber ?? 1,
        reps,
        weight,
        rpe: rpe ?? null,
        restSeconds: restSeconds ?? null,
        isWarmup: isWarmup ?? false,
        isPR,
        notes: notes ?? null,
      },
      include: { exercise: true },
    });

    return NextResponse.json(set, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
