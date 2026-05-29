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
    <div className="mx-auto max-w-[1000px] px-9 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">Baseline Coach</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Science-backed coaching with full access to your biometric, training, nutrition, cycle, and goal data.
        </p>
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
