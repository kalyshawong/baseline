import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import Link from "next/link";
import { generateInsights } from "@/lib/insights";
import { getTestedFindings } from "@/lib/tested-findings";
import { getHrvCvCalibration } from "@/lib/training-call";
import { getFlags } from "@/lib/flags";
import { FlagsFeed } from "@/components/mind/flags-feed";
import { QuickTag } from "@/components/mind/quick-tag";
import { TagTimeline } from "@/components/mind/tag-timeline";
import { phaseInfo } from "@/components/mind/today-context";
import { InsightsFeed } from "@/components/mind/insights-feed";
import { testedDelta } from "@/lib/tested-format";
import { LogPanel } from "@/components/mind/desktop/log-panel";
import { Intake } from "@/components/mind/desktop/intake";
import { MindFindings } from "@/components/mind/desktop/findings";
import type { TestedFinding } from "@/lib/tested-findings";
import { DiagnoseCard } from "@/components/mind/diagnose-card";
import { GiPatternsCard } from "@/components/mind/gi-patterns-card";
import { analyzeMealGi } from "@/lib/meal-gi";
import { EnvCard } from "@/components/mind/env-card";
import { NutritionInput } from "@/components/mind/nutrition-input";
import { MacroSummary } from "@/components/dashboard/macro-summary";
import { NutritionLog } from "@/components/mind/nutrition-log";
import { LifeContextCard } from "@/components/mind/life-context-card";
import { DateNav } from "@/components/date-nav";
import { MobileDateNav } from "@/components/mobile/mobile-date-nav";
import { MobileQuickTag } from "@/components/mobile/mobile-quick-tag";
import { MobileLogFood } from "@/components/mobile/mobile-log-food";
import { getDateFromParams, getLocalDayBounds, getRequestTz } from "@/lib/date-utils";

