import { kgToLb } from "@/lib/tdee";

interface Props {
  latestWeightKg: number | null;
  latestBodyFat: number | null;
  unit: "lb" | "kg";
  goal: string | null;
  targetWeightKg: number | null;
  weightTrend: "up" | "down" | "flat" | null;
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

export function WeightCard({
  latestWeightKg,
  latestBodyFat,
  unit,
  goal,
  targetWeightKg,
  weightTrend,
}: Props) {
  const deltaToTarget =
    latestWeightKg && targetWeightKg ? latestWeightKg - targetWeightKg : null;

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
      {goal && targetWeightKg && deltaToTarget != null && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {goal === "maintain"
            ? `${Math.abs(Math.round((unit === "lb" ? kgToLb(Math.abs(deltaToTarget)) : Math.abs(deltaToTarget)) * 10) / 10)} ${unit} from target`
            : goal === "lose"
              ? `${Math.max(0, Math.round((unit === "lb" ? kgToLb(deltaToTarget) : deltaToTarget) * 10) / 10)} ${unit} to goal`
              : `${Math.max(0, Math.round((unit === "lb" ? kgToLb(-deltaToTarget) : -deltaToTarget) * 10) / 10)} ${unit} to goal`}
        </p>
      )}
    </div>
  );
}
