import { Suspense } from "react";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { generateInsights } from "@/lib/insights";
import { QuickTag } from "@/components/mind/quick-tag";
import { TagTimeline } from "@/components/mind/tag-timeline";
import { TodayContext } from "@/components/mind/today-context";
import { InsightsFeed } from "@/components/mind/insights-feed";
import { EnvCard } from "@/components/mind/env-card";
import { NutritionInput } from "@/components/mind/nutrition-input";
import { MacroSummary } from "@/components/dashboard/macro-summary";
import { NutritionLog } from "@/components/mind/nutrition-log";
import { LifeContextCard } from "@/components/mind/life-context-card";
import { DateNav } from "@/components/date-nav";
import { getDateFromParams, getLocalDayBounds } from "@/lib/date-utils";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  draft: "bg-neutral-500/20 text-neutral-400",
  active: "bg-emerald-500/20 text-emerald-400",
  completed: "bg-blue-500/20 text-blue-400",
  analyzed: "bg-purple-500/20 text-purple-400",
};

export default async function MindPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewDate = getDateFromParams(params);
  const viewDateStr = viewDate.toISOString().split("T")[0];

  // Date range for tags: start/end of the viewed day in LOCAL time. Tag and
  // nutrition timestamps are stored as true points-in-time, so filtering by
  // UTC midnight bounds causes a timezone skew (tags logged in the local
  // evening spill into the next UTC day). Using local-midnight bounds keeps
  // "Recent Tags" for April 5 to actual-April-5-local events only.
  const { start: dayStart, end: dayEnd } = getLocalDayBounds(viewDateStr);

  const lifeContextDay = new Date(viewDateStr + "T00:00:00.000Z"); // UTC midnight, matches LifeContextLog.day storage

  const [
    experiments,
    dayTags,
    dayReadiness,
    daySleep,
    dayStress,
    cyclePhase,
    latestEnv,
    insights,
    nutritionLog,
    lifeContextDefs,
    lifeContextLogs,
  ] = await Promise.all([
    prisma.experiment.findMany({
      include: { _count: { select: { logs: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.activityTag.findMany({
      where: { timestamp: { gte: dayStart, lt: dayEnd } },
      orderBy: { timestamp: "desc" },
      include: { experiment: { select: { id: true, title: true } } },
    }),
    prisma.dailyReadiness.findFirst({
      where: { day: { lte: viewDate } },
      orderBy: { day: "desc" },
    }),
    prisma.dailySleep.findFirst({
      where: { day: { lte: viewDate }, totalSleepDuration: { not: null } },
      orderBy: { day: "desc" },
    }),
    prisma.dailyStress.findFirst({
      where: { day: { lte: viewDate }, daySummary: { not: null } },
      orderBy: { day: "desc" },
    }),
    prisma.cyclePhaseLog.findFirst({
      where: { day: { lte: viewDate } },
      orderBy: { day: "desc" },
    }),
    prisma.envReading.findFirst({
      orderBy: { timestamp: "desc" },
    }),
    generateInsights(),
    prisma.nutritionLog.findUnique({
      where: { day: viewDate },
      include: { entries: { orderBy: { eatenAt: "asc" } } },
    }),
    prisma.lifeContextDef.findMany({
      where: { archived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lifeContextLog.findMany({
      where: { day: lifeContextDay },
    }),
  ]);

  const active = experiments.filter((e) => e.status === "active");
  const others = experiments.filter((e) => e.status !== "active");

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <Suspense>
        <DateNav basePath="/mind" />
      </Suspense>

      {/* Oura + Cycle Context */}
      <TodayContext
        data={{
          readinessScore: dayReadiness?.score ?? null,
          sleepScore: daySleep?.score ?? null,
          totalSleep: daySleep?.totalSleepDuration ?? null,
          averageHrv: daySleep?.averageHrv ?? null,
          stressSummary: dayStress?.daySummary ?? null,
          cyclePhase: cyclePhase?.phase ?? null,
        }}
      />

      {/* Day-level context flags (with partner, sick, exam day, etc.) */}
      <LifeContextCard
        key={viewDateStr}
        dateStr={viewDateStr}
        defs={lifeContextDefs.map((d) => ({
          id: d.id,
          label: d.label,
          category: d.category,
          emoji: d.emoji ?? null,
          color: d.color ?? null,
          archived: d.archived,
        }))}
        todayLogs={lifeContextLogs.map((l) => ({
          id: l.id,
          defId: l.defId,
          day: typeof l.day === "string" ? l.day : (l.day as unknown as Date).toISOString(),
        }))}
      />

      {/* Quick Tag — pass the viewed date */}
      <QuickTag dateStr={viewDateStr} />

      {/* Nutrition — pass the viewed date */}
      <NutritionInput dateStr={viewDateStr} />
      <MacroSummary
        data={
          nutritionLog
            ? {
                calories: nutritionLog.calories,
                protein: nutritionLog.protein,
                carbs: nutritionLog.carbs,
                fat: nutritionLog.fat,
                entryCount: nutritionLog.entries.length,
              }
            : null
        }
      />
      <NutritionLog
        entries={(nutritionLog?.entries ?? []).map((e) => ({
          id: e.id,
          description: e.description,
          foodName: e.foodName,
          calories: e.calories,
          protein: e.protein,
          carbs: e.carbs,
          fat: e.fat,
          mealType: e.mealType,
          eatenAt: e.eatenAt.toISOString(),
          timeUnknown: e.timeUnknown,
        }))}
      />

      {/* Active Experiments */}
      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Active Experiments
        </h2>
        {active.length === 0 ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center text-sm text-[var(--color-text-muted)]">
            No active experiments.{" "}
            <Link href="/mind/experiments/new" className="underline hover:text-white">
              Start one from a template
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-3">
            {active.map((exp) => {
              const treatmentDays = exp._count.logs;
              const progress = Math.min(100, Math.round((treatmentDays / (exp.minDays * 2)) * 100));
              return (
                <Link
                  key={exp.id}
                  href={`/mind/experiments/${exp.id}`}
                  className="block rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-text-muted)]/30"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{exp.title}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {exp.hypothesis}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[exp.status]}`}>
                      {exp.status}
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                      <span>{treatmentDays} days logged</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className="h-full rounded-full bg-emerald-500/60 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* All Experiments */}
      {others.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            All Experiments
          </h2>
          <div className="space-y-2">
            {others.map((exp) => (
              <Link
                key={exp.id}
                href={`/mind/experiments/${exp.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[var(--color-text-muted)]/30"
              >
                <div>
                  <p className="text-sm font-medium">{exp.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {exp._count.logs} days logged
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[exp.status]}`}>
                  {exp.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Insights Feed */}
      <InsightsFeed insights={insights} />

      {/* Environment Card */}
      <EnvCard
        latest={
          latestEnv
            ? {
                pm25: latestEnv.pm25,
                temperature: latestEnv.temperature,
                humidity: latestEnv.humidity,
                noiseDb: latestEnv.noiseDb,
                timestamp: latestEnv.timestamp.toISOString(),
              }
            : null
        }
      />

      {/* Day's Tags */}
      <TagTimeline
        tags={dayTags.map((t) => ({
          id: t.id,
          tag: t.tag,
          category: t.category,
          timestamp: t.timestamp.toISOString(),
          metadata: t.metadata ?? null,
          experiment: t.experiment ? { id: t.experiment.id, title: t.experiment.title } : null,
        }))}
      />
    </div>
  );
}
