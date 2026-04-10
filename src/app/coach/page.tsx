import { prisma } from "@/lib/db";
import { ChatInterface } from "@/components/coach/chat-interface";

export const dynamic = "force-dynamic";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sessionId = typeof params.session === "string" ? params.session : null;

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
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">Baseline Coach</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Science-backed advice grounded in your real data
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
      />
    </div>
  );
}
