import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { suggestLoadChange } from "@/lib/training";
import { apiError } from "@/lib/utils";

/**
 * For each exercise in the query, returns a load adjustment suggestion
 * based on average RPE of the last session's working sets.
 */
export async function POST(request: NextRequest) {
  try {
    const { exerciseIds } = await request.json();

    if (!Array.isArray(exerciseIds)) {
      return NextResponse.json(
        { error: "exerciseIds array is required" },
        { status: 400 }
      );
    }

    const suggestions: Record<
      string,
      {
        action: "increase" | "hold" | "decrease";
        avgRpe: number | null;
        lastWeight: number | null;
        lastReps: number | null;
        message: string;
      }
    > = {};

    for (const exerciseId of exerciseIds) {
      // Find the last completed session that had this exercise with RPE logged
      const lastSession = await prisma.workoutSession.findFirst({
        where: {
          completedAt: { not: null },
          sets: {
            some: { exerciseId, isWarmup: false, rpe: { not: null } },
          },
        },
        orderBy: { date: "desc" },
        include: {
          sets: {
            where: { exerciseId, isWarmup: false },
            orderBy: { setNumber: "asc" },
          },
        },
      });

      if (!lastSession || lastSession.sets.length === 0) {
        suggestions[exerciseId] = {
          action: "hold",
          avgRpe: null,
          lastWeight: null,
          lastReps: null,
          message: "No previous RPE data",
        };
        continue;
      }

      const rpes = lastSession.sets
        .map((s) => s.rpe)
        .filter((r): r is number => r != null);

      if (rpes.length === 0) {
        suggestions[exerciseId] = {
          action: "hold",
          avgRpe: null,
          lastWeight: lastSession.sets[0].weight,
          lastReps: lastSession.sets[0].reps,
          message: "No RPE logged last session",
        };
        continue;
      }

      const avgRpe = rpes.reduce((a, b) => a + b, 0) / rpes.length;
      const action = suggestLoadChange(rpes);
      const lastWeight = lastSession.sets[lastSession.sets.length - 1].weight;
      const lastReps = lastSession.sets[lastSession.sets.length - 1].reps;

      let message: string;
      if (action === "increase") {
        message = `Last avg RPE ${avgRpe.toFixed(1)} — too easy. Try +2.5-5 lbs.`;
      } else if (action === "decrease") {
        message = `Last avg RPE ${avgRpe.toFixed(1)} — too hard. Drop 5-10%.`;
      } else {
        message = `Last avg RPE ${avgRpe.toFixed(1)} — in the zone. Hold weight.`;
      }

      suggestions[exerciseId] = {
        action,
        avgRpe: Math.round(avgRpe * 10) / 10,
        lastWeight,
        lastReps,
        message,
      };
    }

    return NextResponse.json(suggestions);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
