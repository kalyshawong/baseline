import { prisma } from "@/lib/db";
import { GoalsManager } from "@/components/goals/goals-manager";
import { MobileGoals } from "@/components/mobile/mobile-goals";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const goals = await prisma.goal.findMany({
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { createdAt: "desc" }],
  });

  const mapped = goals.map((g) => ({
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
  }));

  return (
    <>
      {/* ═══════════ MOBILE (Baseline iOS — Goals) ═══════════ */}
      <div className="md:hidden">
        <MobileGoals initialGoals={mapped} />
      </div>

      {/* ═══════════ DESKTOP (unchanged) ═══════════ */}
      <div className="hidden md:block">
        <div className="mx-auto max-w-[1320px] px-9 py-6">
          <div className="mb-10">
            <h1 className="disp text-[46px] leading-none tracking-tight">GOALS</h1>
            <p className="mt-1 text-sm text-[var(--color-faint)]">
              Races, exams, body composition targets — feeds into coach context
            </p>
          </div>

          <GoalsManager initialGoals={mapped} />
        </div>
      </div>
    </>
  );
}
