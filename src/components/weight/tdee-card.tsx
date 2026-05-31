import type { CalorieFlag } from "@/lib/tdee";

/**
 * TDEE & Targets card — calorie/protein bars with design system styling.
 * Design ref: Baseline Body.html → .compcard (right column)
 */

interface Props {
  tdee: number | null;
  goalCals: number | null;
  actualCals: number | null;
  proteinTarget: number | null;
  actualProtein: number | null;
  flag: CalorieFlag | null;
  energyAvailability: number | null;
}

export function TdeeCard({
  tdee,
  goalCals,
  actualCals,
  proteinTarget,
  actualProtein,
  flag,
  energyAvailability,
}: Props) {
  if (!tdee) return null;

  const caloriePct = goalCals && actualCals
    ? Math.min(100, (actualCals / goalCals) * 100)
    : 0;
  const proteinPct = proteinTarget && actualProtein
    ? Math.min(100, (actualProtein / proteinTarget) * 100)
    : 0;

  const lowEA = energyAvailability != null && energyAvailability < 30;

  return (
    <div className="panel p-[22px_24px]">
      <p className="ov">TDEE &amp; Targets</p>

      {/* TDEE line */}
      <div className="mt-4">
        <div className="flex justify-between text-[12.5px] text-[var(--color-text-muted)]">
          <span>TDEE (maintenance)</span>
          <span className="num font-semibold text-[var(--color-text)]">{tdee.toLocaleString()} kcal</span>
        </div>
      </div>

      {/* Goal line */}
      {goalCals && (
        <div className="mt-[14px]">
          <div className="flex justify-between text-[12.5px] text-[var(--color-text-muted)]">
            <span>Goal (cut)</span>
            <span className="num font-semibold text-[var(--color-text)]">{goalCals.toLocaleString()} kcal</span>
          </div>
        </div>
      )}

      {/* Today's intake bar */}
      <div className="mt-[14px]">
        <div className="flex justify-between text-[12.5px] text-[var(--color-text-muted)] mb-[6px]">
          <span>Today&apos;s intake</span>
          <span className="num font-semibold text-[var(--color-text)]">
            {actualCals != null ? Math.round(actualCals).toLocaleString() : 0} kcal
          </span>
        </div>
        <div className="h-2 bg-[var(--color-surface-2)] rounded-[5px] overflow-hidden">
          <div
            className="h-full rounded-[5px]"
            style={{ width: `${caloriePct}%`, background: "var(--color-yellow)" }}
          />
        </div>
      </div>

      {/* Protein bar */}
      {proteinTarget && (
        <div className="mt-[14px]">
          <div className="flex justify-between text-[12.5px] text-[var(--color-text-muted)] mb-[6px]">
            <span>Protein (1.6 g/kg)</span>
            <span className="num font-semibold text-[var(--color-text)]">
              {actualProtein != null ? Math.round(actualProtein) : 0} / {proteinTarget}g
            </span>
          </div>
          <div className="h-2 bg-[var(--color-surface-2)] rounded-[5px] overflow-hidden">
            <div
              className="h-full rounded-[5px]"
              style={{ width: `${proteinPct}%`, background: "var(--color-blue)" }}
            />
          </div>
        </div>
      )}

      {/* Calorie flag */}
      {flag && flag.status !== "on_target" && (
        <div
          className="mt-3 p-3 text-xs"
          style={{
            color: flag.status === "under" ? "var(--color-yellow)" : "var(--color-red)",
            background: `color-mix(in oklch, ${flag.status === "under" ? "var(--color-yellow)" : "var(--color-red)"}, transparent 88%)`,
            border: `1px solid color-mix(in oklch, ${flag.status === "under" ? "var(--color-yellow)" : "var(--color-red)"}, transparent 70%)`,
          }}
        >
          {flag.message}
        </div>
      )}

      {/* EA warning */}
      {lowEA && (
        <div
          className="mt-3 p-3 text-xs leading-relaxed"
          style={{
            color: "var(--color-red)",
            background: "color-mix(in oklch, var(--color-red), transparent 88%)",
            border: "1px solid color-mix(in oklch, var(--color-red), transparent 70%)",
          }}
        >
          <p className="font-semibold">Low energy availability</p>
          <p className="mt-1">
            EA: {energyAvailability?.toFixed(1)} kcal/kg FFM. Below 30 impairs recovery
            (Loucks 2011).
          </p>
        </div>
      )}

      <a className="linklike inline-block mt-4" href="/body">
        Edit goal &amp; profile
      </a>
    </div>
  );
}
