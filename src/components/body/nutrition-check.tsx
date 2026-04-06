interface NutritionData {
  calories: number;
  protein: number;
  perMealProtein: Array<{ mealType: string; protein: number }>;
}

interface Props {
  nutrition: NutritionData | null;
  bodyWeightKg: number | null;
  dailyCalorieTarget: number | null;
  energyAvailability: number | null;
}

export function NutritionCheck({ nutrition, bodyWeightKg, dailyCalorieTarget, energyAvailability }: Props) {
  const proteinTarget = bodyWeightKg ? Math.round(bodyWeightKg * 1.6) : null;
  const proteinPct = proteinTarget && nutrition
    ? Math.min(100, (nutrition.protein / proteinTarget) * 100)
    : 0;
  const caloriePct = dailyCalorieTarget && nutrition
    ? Math.min(100, (nutrition.calories / dailyCalorieTarget) * 100)
    : 0;

  const lowEA = energyAvailability != null && energyAvailability < 30;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Nutrition Check
      </h2>

      {!nutrition && (
        <p className="text-xs text-[var(--color-text-muted)]">No food logged today.</p>
      )}

      {nutrition && (
        <div className="space-y-3">
          {/* Protein */}
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">
                Protein {proteinTarget && `(target ${proteinTarget}g — Morton 2018)`}
              </span>
              <span className="font-mono">
                {Math.round(nutrition.protein)}g{proteinTarget && ` / ${proteinTarget}g`}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full bg-blue-500/60"
                style={{ width: `${proteinPct}%` }}
              />
            </div>
          </div>

          {/* Calories */}
          <div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">
                Calories{dailyCalorieTarget && ` (target ${dailyCalorieTarget})`}
              </span>
              <span className="font-mono">
                {Math.round(nutrition.calories)}
                {dailyCalorieTarget && ` / ${dailyCalorieTarget}`}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full bg-amber-500/60"
                style={{ width: `${caloriePct}%` }}
              />
            </div>
          </div>

          {/* Per-meal protein — Moore 2009 flags if >30g or <20g */}
          {nutrition.perMealProtein.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-[var(--color-text-muted)]">
                Per meal (MPS plateaus at ~25g — Moore 2009)
              </p>
              <div className="space-y-1">
                {nutrition.perMealProtein.map((m, i) => {
                  const excess = m.protein > 30;
                  const low = m.protein < 20;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-1.5 text-xs"
                    >
                      <span className="capitalize">{m.mealType}</span>
                      <span className={`font-mono ${excess ? "text-amber-400" : low ? "text-yellow-400" : "text-emerald-400"}`}>
                        {Math.round(m.protein)}g
                        {excess && " (excess)"}
                        {low && " (low)"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Energy availability warning */}
          {lowEA && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              <p className="font-semibold">Low energy availability detected</p>
              <p className="mt-1 leading-relaxed">
                EA: {energyAvailability?.toFixed(1)} kcal/kg FFM. Below 30 impairs recovery
                (Loucks 2011). HRV may decline 10-20% until restored.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
