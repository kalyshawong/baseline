import { prisma } from "@/lib/db";
import { GoalsManager } from "@/components/goals/goals-manager";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await prisma.goal.findMany({
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Goals</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Races, exams, body composition targets — feeds into coach context
        </p>
      </div>

      <GoalsManager
        initialGoals={goals.map((g) => ({
          id: g.id,
          title: g.title,
          type: g.type,
          target: g.target,
          deadline: g.deadline?.toISOString() ?? null,
          status: g.status,
          notes: g.notes,
        }))}
      />
    </div>
  );
}
