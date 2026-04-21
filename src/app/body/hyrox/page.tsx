import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentBlock } from "@/lib/hyrox-blocks";
import { formatClockTime } from "@/lib/hyrox-pace";
import { maybeArchivePlan } from "@/lib/hyrox-archive";
import { CountdownRing } from "@/components/goals/countdown-ring";
import { recommendSession } from "@/lib/hyrox-session-recommender";
import { hrvCV } from "@/lib/training";

export const dynamic = "force-dynamic";

const SESSION_TYPE_LABELS: Record<string, string> = {
  easy_run: "Easy Run",
  tempo: "Tempo",
  intervals: "Intervals",
  long_run: "Long Run",
  strength: "Strength",
  compromised: "Compromised",
  station_work: "Station Work",
  recovery: "Recovery",
  race_simulation: "Race Simulation",
};

const HARD_SESSION_TYPES = [
  "intervals",
  "tempo",
  "compromised",
  "long_run",
  "race_simulation",
] as const;

export default async function HyroxPage() {
  const plan = await prisma.hyroxPlan.findFirst({
    where: { status: "active" },
    include: { goal: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          No active Hyrox plan. Set a race goal with subtype=hyrox to auto-create one.
        </p>
        <Link
          href="/goals"
          className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/30"
        >
          Go to Goals
        </Link>
      </div>
    );
  }

  const archivedPlan = await maybeArchivePlan(plan);
  if (archivedPlan.status !== "active") {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-sm text-[var(--color-text-muted)]">
          Your Hyrox plan was archived (race date passed).
        </p>
        <Link
          href="/goals"
          className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-500/30"
        >
          Create a new goal
        </Link>
      </div>
    );
  }

  const today = new Date();
  const blk = currentBlock(archivedPlan, today);

  // Fetch readiness signals for session recommendation
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [readinessRow, sleepRow, recentSleeps, cycleRow, lastHardSession] =
    await Promise.all([
      prisma.dailyReadiness.findFirst({
        where: { day: { lte: today } },
        orderBy: { day: "desc" },
      }),
      prisma.dailySleep.findFirst({
        where: { day: { lte: today }, totalSleepDuration: { not: null } },
        orderBy: { day: "desc" },
      }),
      prisma.dailySleep.findMany({
        where: {
          day: { gte: sevenDaysAgo, lte: today },
          averageHrv: { not: null },
        },
        orderBy: { day: "desc" },
        take: 7,
      }),
      prisma.cyclePhaseLog.findFirst({
        where: { day: { lte: today } },
        orderBy: { day: "desc" },
      }),
      prisma.hyroxSession.findFirst({
        where: {
          planId: archivedPlan.id,
          sessionType: { in: [...HARD_SESSION_TYPES] },
          day: { lte: today },
        },
        orderBy: { day: "desc" },
      }),
    ]);

  const readiness = readinessRow?.score ?? null;
  const sleepSeconds = sleepRow?.totalSleepDuration ?? null;
  const sleepHours = sleepSeconds !== null ? sleepSeconds / 3600 : null;

  const hrvValues = recentSleeps
    .map((s) => s.averageHrv)
    .filter((v): v is number => v != null);
  const cv = hrvValues.length >= 3 ? hrvCV(hrvValues) : null;

  const daysSinceLastHardSession: number | null = lastHardSession
    ? Math.max(
        0,
        Math.floor(
          (startOfDay(today).getTime() -
            startOfDay(lastHardSession.day).getTime()) /
            86400000,
        ),
      )
    : null;

  const rec = recommendSession({
    plan: archivedPlan,
    readiness,
    hrvCv: cv,
    sleepHours,
    cyclePhase: cycleRow?.phase ?? null,
    daysSinceLastHardSession,
    today,
  });

  return (
    <div className="space-y-4">
      {/* ─── HEADER CARD ─── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold tracking-tight">
              {plan.goal.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-medium uppercase text-amber-400">
                hyrox
              </span>
              <span>Target: {formatClockTime(archivedPlan.targetTime)}</span>
              <span className="opacity-50">|</span>
              <span className="capitalize">
                {blk.block} &middot; week {blk.weekInBlock}
              </span>
            </div>
          </div>
          <CountdownRing
            deadline={archivedPlan.raceDate.toISOString()}
            createdAt={archivedPlan.startDate.toISOString()}
            size={56}
            color="rgb(245 158 11)"
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-lg bg-[var(--color-bg)] p-2">
            <div className="text-lg font-bold">{blk.daysToRace}</div>
            <div className="text-[var(--color-text-muted)]">days to race</div>
          </div>
          <div className="rounded-lg bg-[var(--color-bg)] p-2">
            <div className="text-lg font-bold">{blk.volumeMultiplier}x</div>
            <div className="text-[var(--color-text-muted)]">volume</div>
          </div>
          <div className="rounded-lg bg-[var(--color-bg)] p-2">
            <div className="text-lg font-bold">{blk.intensityMultiplier}x</div>
            <div className="text-[var(--color-text-muted)]">intensity</div>
          </div>
        </div>
      </div>

      {/* ─── TODAY'S SESSION CARD ─── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h3 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Today&rsquo;s Session
        </h3>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-400">
              {SESSION_TYPE_LABELS[rec.sessionType] ?? rec.sessionType}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {rec.durationMin} min
            </span>
          </div>

          <p className="text-sm font-medium">{rec.title}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {rec.prescription}
          </p>

          <div className="rounded-lg bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-muted)]">
            <span className="font-medium">Rationale:</span> {rec.rationale}
          </div>

          {rec.warnings.length > 0 && (
            <div className="space-y-1">
              {rec.warnings.map((w, i) => (
                <div
                  key={i}
                  className="rounded-lg bg-red-500/10 p-2 text-xs text-red-400"
                >
                  {w}
                </div>
              ))}
            </div>
          )}

          <button
            disabled
            className="mt-2 w-full rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-400 opacity-50 cursor-not-allowed"
          >
            Start this session (Phase 2)
          </button>
        </div>
      </div>

      <Link
        href="/body"
        className="block text-center text-xs text-[var(--color-text-muted)] hover:underline"
      >
        &larr; Back to Body
      </Link>
    </div>
  );
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
