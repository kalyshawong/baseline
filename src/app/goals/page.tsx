import { prisma } from "@/lib/db";
import { GoalsManager } from "@/components/goals/goals-manager";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await prisma.goal.findMany({
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="mx-auto max-w-[1320px] px-9 py-6">
      <div className="mb-10">
        <h1 className="disp text-[46px] leading-none tracking-tight">GOALS</h1>
        <p className="mt-1 text-sm text-[var(--color-faint)]">
          Races, exams, body composition targets — feeds into coach context
        </p>
      </div>

      <GoalsManager
        initialGoals={goals.map((g) => ({
          id: g.id,
          title: g.title,
          type: g.type,
          subtype: g.subtype,
          target: g.target,
          deadline: g.deadline?.toISOString() ?? null,
          status: g.status,
          isPrimary: g.isPrimary,
          priority: g.priority,
          notes: g.notes,
        }))}
      />
    </div>
  );
}
