import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectTradeoffs } from "@/lib/coach-context";
import { getLocalDay } from "@/lib/date-utils";
import { getScoreForDate } from "@/lib/baseline-score";
import { hrvCV, energyAvailability, ffmFromBodyComposition } from "@/lib/training";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const localToday = getLocalDay();

    const [goals, score, phaseLog, recentSleep, nutrition, activity, profile, weight, running] =
      await Promise.all([
        prisma.goal.findMany({ where: { status: "active" } }),
        getScoreForDate(localToday),
        prisma.cyclePhaseLog.findFirst({
          where: { day: { lte: localToday } },
          orderBy: { day: "desc" },
        }),
        prisma.dailySleep.findMany({
          where: { day: { lte: localToday } },
          orderBy: { day: "desc" },
          take: 14,
          select: { averageHrv: true },
        }),
        prisma.nutritionLog.findUnique({ where: { day: localToday } }),
        prisma.dailyActivity.findFirst({
          where: { day: { lte: localToday } },
          orderBy: { day: "desc" },
        }),
        prisma.userProfile.findUnique({ where: { id: 1 } }),
        prisma.weightLog.findFirst({ orderBy: { day: "desc" } }),
        prisma.dailyRunningMetrics.findFirst({
          where: { day: { lte: localToday } },
          orderBy: { day: "desc" },
        }),
      ]);

    if (goals.length === 0) {
      return NextResponse.json({ tradeoffs: [] });
    }

    // Compute HRV CV from recent sleep HRV readings
    const hrvValues = recentSleep
      .map((s) => s.averageHrv)
      .filter((v): v is number => v != null);
    const computedHrvCv = hrvValues.length >= 5 ? hrvCV(hrvValues) : null;

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
      cyclePhase: phaseLog?.phase ?? null,
      hrvCv: computedHrvCv,
      weeklyRunningKm: running?.walkingRunningDistance
        ? running.walkingRunningDistance / 1000
        : null,
      calorieBalance: null,
    });

    return NextResponse.json({ tradeoffs });
  } catch {
    return NextResponse.json({ tradeoffs: [] });
  }
}
