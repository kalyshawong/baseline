import { prisma } from "@/lib/db";
import { ChatInterface } from "@/components/coach/chat-interface";
import { buildWorkoutDiscussionStarter } from "@/lib/workout-discussion";

export const dynamic = "force-dynamic";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session === "string" ? params.session : null;

  // Deep-link from WorkoutCard's "Discuss with coach →" button. When
  // both params are present, we build a draft message pre-loaded with
  // the workout's full context and seed the chat input with it. The
  // user can edit before sending — we never auto-send.
  const workoutId =
    typeof params.workout === "string" ? params.workout : null;
  const workoutSource =
    typeof params.source === "string" ? params.source : "healthkit";
  const workoutStarter =
    workoutId && !sessionId
      ? await buildWorkoutDiscussionStarter(workoutSource, workoutId)
      : null;

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

  return (
    <div className="mx-auto max-w-[1000px] px-9 py-10">
      {/* Header */}
      <div className="mb-6 text-center">
        <h1 className="disp text-[46px] leading-none">BASELINE COACH</h1>
        <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          Science-backed coaching with full access to your data.
        </p>
      </div>

      {/* Action row */}
      <div className="mb-5 flex items-center justify-center gap-3">
        <a href="/coach" className="btn">+ New Chat</a>
        <a
          href="/coach?view=history"
          className="flex items-center gap-2 panel px-4 py-2 text-[13px] font-semibold tracking-wide text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-gold)] hover:text-[var(--color-text)]"
        >
          History
          {sessions.length > 0 && (
            <span className="min-w-[20px] bg-[var(--color-gold)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--color-bg)]">
              {sessions.length}
            </span>
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
      />
    </div>
  );
}
