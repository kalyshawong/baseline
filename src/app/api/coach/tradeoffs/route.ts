import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { detectTradeoffs } from "@/lib/coach-context";
import { getLocalDay } from "@/lib/date-utils";
import { getScoreForDate } from "@/lib/baseline-score";
import { energyAvailability, ffmFromBodyComposition } from "@/lib/training";
import { computeHrvCvSignals } from "@/lib/training-call";
import { apiError } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const localToday = getLocalDay();

    const { resolveCyclePhase } = await import("@/lib/cycle-phase");
    const [goals, score, cycle, cvSignals, nutrition, activity, profile, weight, running] =
      await Promise.all([
        prisma.goal.findMany({ where: { status: "active" } }),
        getScoreForDate(localToday),
        // Staleness-guarded — phase: null when last log is too old.
        resolveCyclePhase(localToday),
        // Personal-baseline-aware HRV-CV signals (see computeHrvCvSignals).
        computeHrvCvSignals(localToday),
        prisma.nutritionLog.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day: localToday } } }),
        prisma.dailyActivity.findFirst({
          where: { day: { lte: localToday } },
          orderBy: { day: "desc" },
        }),
        prisma.userProfile.findUnique({ where: { userId: getCurrentUserId() } }),
        prisma.weightLog.findFirst({ orderBy: { day: "desc" } }),
        prisma.dailyRunningMetrics.findFirst({
          where: { day: { lte: localToday } },
          orderBy: { day: "desc" },
        }),
      ]);

    if (goals.length === 0) {
      return NextResponse.json({ tradeoffs: [] });
    }

    // Compute energy availability if possible
    let computedEA: number | null = null;
    if (nutrition && activity && profile && weight) {
      const bf = weight.bodyFatPct ?? profile.bodyFatPct;
      const ffm = ffmFromBodyComposition(weight.weightKg, bf);
      if (ffm > 0) {
        computedEA = energyAvailability(
          nutrition.calories,
          activity.activeCalories ?? 0,
          ffm
        );
      }
    }

    const tradeoffs = detectTradeoffs(goals, {
      energyAvailability: computedEA,
      readinessScore: score?.overall ?? null,
      cyclePhase: cycle.phase,
      hrvCv: cvSignals.hrvCv,
      hrvCvBaseline: cvSignals.hrvCvBaseline,
      hrvBelowBaseline: cvSignals.hrvBelowBaseline,
      weeklyRunningKm: running?.walkingRunningDistance
        ? running.walkingRunningDistance / 1000
        : null,
      calorieBalance: null,
    });

    return NextResponse.json({ tradeoffs });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
