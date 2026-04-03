import { prisma } from "@/lib/db";
import { getTodayScore, getWeekSnapshots } from "@/lib/baseline-score";
import { BaselineScoreCard } from "@/components/dashboard/baseline-score-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { CyclePhaseSelector } from "@/components/dashboard/cycle-phase-selector";
import { MetricCard } from "@/components/dashboard/metric-card";
import { SyncButton } from "@/components/dashboard/sync-button";

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  let score = null;
  let weekData: Awaited<ReturnType<typeof getWeekSnapshots>> = [];
  let todaySleep = null;
  let todayReadiness = null;
  let todayStress = null;
  let currentPhase: string | null = null;
  let lastSync = null;
  let isConnected = false;

  try {
    const token = await prisma.ouraToken.findFirst();
    isConnected = !!token;

    if (isConnected) {
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      [score, weekData, todayReadiness, lastSync] =
        await Promise.all([
          getTodayScore(),
          getWeekSnapshots(),
          prisma.dailyReadiness.findUnique({ where: { day: today } }),
          prisma.syncLog.findFirst({ orderBy: { syncDate: "desc" } }),
        ]);

      // For sleep/stress, use today if complete, otherwise fall back to most recent with data
      todaySleep =
        await prisma.dailySleep.findFirst({
          where: { day: { lte: today }, totalSleepDuration: { not: null } },
          orderBy: { day: "desc" },
        }) ??
        await prisma.dailySleep.findUnique({ where: { day: today } });

      todayStress =
        await prisma.dailyStress.findFirst({
          where: { day: { lte: today }, daySummary: { not: null } },
          orderBy: { day: "desc" },
        }) ??
        await prisma.dailyStress.findUnique({ where: { day: today } });

      const phaseLog = await prisma.cyclePhaseLog.findUnique({
        where: { day: today },
      });
      currentPhase = phaseLog?.phase ?? null;
    }
  } catch {
    // DB not connected yet — show empty state
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Baseline</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <SyncButton />
          ) : (
            <a
              href="/api/auth/oura"
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20"
            >
              Connect Oura
            </a>
          )}
          {lastSync && (
            <span className="text-xs text-[var(--color-text-muted)]">
              Last sync:{" "}
              {lastSync.syncDate.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Baseline Score */}
      <div className="mb-6">
        <BaselineScoreCard score={score} />
      </div>

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Readiness"
          value={todayReadiness?.score ?? null}
          detail="Oura readiness"
        />
        <MetricCard
          label="Sleep"
          value={todaySleep ? formatDuration(todaySleep.totalSleepDuration) : null}
          detail={
            todaySleep?.sleepEfficiency
              ? `${todaySleep.sleepEfficiency}% efficiency`
              : undefined
          }
        />
        <MetricCard
          label="HRV"
          value={todaySleep?.averageHrv ?? null}
          unit="ms"
          detail="Avg overnight"
        />
        <MetricCard
          label="Stress"
          value={
            todayStress?.daySummary
              ? todayStress.daySummary.charAt(0).toUpperCase() +
                todayStress.daySummary.slice(1)
              : null
          }
          detail={
            todayStress?.recoveryHigh
              ? `${Math.round(todayStress.recoveryHigh / 60)}m recovery`
              : undefined
          }
        />
      </div>

      {/* Trend Chart */}
      <div className="mb-6">
        <TrendChart data={weekData} />
      </div>

      {/* Cycle Phase */}
      <CyclePhaseSelector currentPhase={currentPhase} />

      {/* Sleep Breakdown */}
      {todaySleep && (
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Sleep Breakdown
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-lg font-bold tabular-nums">
                {formatDuration(todaySleep.deepSleepDuration)}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">Deep</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">
                {formatDuration(todaySleep.remSleepDuration)}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">REM</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">
                {formatDuration(todaySleep.lightSleepDuration)}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">Light</p>
            </div>
          </div>
          {todaySleep.lowestHeartRate && (
            <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">
              Lowest HR: {todaySleep.lowestHeartRate} bpm
            </p>
          )}
        </div>
      )}
    </main>
  );
}
