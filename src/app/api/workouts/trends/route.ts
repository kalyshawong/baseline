import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLocalDay } from "@/lib/date-utils";
import { compoundContributions, volumeZones, estimate1RM } from "@/lib/training";
import { apiError } from "@/lib/utils";

/**
 * Returns per-week volume per muscle group + e1RM trend per compound exercise
 * over the last N weeks (default 8).
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const weeks = Math.min(parseInt(url.searchParams.get("weeks") ?? "8"), 13); // Cap at ~90 days

    const today = getLocalDay();

    // Start of the oldest week window (Monday)
    const dayOfWeek = today.getUTCDay() || 7;
    const currentWeekStart = new Date(today);
    currentWeekStart.setUTCDate(today.getUTCDate() - (dayOfWeek - 1));

    const rangeStart = new Date(currentWeekStart);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 7 * (weeks - 1));

    const sets = await prisma.workoutSet.findMany({
      where: {
        isWarmup: false,
        session: { date: { gte: rangeStart } },
      },
      include: {
        exercise: { select: { name: true, muscleGroup: true, isCompound: true } },
        session: { select: { date: true } },
      },
    });

    // --- Weekly volume per muscle group ---
    // Key: "YYYY-Www" -> { muscleGroup -> sets count }
    function weekKey(d: Date): string {
      const target = new Date(d);
      const dow = target.getUTCDay() || 7;
      target.setUTCDate(target.getUTCDate() - (dow - 1));
      return target.toISOString().split("T")[0];
    }

    const weekVolume: Record<string, Record<string, number>> = {};
    // Initialize all weeks so empty weeks show up
    for (let i = 0; i < weeks; i++) {
      const d = new Date(currentWeekStart);
      d.setUTCDate(d.getUTCDate() - 7 * i);
      weekVolume[weekKey(d)] = Object.fromEntries(
        Object.keys(volumeZones).map((g) => [g, 0])
      );
    }

    for (const set of sets) {
      const wk = weekKey(set.session.date);
      if (!weekVolume[wk]) continue;
      const contributions = compoundContributions[set.exercise.name] ?? [set.exercise.muscleGroup];
      for (const mg of contributions) {
        if (weekVolume[wk][mg] !== undefined) weekVolume[wk][mg] += 1;
      }
    }

    const volumeTrend = Object.keys(weekVolume)
      .sort()
      .map((wk) => ({
        week: wk,
        ...weekVolume[wk],
      }));

    // --- e1RM trend per compound exercise ---
    // For each session, take the max e1RM per compound exercise
    const e1rmByExerciseDay: Record<
      string,
      Map<string, number>
    > = {};
    for (const set of sets) {
      if (!set.exercise.isCompound) continue;
      const dayKey = set.session.date.toISOString().split("T")[0];
      const e1rm = estimate1RM(set.weight, set.reps);
      if (!e1rmByExerciseDay[set.exercise.name]) {
        e1rmByExerciseDay[set.exercise.name] = new Map();
      }
      const existing = e1rmByExerciseDay[set.exercise.name].get(dayKey) ?? 0;
      if (e1rm > existing) e1rmByExerciseDay[set.exercise.name].set(dayKey, e1rm);
    }

    // Only include exercises with 2+ data points
    const e1rmTrend: Array<{
      exercise: string;
      dataPoints: Array<{ date: string; e1rm: number }>;
    }> = [];
    for (const [exercise, days] of Object.entries(e1rmByExerciseDay)) {
      if (days.size < 2) continue;
      e1rmTrend.push({
        exercise,
        dataPoints: Array.from(days.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, e1rm]) => ({ date, e1rm: Math.round(e1rm) })),
      });
    }

    return NextResponse.json({ volumeTrend, e1rmTrend, weeks });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
