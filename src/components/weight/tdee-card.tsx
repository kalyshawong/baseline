import type { CalorieFlag } from "@/lib/tdee";

interface Props {
  tdee: number | null;
  goalCals: number | null;
  actualCals: number | null;
  proteinTarget: number | null;
  actualProtein: number | null;
  flag: CalorieFlag | null;
  energyAvailability: number | null;
}

const flagStyles: Record<string, string> = {
  on_target: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  under: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  over: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  deficit_mismatch: "border-red-500/30 bg-red-500/10 text-red-400",
  surplus_mismatch: "border-red-500/30 bg-red-500/10 text-red-400",
};

export function TdeeCard({
  tdee,
  goalCals,
  actualCals,
  proteinTarget,
  actualProtein,
  flag,
  energyAvailability,
}: Props) {
  if (!tdee) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-xs text-[var(--color-text-muted)]">
        Log your weight and set a goal to see TDEE and calorie targets.
      </div>
    );
  }

  const proteinPct = proteinTarget && actualProtein
    ? Math.min(100, (actualProtein / proteinTarget) * 100)
    : 0;
  const caloriePct = goalCals && actualCals
    ? Math.min(100, (actualCals / goalCals) * 100)
    : 0;

  const lowEA = energyAvailability != null && energyAvailability < 30;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Energy & Nutrition
        </h2>
        <span className="text-xs text-[var(--color-text-muted)]">
          TDEE: <span className="font-mono text-white">{tdee}</span> kcal
        </span>
      </div>

      <div className="space-y-3">
        {/* Calories */}
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">
              Calories {goalCals && `(goal ${goalCals})`}
            </span>
            <span className="font-mono">
              {actualCals != null ? Math.round(actualCals) : 0}
              {goalCals && ` / ${goalCals}`}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-[var(--color-surface-2)]">
            <div
              className="h-full rounded-full bg-amber-500/60"
              style={{ width: `${caloriePct}%` }}
            />
          </div>
        </div>

        {/* Protein */}
        {proteinTarget && (
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">
                Protein (1.6g/kg — Morton 2018)
              </span>
              <span className="font-mono">
                {actualProtein != null ? Math.round(actualProtein) : 0}g / {proteinTarget}g
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full bg-blue-500/60"
                style={{ width: `${proteinPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Calorie flag */}
        {flag && flag.status !== "on_target" && (
          <div className={`rounded-lg border p-3 text-xs ${flagStyles[flag.status]}`}>
            {flag.message}
          </div>
        )}
        {flag?.status === "on_target" && (
          <p className="text-xs text-emerald-400">{flag.message}</p>
        )}

        {/* EA warning */}
        {lowEA && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <p className="font-semibold">Low energy availability</p>
            <p className="mt-1 leading-relaxed">
              EA: {energyAvailability?.toFixed(1)} kcal/kg FFM. Below 30 impairs recovery
              (Loucks 2011). HRV may decline 10-20% until restored.
              {" "}Especially critical for female athletes — can disrupt cycle.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
