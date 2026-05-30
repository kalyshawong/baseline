import { Suspense } from "react";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { generateInsights } from "@/lib/insights";
import { getHrvCvCalibration } from "@/lib/training-call";
import { getFlags } from "@/lib/flags";
import { FlagsFeed } from "@/components/mind/flags-feed";
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
  draft: "pill pill-muted",
  active: "pill pill-g",
  completed: "pill pill-a",
  analyzed: "pill pill-muted",
};

export default async function MindPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const viewDate = getDateFromParams(params);
  const viewDateStr = viewDate.toISOString().split("T")[0];

  const { start: dayStart, end: dayEnd } = getLocalDayBounds(viewDateStr);

  const lifeContextDay = new Date(viewDateStr + "T00:00:00.000Z");

  const [
    experiments,
    dayTags,
    dayReadiness,
    daySleep,
    dayStress,
    cyclePhase,
    latestEnv,
    insights,
    hrvCalibration,
    flags,
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
    (async () => {
      const { resolveCyclePhase } = await import("@/lib/cycle-phase");
      return resolveCyclePhase(viewDate);
    })(),
    prisma.envReading.findFirst({
      orderBy: { timestamp: "desc" },
    }),
    generateInsights(),
    getHrvCvCalibration(viewDate),
    getFlags(viewDate),
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
    <div>
      {/* ── Page header ── */}
      <div className="flex items-center justify-between px-9 pt-6">
        <div>
          <h1 className="disp text-[46px] leading-none tracking-tight">MIND MODE</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Structured self-experimentation
          </p>
        </div>
        <Suspense>
          <DateNav basePath="/mind" />
        </Suspense>
      </div>

      {/* ── Context bar (full-width) ── */}
      <div className="px-9 pt-5">
        <TodayContext
          data={{
            readinessScore: dayReadiness?.score ?? null,
            sleepScore: daySleep?.score ?? null,
            totalSleep: daySleep?.totalSleepDuration ?? null,
            averageHrv: daySleep?.averageHrv ?? null,
            stressSummary: dayStress?.daySummary ?? null,
            cyclePhase: cyclePhase.phase,
          }}
        />
      </div>

      {/* ── Two-column split ── */}
      <div className="grid grid-cols-[360px_1fr] gap-4 px-9 pt-4 items-start">
        {/* ═══ LEFT: Inputs / Log ═══ */}
        <div>
          {/* Column header */}
          <div className="mb-3 flex items-center gap-3">
            <p className="ov shrink-0" style={{ color: "var(--color-gold)" }}>
              Inputs &middot; Log
            </p>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <div className="flex flex-col gap-[14px]">
            {/* Quick Tag */}
            <QuickTag dateStr={viewDateStr} />

            {/* Log Food */}
            <NutritionInput dateStr={viewDateStr} />

            {/* Macro summary */}
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

            {/* Nutrition log entries */}
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
                source: e.source,
                eatenAt: e.eatenAt.toISOString(),
                timeUnknown: e.timeUnknown,
              }))}
            />

            {/* Life Context */}
            <LifeContextCard
              key={viewDateStr}
              dateStr={viewDateStr}
              defs={lifeContextDefs.map((d) => ({
                id: d.id,
                label: d.label,
                category: d.category,
                emoji: d.emoji ?? null,
                color: d.color ?? null,
                groupKey: d.groupKey ?? null,
                archived: d.archived,
              }))}
              todayLogs={lifeContextLogs.map((l) => ({
                id: l.id,
                defId: l.defId,
                day: typeof l.day === "string" ? l.day : (l.day as unknown as Date).toISOString(),
              }))}
            />

            {/* Day's Tags timeline */}
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
        </div>

        {/* ═══ RIGHT: Findings ═══ */}
        <div>
          {/* Column header */}
          <div className="mb-3 flex items-center gap-3">
            <p className="ov shrink-0" style={{ color: "var(--color-gold)" }}>
              Findings
            </p>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          {/* Flags — "what doesn't add up." Kept distinct from Insights
              (correlations) since it's the system flagging contradictions,
              bad data, and assumption mismatches. */}
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-3">
              <p className="ov shrink-0" style={{ color: "var(--color-gold)" }}>
                Flags &middot; worth a look
              </p>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            <FlagsFeed flags={flags} />
          </div>

          {/* Insights feed with filter bar */}
          <InsightsFeed insights={insights} calibration={hrvCalibration} />

          {/* Active Experiments */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-3">
              <p className="ov shrink-0" style={{ color: "var(--color-gold)" }}>
                Active Experiments
              </p>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
            </div>
            {active.length === 0 ? (
              <div className="empty-state">
                No active experiments.{" "}
                <Link href="/mind/experiments/new" className="linklike">
                  Start one from a template
                </Link>
                .
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {active.map((exp) => {
                  const treatmentDays = exp._count.logs;
                  const progress = Math.min(100, Math.round((treatmentDays / (exp.minDays * 2)) * 100));
                  return (
                    <Link
                      key={exp.id}
                      href={`/mind/experiments/${exp.id}`}
                      className="panel block transition duration-150 ease-out-strong active:scale-[0.97] hover:brightness-110"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium">{exp.title}</p>
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            {exp.hypothesis}
                          </p>
                        </div>
                        <span className={statusColors[exp.status]}>
                          {exp.status}
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                          <span>{treatmentDays} days logged</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="mt-1 h-1.5 bg-[var(--color-surface-2)]">
                          <div
                            className="h-full bg-[var(--color-green)] transition-all"
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
            <div className="mt-4">
              <div className="mb-3 flex items-center gap-3">
                <p className="ov shrink-0">All Experiments</p>
                <div className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
              <div className="space-y-2">
                {others.map((exp) => (
                  <Link
                    key={exp.id}
                    href={`/mind/experiments/${exp.id}`}
                    className="panel flex items-center justify-between !py-3 transition duration-150 ease-out-strong active:scale-[0.97] hover:brightness-110"
                  >
                    <div>
                      <p className="text-sm font-medium">{exp.title}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {exp._count.logs} days logged
                      </p>
                    </div>
                    <span className={statusColors[exp.status]}>
                      {exp.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Environment Card */}
          <div className="mt-4">
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
          </div>
        </div>
      </div>
    </div>
  );
}
