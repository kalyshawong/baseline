import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { getLocalDay } from "@/lib/date-utils";
import { getScoreForDate } from "@/lib/baseline-score";
import { computeTrainingCall, hrvCV, rollingHrvCvBaseline, isHrvCvElevated, computeFatigueScore } from "@/lib/training";
import { getHrvBaselineChoice } from "@/lib/training-call";
import { ChatInterface } from "@/components/coach/chat-interface";
import { MobileCoach } from "@/components/mobile/mobile-coach";
import { buildWorkoutDiscussionStarter } from "@/lib/workout-discussion";

export const dynamic = "force-dynamic";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session === "string" ? params.session : null;

  const workoutId =
    typeof params.workout === "string" ? params.workout : null;
  const workoutSource =
    typeof params.source === "string" ? params.source : "healthkit";
  const workoutStarter =
    workoutId && !sessionId
      ? await buildWorkoutDiscussionStarter(workoutSource, workoutId)
      : null;

  // Build daily brief summary from real data
  const localToday = getLocalDay();
  const [score, recentSleep, dayStress, cyclePhase] = await Promise.all([
    getScoreForDate(localToday),
    prisma.dailySleep.findMany({
      where: { day: { lte: localToday }, averageHrv: { not: null } },
      orderBy: { day: "desc" },
      take: 14,
      select: { averageHrv: true, score: true },
    }),
    prisma.dailyStress.findUnique({ where: { userId_day: { userId: getCurrentUserId(), day: localToday } } }),
    (async () => {
      const { resolveCyclePhase } = await import("@/lib/cycle-phase");
      return resolveCyclePhase(localToday);
    })(),
  ]);

  const hrvValues = recentSleep.map((s) => s.averageHrv).filter((v): v is number => v != null);
  const cv = hrvCV(hrvValues.slice(0, 7));
  const hrvBaselineSleep = await prisma.dailySleep.findMany({
    where: { day: { lte: localToday }, averageHrv: { not: null } },
    orderBy: { day: "desc" },
    take: 60,
    select: { averageHrv: true },
  });
  const personalBaseline = rollingHrvCvBaseline(
    hrvBaselineSleep.map((s) => s.averageHrv).filter((v): v is number => v != null)
  );
  const hrvChoice = await getHrvBaselineChoice();
  const hrvCvBaseline = hrvChoice === "standard" ? null : personalBaseline;
  const hrvCvElevated = isHrvCvElevated(cv, hrvCvBaseline);

  const allSessions2 = await prisma.workoutSession.findMany({
    where: { completedAt: { not: null } },
    orderBy: { date: "desc" },
    select: { date: true },
    take: 60,
  });
  let weeksSinceDeload = 0;
  if (allSessions2.length > 0) {
    const weekSet = new Set<string>();
    for (const s of allSessions2) {
      const d = s.date;
      const dow = d.getUTCDay() || 7;
      const ws = new Date(d);
      ws.setUTCDate(d.getUTCDate() - (dow - 1));
      weekSet.add(ws.toISOString().split("T")[0]);
    }
    const sorted = Array.from(weekSet).sort().reverse();
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) { weeksSinceDeload++; continue; }
      const prev = new Date(sorted[i - 1] + "T00:00:00Z");
      const curr = new Date(sorted[i] + "T00:00:00Z");
      if (Math.abs((prev.getTime() - curr.getTime()) / (7 * 86400000) - 1) < 0.5) weeksSinceDeload++;
      else break;
    }
  }

  const fatigue = computeFatigueScore({
    weeksSinceLastDeload: weeksSinceDeload,
    hrvBelowBaseline: false,
    hrvCvElevated,
    sleepQualityDecline: false,
    rhrElevated: false,
    rpeCreep: false,
    volumeApproachingMRV: false,
  });

  const trainingCall = computeTrainingCall({
    baselineScore: score?.overall ?? null,
    cyclePhase: cyclePhase.phase,
    hrvCv: cv,
    hrvCvBaseline,
    fatigueScore: fatigue.score,
    stressSummary: dayStress?.daySummary ?? null,
  });

  // Build the brief summary
  const briefTitle = trainingCall
    ? `${trainingCall.verdict} day — ${trainingCall.actionLine?.toLowerCase() ?? "listen to your body"}`
    : "Check your readiness";
  const briefBody = trainingCall
    ? `Readiness is ${score?.overall ? `solid at **${score.overall}**` : "pending"}${cv ? `, but HRV's noisy (CV ${cv.toFixed(0)}%)` : ""}${cyclePhase.phase ? `. ${cyclePhase.phase.charAt(0).toUpperCase() + cyclePhase.phase.slice(1)} phase` : ""}. ${trainingCall.whyLine}`
    : "Sync your data to see today's brief.";

  const [sessions, currentSession, activeGoals] = await Promise.all([
    prisma.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    sessionId
      ? prisma.chatSession.findUnique({
          where: { id: sessionId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        })
      : Promise.resolve(null),
    prisma.goal.findMany({
      where: { status: "active" },
      orderBy: [{ isPrimary: "desc" }, { deadline: "asc" }],
    }),
  ]);

  const mobileMessages = (currentSession?.messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
  const mobileGoals = activeGoals.map((g) => ({
    id: g.id,
    title: g.title,
    type: g.type,
    subtype: g.subtype,
    isPrimary: g.isPrimary,
    deadline: g.deadline?.toISOString() ?? null,
  }));

  return (
    <>
      {/* ═══════════ MOBILE (Baseline iOS — Coach) ═══════════ */}
      <div className="md:hidden">
        <MobileCoach
          initialSession={currentSession ? { id: currentSession.id, title: currentSession.title } : null}
          initialMessages={mobileMessages}
          sessions={sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt.toISOString() }))}
          goals={mobileGoals}
          initialInput={workoutStarter}
          dailyBrief={{ title: briefTitle, body: briefBody }}
        />
      </div>

      {/* ═══════════ DESKTOP (unchanged) ═══════════ */}
      <div className="hidden md:block">
      <div className="mx-auto max-w-[1000px] pt-[18px]">
      {/* Header — centered */}
      <div className="text-center pt-[14px] pb-1">
        <h1 className="disp text-[46px] leading-[0.9] tracking-[0.02em]">BASELINE COACH</h1>
        <p className="mt-1 text-[14px] font-medium text-[var(--color-text-muted)]">
          Science-backed coaching with full access to your data.
        </p>
      </div>

      {/* Action bar — New Chat left, History right per design .focusbar */}
      <div className="flex items-center justify-between mb-[14px]">
        <a href="/coach" className="btn" style={{ width: "auto", padding: "11px 20px" }}>
          + New Chat
        </a>
        <a
          href="/coach?view=history"
          className="inline-flex items-center gap-2 text-[12.5px] font-bold tracking-[0.04em] px-4 py-[11px] cursor-pointer"
          style={{
            color: "var(--color-text-muted)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          &#9201; History
          {sessions.length > 0 && (
            <b style={{ color: "var(--color-gold)" }}>{sessions.length}</b>
          )}
        </a>
      </div>

      <ChatInterface
        initialSession={currentSession ? { id: currentSession.id, title: currentSession.title } : null}
        initialMessages={(currentSession?.messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt.toISOString(),
        }))}
        sessions={sessions.map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt.toISOString() }))}
        goals={activeGoals.map((g) => ({
          id: g.id,
          title: g.title,
          type: g.type,
          subtype: g.subtype,
          isPrimary: g.isPrimary,
          deadline: g.deadline?.toISOString() ?? null,
        }))}
        initialInput={workoutStarter}
        dailyBrief={{ title: briefTitle, body: briefBody }}
      />
    </div>
      </div>
    </>
  );
}
