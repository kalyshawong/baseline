import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getIntakeStatus } from "@/lib/intake";
import { getGoalPlan } from "@/lib/goal-plan-data";
import { Cite } from "@/components/science/cite";
import { MissingFields } from "./missing-fields";

export const dynamic = "force-dynamic";

/**
 * A goal's daily plan: calories, protein, fat, carbs, water, the realistic
 * date, and a day of eating built from her own logged meals.
 *
 * Layout is plain on purpose — functional placeholder for Kalysha to design
 * (2026-10-18). Numbers come from lib/goal-plan.ts and recompute on every
 * visit from the latest weigh-in and burn data.
 */

const LB = 2.20462;

function fmtDate(d: Date | null): string | null {
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}

export default async function GoalPlanPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await getIntakeStatus()).needsOnboarding) redirect("/onboarding");
  const { id } = await params;
  const goal = await prisma.goal.findUnique({ where: { id } });
  if (!goal) notFound();
  const [plan, profile] = await Promise.all([getGoalPlan(id), prisma.userProfile.findFirst({ select: { unit: true } })]);
  const lb = (profile?.unit ?? "lb") === "lb";
  const wt = (kg: number | null | undefined, digits = 1) =>
    kg == null ? "—" : lb ? `${(kg * LB).toFixed(digits)} lb` : `${kg.toFixed(digits)} kg`;

  const row = (label: React.ReactNode, value: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--color-border, rgba(255,255,255,.08))", fontSize: 13.5 }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span className="num" style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 120px" }}>
      <Link href="/goals" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>← Goals</Link>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginTop: 10 }}>{goal.title}</h1>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>Your plan</p>

      {!plan && (
        <div className="panel" style={{ padding: 16, marginTop: 16, fontSize: 13.5 }}>
          Plans are built for physique and weight goals (abs, body fat, a goal weight, cut or bulk). This goal doesn&apos;t have one.
        </div>
      )}

      {plan && (
        <>
          <MissingFields missing={plan.missing} />

          {/* ---- Where you are → where you're going ---- */}
          <div className="panel" style={{ padding: 16, marginTop: 16 }}>
            <p className="ov">Target</p>
            {row("Now", `${wt(plan.current.weightKg)}${plan.current.bodyFatPct != null ? ` · ${plan.current.bodyFatPct.toFixed(1)}% body fat` : ""}`)}
            {row("Target", plan.target.weightKg != null
              ? `${wt(plan.target.weightKg)}${plan.target.bodyFatPct != null ? ` · ${plan.target.bodyFatPct.toFixed(1)}% body fat` : ""}`
              : "—")}
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>{plan.target.source}</p>
            {plan.target.changeKg != null && Math.abs(plan.target.changeKg) > 0.2 &&
              row(plan.target.changeKg > 0 ? "To lose" : "To gain", wt(Math.abs(plan.target.changeKg)))}
            {plan.pace.plannedKgPerWk != null && plan.pace.plannedKgPerWk > 0 &&
              row(<>Pace <Cite ids={plan.direction === "gain" ? ["iraki2019"] : ["helms2014b", "garthe2011"]} /></>,
                `${wt(plan.pace.plannedKgPerWk, 2)}/week (${plan.pace.plannedPctPerWk?.toFixed(2)}%)`)}
            {plan.pace.deadline && row("Your date", fmtDate(plan.pace.deadline))}
            {plan.pace.projectedDate && plan.pace.onTime !== true && row("Realistic date", (
              <span style={{ color: plan.pace.onTime === false ? "var(--color-yellow, #e5b100)" : undefined }}>
                {fmtDate(plan.pace.projectedDate)}{plan.pace.onTime === false ? " (later than your date)" : ""}
              </span>
            ))}
          </div>

          {/* ---- Every day ---- */}
          {plan.daily && (
            <div className="panel" style={{ padding: 16, marginTop: 12 }}>
              <p className="ov">Every day</p>
              {row(<>Calories <Cite ids={["hall2008"]} /></>, `${plan.daily.kcal.toLocaleString()} kcal`)}
              {row(<>Protein · {plan.daily.proteinGPerKg} g/kg <Cite ids={plan.direction === "lose" ? ["morton2018", "helms2014"] : ["morton2018"]} /></>, `${plan.daily.proteinG} g`)}
              {row(<>Fat · 25% of calories <Cite ids={["helms2014b"]} /></>, `${plan.daily.fatG} g`)}
              {row("Carbs · the rest", `${plan.daily.carbsG} g`)}
              {row(<>Water, rest day <Cite ids={["efsa2010"]} /></>, `${plan.daily.waterRestL.toFixed(1)} L`)}
              {row(<>Water, training day <Cite ids={["sawka2007"]} /></>, `${plan.daily.waterTrainingL.toFixed(1)} L`)}
              {plan.tdee && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
                  Starts from {plan.tdee.kcal.toLocaleString()} kcal/day burned — {plan.tdee.label}
                  {plan.tdee.cite.length > 0 && <> <Cite ids={plan.tdee.cite} /></>}.
                  {plan.daily.kcalFloor != null && <> Never below {plan.daily.kcalFloor.toLocaleString()} kcal <Cite ids={["loucks2011", "mountjoy2023"]} />.</>}
                  {" "}Water on training days adds 0.75 L per hour trained (app default; sweat rates vary 0.5–2 L/h).
                </p>
              )}
            </div>
          )}

          {/* ---- A day of eating ---- */}
          {plan.menu && plan.daily && (
            <div className="panel" style={{ padding: 16, marginTop: 12 }}>
              <p className="ov">A day of eating</p>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>Built from meals you&apos;ve logged.</p>
              {plan.menu.lines.map((l, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--color-border, rgba(255,255,255,.08))", fontSize: 13.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span><b>{l.slot}</b> · {l.servings && l.servings > 1 ? `${l.servings}× ` : ""}{l.label}</span>
                    <span className="num" style={{ whiteSpace: "nowrap" }}>{l.kcal} kcal · {l.protein} g P</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 2 }}>
                    {l.fromLog ? `you've logged this ${l.timesEaten}×` : "not from your log — a suggestion to close the protein gap"}
                  </div>
                </div>
              ))}
              {row("Total", `${plan.menu.totals.kcal} / ${plan.daily.kcal} kcal · ${plan.menu.totals.protein} / ${plan.daily.proteinG} g protein`)}
            </div>
          )}

          {/* ---- Flags ---- */}
          {plan.notes.length > 0 && (
            <div className="panel" style={{ padding: 16, marginTop: 12 }}>
              <p className="ov">Heads up</p>
              {plan.notes.map((n, i) => (
                <p key={i} style={{ fontSize: 13, marginTop: 8, color: n.level === "warn" ? "var(--color-text)" : "var(--color-text-muted)" }}>
                  {n.level === "warn" ? "⚠︎ " : ""}{n.text}{n.cite && <> <Cite ids={n.cite} /></>}
                </p>
              ))}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 14 }}>
            Recalculates each time you open it from your latest weigh-in, body fat and burn. Scale body fat can be off by a few points, so judge the abs target by the mirror too.
          </p>
        </>
      )}
    </div>
  );
}