const PHASE_NOTE: Record<string, string> = {
  menstrual: "Energy lowest — prioritize recovery experiments, not high-load interventions.",
  follicular: "Energy rising — a good window for higher-load interventions.",
  ovulation: "Peak output — strength and power experiments land best now.",
  luteal: "Energy tapering — favor steady, lower-intensity protocols.",
};

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
  const tz = await getRequestTz();
  const viewDate = getDateFromParams(params, tz);
  const viewDateStr = viewDate.toISOString().split("T")[0];

  const { start: dayStart, end: dayEnd } = getLocalDayBounds(viewDateStr, tz);

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
    mealGi,
    testedFindings,
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
    generateInsights(), // → FindingsResult { patterns, collecting }
    getHrvCvCalibration(viewDate),
    getFlags(viewDate),
    prisma.nutritionLog.findUnique({
      where: { userId_day: { userId: await getCurrentUserId(), day: viewDate } },
      include: { entries: { orderBy: { eatenAt: "asc" } } },
    }),
    prisma.lifeContextDef.findMany({
      where: { archived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.lifeContextLog.findMany({
      where: { day: lifeContextDay },
    }),
    // Backward meal->GI analysis (null-safe: fails quietly if gi* not migrated
    // yet). Folded into the batch so its ~6 queries run alongside the rest
    // instead of adding a serial round-trip to the remote DB.
    analyzeMealGi().catch(() => null),
    getTestedFindings().catch(() => ({ tested: [], confirmed: [] })),
  ]);

  // Her own most-used tags (any non-nutrition category) become one-tap
  // chips in Quick Tag — previously "sex" etc. had to be retyped into the
  // custom box every time ("why cant i add my own quick tags").
  const freq = await prisma.activityTag.groupBy({
    by: ["tag", "category"],
    where: {
      timestamp: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) },
      category: { notIn: ["nutrition"] },
    },
    _count: true,
  });
  const presetTagNames = new Set([
    "lo-fi","classical","ambient","binaural","box breathing","wim hof","4-7-8","physiological sigh",
    "coffee","espresso","matcha","pre-workout","wine","beer","spirits","guided","unguided","body scan",
    "walking","strength","cardio","yoga","walk","rest day","social event","alone time","deep conversation",
    "deep work","reading","lecture","practice",
  ]);
  const frequentTags = freq
    .filter((f) => f._count >= 2 && !presetTagNames.has(f.tag))
    .sort((a, b) => b._count - a._count)
    .slice(0, 8)
    .map((f) => ({ tag: f.tag, category: f.category }));

  const active = experiments.filter((e) => e.status === "active");
  const others = experiments.filter((e) => e.status !== "active");

  const slSec = daySleep?.totalSleepDuration ?? null;
  const sleepLabel = slSec != null ? `${Math.floor(slSec / 3600)}h ${Math.floor((slSec % 3600) / 60)}m` : "—";
  const phaseNote = cyclePhase.phase ? PHASE_NOTE[cyclePhase.phase] ?? null : null;

  // Desktop handoff bits
  const deskPhase = cyclePhase.phase ? phaseInfo[cyclePhase.phase] ?? null : null;
  const lifeDefs = lifeContextDefs.map((d) => ({
    id: d.id,
    label: d.label,
    category: d.category,
    emoji: d.emoji ?? null,
    color: d.color ?? null,
    groupKey: d.groupKey ?? null,
    archived: d.archived,
  }));
  const lifeLogs = lifeContextLogs.map((l) => ({
    id: l.id,
    defId: l.defId,
    day: typeof l.day === "string" ? l.day : (l.day as unknown as Date).toISOString(),
  }));
  const foodEntries = (nutritionLog?.entries ?? []).map((e) => ({
    id: e.id,
    description: e.description,
    foodName: e.foodName,
    calories: e.calories,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
    mealType: e.mealType,
    source: e.source ?? null,
    eatenAt: e.eatenAt.toISOString(),
    timeUnknown: e.timeUnknown,
  }));
  // Finished experiments carry their verdict (and pairs) from the tested
  // findings, so a finished row never reads "0 days logged" next to a result.
  const testedByExp = new Map(
    testedFindings.tested
      .filter((t) => t.source === "experiment")
      .map((t) => [t.href?.split("/").pop() ?? t.id, t] as const),
  );

  return (
    <>
      {/* ═══════════ MOBILE (Baseline iOS — Mind) ═══════════ */}
      <div className="md:hidden">
        <div className="bl-m">
          <div className="appbar">
            <div>
              <h1>MIND MODE</h1>
              <div className="sub">Structured self-experimentation</div>
            </div>
            <Suspense>
              <MobileDateNav basePath="/mind" />
            </Suspense>
          </div>

          <div className="ctxbar">
            <div className="c">
              <div className="k">Readiness</div>
              <div className="v num">{dayReadiness?.score ?? "—"}</div>
            </div>
            <div className="c">
              <div className="k">Sleep</div>
              <div className="v num">{sleepLabel}</div>
            </div>
            <div className="c">
              <div className="k">HRV</div>
              <div className="v num">
                {daySleep?.averageHrv ?? "—"}
                <small> ms</small>
              </div>
            </div>
          </div>

          {cyclePhase.phase && (
            <div className="phasebox">
              <span className="p">{cyclePhase.phase}</span>
              {phaseNote && <span className="note">{phaseNote}</span>}
            </div>
          )}

          <div className="g-sec">Inputs · Log</div>
          <div className="wrap">
            <div className="stack-lg">
              <MobileQuickTag dateStr={viewDateStr} frequentTags={frequentTags} />
              <MobileLogFood dateStr={viewDateStr} />
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
                dateStr={viewDateStr}
                mealsComplete={nutritionLog?.mealsComplete ?? false}
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
                key={`m-${viewDateStr}`}
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

          <div className="g-sec">Findings</div>
          <div className="wrap">
            <div className="stack-lg">
              {flags.length > 0 && <FlagsFeed flags={flags} />}
              <DiagnoseCard />
              <InsightsFeed insights={insights.patterns} collecting={insights.collecting} tested={testedFindings.tested} calibration={hrvCalibration} />
              {mealGi && <GiPatternsCard result={mealGi} />}
              {active.length > 0 && (
                <div className="panel">
                  <p className="ov" style={{ marginBottom: 12 }}>Active Experiments</p>
                  <div className="stack">
                    {active.map((exp) => {
                      const treatmentDays = exp._count.logs;
                      const progress = Math.min(100, Math.round((treatmentDays / (exp.minDays * 2)) * 100));
                      return (
                        <Link key={exp.id} href={`/mind/experiments/${exp.id}`} className="lrow">
                          <div>
                            <div className="nm">{exp.title}</div>
                            <div className="dt">{treatmentDays} days logged · {progress}%</div>
                          </div>
                          <span className={statusColors[exp.status]}>{exp.status}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ DESKTOP — Claude Design Mind handoff (2026-09-23) ═══════════
       * Reading order: today → what I logged → what it's telling me → what I'm
       * testing. Styles: mind-desktop.css, scoped under .mm. */}
      <div className="hidden md:block">
        <div className="mm mx-auto max-w-[1320px] pb-12">
          <div className="pagebar" style={{ padding: "28px 36px 0", gap: 20 }}>
            <div>
              <h1>MIND MODE</h1>
              <div className="sub">Structured self-experimentation</div>
            </div>
            <Suspense>
              <DateNav basePath="/mind" />
            </Suspense>
          </div>

          <section className="today">
            <div className="c">
              <div className="k">Readiness</div>
              <div className="v num">{dayReadiness?.score ?? "—"}</div>
            </div>
            <div className="c">
              <div className="k">Sleep</div>
              <div className="v num">{sleepLabel}</div>
            </div>
            <div className="c">
              <div className="k">HRV</div>
              <div className="v num">
                {daySleep?.averageHrv != null ? Math.round(daySleep.averageHrv) : "—"}
                {daySleep?.averageHrv != null && <small> ms</small>}
              </div>
            </div>
            <div className="c">
              <div className="k">Stress</div>
              <div className="v">
                {dayStress?.daySummary
                  ? dayStress.daySummary.charAt(0).toUpperCase() + dayStress.daySummary.slice(1)
                  : "—"}
              </div>
            </div>
            <div className="c phase">
              {deskPhase ? (
                <>
                  <span className="ph-pill">{deskPhase.label}</span>
                  <span className="note">{deskPhase.note}</span>
                </>
              ) : (
                <span className="note">No cycle data</span>
              )}
            </div>
          </section>

          <main className="mind">
            {/* ═══ LEFT: Log ═══ */}
            <div className="col">
              <div className="colhead">Log</div>
              <LogPanel
                tz={tz}
                tag={<QuickTag bare dateStr={viewDateStr} frequentTags={frequentTags} />}
                food={<NutritionInput bare dateStr={viewDateStr} />}
                ctx={
                  <LifeContextCard
                    bare
                    key={viewDateStr}
                    dateStr={viewDateStr}
                    defs={lifeDefs}
                    todayLogs={lifeLogs}
                  />
                }
                tags={dayTags.map((t) => ({
                  id: t.id,
                  tag: t.tag,
                  category: t.category,
                  timestamp: t.timestamp.toISOString(),
                  timeUnknown: tagTimeUnknown(t.metadata),
                  experimentTitle: t.experiment?.title ?? null,
                }))}
              />
              <Intake
                tz={tz}
                dateStr={viewDateStr}
                mealsComplete={nutritionLog?.mealsComplete ?? false}
                totals={
                  nutritionLog
                    ? { calories: nutritionLog.calories, protein: nutritionLog.protein, carbs: nutritionLog.carbs, fat: nutritionLog.fat }
                    : null
                }
                entries={foodEntries}
              />
            </div>

            {/* ═══ RIGHT: Findings, then Experiments ═══ */}
            <div className="col">
              <MindFindings
                insights={insights.patterns}
                collecting={insights.collecting}
                tested={testedFindings.tested}
                calibration={hrvCalibration}
                mealGi={mealGi}
                alerts={
                  <>
                    {flags.length > 0 && <FlagsFeed flags={flags} />}
                    <DiagnoseCard />
                  </>
                }
              />

              <div className="colhead" style={{ marginTop: 14 }}>
                Experiments
              </div>
              <div className="p">
                <div className="p-h">
                  <span className="ov">Active</span>
                  <span className="k">{active.length} running</span>
                </div>
                {active.length === 0 ? (
                  <p className="empty">
                    No active experiments.{" "}
                    <Link href="/mind/experiments/new" className="linklike">
                      Start from a template.
                    </Link>
                  </p>
                ) : (
                  active.map((exp) => {
                    const days = exp._count.logs;
                    const progress = Math.min(100, Math.round((days / (exp.minDays * 2)) * 100));
                    return (
                      <Link key={exp.id} href={`/mind/experiments/${exp.id}`} className="xa">
                        <div className="top">
                          <div>
                            <div className="t">{exp.title}</div>
                            <div className="d">{exp.hypothesis}</div>
                          </div>
                          <span className="pill g">Active</span>
                        </div>
                        <div className="prog">
                          <div className="bar">
                            <i style={{ width: `${progress}%` }} />
                          </div>
                          <div className="k">
                            <span>{days} days logged</span>
                            <span>{progress}%</span>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
                {others.length > 0 && (
                  <>
                    <div className="p-h" style={{ margin: "20px 0 0" }}>
                      <span className="ov">Finished</span>
                    </div>
                    <ul className="xlist">
                      {others.map((exp) => {
                        const r = testedByExp.get(exp.id);
                        return (
                          <li key={exp.id}>
                            <Link href={`/mind/experiments/${exp.id}`}>
                              <div className="t">
                                {exp.title}
                                <span>
                                  {r ? `${r.blocks} pairs · ${r.outcomeLabel}` : `${exp._count.logs} days logged`}
                                </span>
                              </div>
                              <span className={`res${r && r.decision.startsWith("inconclusive") ? " dim" : ""}`}>
                                {r ? verdictLabel(r) : ""}
                              </span>
                              <span className="pill muted">{exp.status}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>

              {latestEnv ? (
                <EnvCard
                  latest={{
                    pm25: latestEnv.pm25,
                    temperature: latestEnv.temperature,
                    humidity: latestEnv.humidity,
                    noiseDb: latestEnv.noiseDb,
                    timestamp: latestEnv.timestamp.toISOString(),
                  }}
                />
              ) : (
                <div className="env">
                  <span className="k">Environment</span>No sensor data yet.
                  <span className="linklike">Connect your ESP32</span>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

function tagTimeUnknown(metadata: string | null): boolean {
  if (!metadata) return false;
  try {
    const v = JSON.parse(metadata);
    return !!v && typeof v === "object" && v.timeUnknown === true;
  } catch {
    return false;
  }
}

function verdictLabel(t: TestedFinding): string {
  const p = `P ${t.randTestP < 0.001 ? "<0.001" : t.randTestP}`;
  if (t.decision === "effect_found") return `Effect ${testedDelta(t) ?? ""} · ${p}`.replace("  ", " ");
  if (t.decision === "no_effect_at_mde") return `No effect · ${p}`;
  if (t.decision === "inconclusive_low_adherence") return "Too few days";
  return `Inconclusive · ${p}`;
}
