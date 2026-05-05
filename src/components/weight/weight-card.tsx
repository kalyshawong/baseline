import { kgToLb } from "@/lib/tdee";

interface Props {
  latestWeightKg: number | null;
  latestBodyFat: number | null;
  unit: "lb" | "kg";
  goal: string | null;
  targetWeightKg: number | null;
  weightTrend: "up" | "down" | "flat" | null;
  goalDeadline?: Date | null;
  goalCals?: number | null;
  tdee?: number | null;
  weeklyRate?: number | null;
}

function formatWeight(kg: number | null, unit: "lb" | "kg"): string {
  if (kg == null) return "—";
  return unit === "lb" ? `${kgToLb(kg)}` : `${kg.toFixed(1)}`;
}

const trendSymbol: Record<string, string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

function daysUntilDeadline(deadline: Date): number {
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function WeightCard({
  latestWeightKg,
  latestBodyFat,
  unit,
  goal,
  targetWeightKg,
  weightTrend,
  goalDeadline,
  goalCals,
  tdee,
  weeklyRate,
}: Props) {
  const hasGoal = !!goal && goal !== "maintain" && !!targetWeightKg;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Weight
        </p>
        {weightTrend && (
          <span className="text-xs text-[var(--color-text-muted)]">
            {trendSymbol[weightTrend]} 7-day
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {formatWeight(latestWeightKg, unit)}
        {latestWeightKg != null && (
          <span className="ml-1 text-sm font-normal text-[var(--color-text-muted)]">
            {unit}
          </span>
        )}
      </p>
      {latestBodyFat != null && (
        <p className="text-xs text-[var(--color-text-muted)]">
          {latestBodyFat.toFixed(1)}% body fat
        </p>
      )}

      {hasGoal && goalDeadline ? (
        <div className="mt-3 space-y-1.5 border-t border-[var(--color-border)] pt-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            Goal: {formatWeight(targetWeightKg, unit)} {unit} · {daysUntilDeadline(goalDeadline)} days
          </p>
          {goalCals != null && tdee != null && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Daily target: <span className="font-mono text-white">{goalCals}</span> cal
              {goalCals < tdee && (
                <span> ({tdee - goalCals} cal deficit)</span>
              )}
            </p>
          )}
          {weeklyRate != null && weeklyRate > 0 && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Based on {weeklyRate} {unit}/week {goal === "lose" ? "loss" : "gain"}
            </p>
          )}
        </div>
      ) : !hasGoal ? (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Set a weight goal to see your TDEE and calorie targets.
        </p>
      ) : null}
    </div>
  );
}
