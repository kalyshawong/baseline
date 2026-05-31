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
      <div className="flex items-center justify-between" style={{ paddingTop: "26px" }}>
        <div>
          <h1 className="disp text-[46px] leading-[0.9] tracking-[0.02em] whitespace-nowrap">MIND MODE</h1>
          <p className="mt-[3px] text-[14px] font-medium text-[var(--color-text-muted)]">
            Structured self-experimentation
          </p>
        </div>
        <Suspense>
          <DateNav basePath="/mind" />
        </Suspense>
      </div>

      {/* ── Context bar (full-width) ── */}
      <div className="mt-4">
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

      {/* ── Two-column split — design: .wb ── */}
      <div className="grid grid-cols-[360px_1fr] gap-4 pt-4 items-start">
        {/* ═══ LEFT: Inputs / Log ═══ */}
        <div>
          <ColHead>Inputs &middot; Log</ColHead>

          <div className="flex flex-col gap-[14px]">
            <QuickTag dateStr={viewDateStr} />
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
                source: e.source,
                eatenAt: e.eatenAt.toISOString(),
                timeUnknown: e.timeUnknown,
              }))}
            />

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
          <ColHead>Findings</ColHead>

          {/* Flags */}
          {flags.length > 0 && (
            <div className="mb-6">
              <FlagsFeed flags={flags} />
            </div>
          )}

          {/* Insights feed with filter bar + featured finding */}
          <InsightsFeed insights={insights} calibration={hrvCalibration} />

          {/* Active Experiments + Environment — side by side tiles per design */}
          <div className="grid grid-cols-2 gap-[14px] mt-[14px]">
            <div className="panel">
              <p className="ov mb-3">Active Experiments</p>
              {active.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]">
                  No active experiments.{" "}
                  <Link href="/mind/experiments/new" className="linklike">
                    Start from a template.
                  </Link>
                </p>
              ) : (
                <div className="space-y-2">
                  {active.map((exp) => {
                    const treatmentDays = exp._count.logs;
                    const progress = Math.min(100, Math.round((treatmentDays / (exp.minDays * 2)) * 100));
                    return (
                      <Link
                        key={exp.id}
                        href={`/mind/experiments/${exp.id}`}
                        className="block bg-[var(--color-surface-2)] p-3 text-xs transition hover:bg-white/10"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">{exp.title}</p>
                            <p className="mt-1 text-[var(--color-text-muted)]">{exp.hypothesis}</p>
                          </div>
                          <span className={statusColors[exp.status]}>{exp.status}</span>
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-[var(--color-text-muted)]">
                            <span>{treatmentDays} days logged</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="mt-1 h-1.5 bg-[var(--color-surface)]">
                            <div
                              className="h-full transition-all"
                              style={{ width: `${progress}%`, background: "var(--color-green)" }}
                            />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

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

          {/* All Experiments (compact list below tiles) */}
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
                    className="panel flex items-center justify-between !py-3 transition hover:brightness-110"
                  >
                    <div>
                      <p className="text-sm font-medium">{exp.title}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {exp._count.logs} days logged
                      </p>
                    </div>
                    <span className={statusColors[exp.status]}>{exp.status}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Column header — gold overline with trailing line. Design: .colhead */
function ColHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[13px] flex items-center gap-3">
      <p
        className="text-[11px] font-extrabold uppercase tracking-[0.2em] shrink-0"
        style={{ color: "var(--color-gold)" }}
      >
        {children}
      </p>
      <div className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}
