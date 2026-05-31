/**
 * Nutrition Check card — protein/calorie bars + per-meal breakdown.
 * Design ref: Baseline Body.html → .nutricard
 */

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
    <div className="panel p-[22px_24px]">
      <p className="ov">Nutrition Check</p>

      {!nutrition && (
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">No food logged today.</p>
      )}

      {nutrition && (
        <div>
          {/* Protein bar */}
          <div className="mt-[14px]">
            <div className="flex justify-between text-[12.5px] text-[var(--color-text-muted)] mb-[6px]">
              <span>Protein {proteinTarget && `(target ${proteinTarget}g — Morton 2018)`}</span>
              <span className="num font-semibold text-[var(--color-text)]">
                {Math.round(nutrition.protein)}{proteinTarget && ` / ${proteinTarget}g`}
              </span>
            </div>
            <div className="h-2 bg-[var(--color-surface-2)] rounded-[5px] overflow-hidden">
              <div
                className="h-full rounded-[5px]"
                style={{ width: `${proteinPct}%`, background: "var(--color-blue)" }}
              />
            </div>
          </div>

          {/* Calories bar */}
          <div className="mt-[14px]">
            <div className="flex justify-between text-[12.5px] text-[var(--color-text-muted)] mb-[6px]">
              <span>Calories{dailyCalorieTarget && ` (target ${dailyCalorieTarget})`}</span>
              <span className="num font-semibold text-[var(--color-text)]">
                {Math.round(nutrition.calories)}{dailyCalorieTarget && ` / ${dailyCalorieTarget}`}
              </span>
            </div>
            <div className="h-2 bg-[var(--color-surface-2)] rounded-[5px] overflow-hidden">
              <div
                className="h-full rounded-[5px]"
                style={{ width: `${caloriePct}%`, background: "var(--color-yellow)" }}
              />
            </div>
          </div>

          {/* Per-meal protein */}
          {nutrition.perMealProtein.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-[var(--color-faint)] mb-[7px]">
                Per meal (MPS plateaus at ~25g — Moore 2009)
              </p>
              <div className="space-y-[6px]">
                {nutrition.perMealProtein.map((m, i) => {
                  const excess = m.protein > 30;
                  const low = m.protein < 20;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-[var(--color-surface-2)] px-[13px] py-2 text-[12.5px]"
                    >
                      <span className="capitalize">{m.mealType}</span>
                      <span
                        className="num"
                        style={{
                          color: excess
                            ? "var(--color-yellow)"
                            : low
                              ? "oklch(0.85 0.15 95)"
                              : "var(--color-green)",
                        }}
                      >
                        {Math.round(m.protein)}g{excess && " (excess)"}{low && " (low)"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Energy availability warning */}
          {lowEA && (
            <div
              className="mt-3 p-3 text-xs leading-relaxed"
              style={{
                color: "var(--color-red)",
                background: "color-mix(in oklch, var(--color-red), transparent 88%)",
                border: "1px solid color-mix(in oklch, var(--color-red), transparent 70%)",
              }}
            >
              <p className="font-semibold">Low energy availability detected</p>
              <p className="mt-1">
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
