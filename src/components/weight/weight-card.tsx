import { kgToLb } from "@/lib/tdee";

/**
 * Weight & Body Composition — 3-column stats grid.
 * No panel wrapper — parent composes this inside a single .compcard.
 * Design ref: Baseline Body.html → .compcard + .wgrid
 */

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

export function WeightCard({
  latestWeightKg,
  latestBodyFat,
  unit,
  weightTrend,
}: Props) {
  const trendLabel = weightTrend === "down" ? "−0.3" : weightTrend === "up" ? "+0.3" : "0.0";

  return (
    <>
      <p className="ov">Weight &amp; Body Composition</p>

      {/* 3-column stats grid */}
      <div
        className="grid grid-cols-3 mt-[6px]"
        style={{ gap: "1px", background: "var(--color-border)" }}
      >
        <div className="bg-[var(--color-surface)] p-[15px_16px]">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)] mb-[5px]">
            Weight
          </p>
          <p className="disp text-[36px] leading-[0.82] num">
            {formatWeight(latestWeightKg, unit)}{" "}
            <small className="text-[12px] font-semibold text-[var(--color-faint)]" style={{ fontFamily: "var(--font-sans, 'Archivo', system-ui, sans-serif)" }}>
              {unit}
            </small>
          </p>
        </div>
        <div className="bg-[var(--color-surface)] p-[15px_16px]">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)] mb-[5px]">
            Body Fat
          </p>
          <p className="disp text-[36px] leading-[0.82] num">
            {latestBodyFat != null ? latestBodyFat.toFixed(1) : "—"}{" "}
            <small className="text-[12px] font-semibold text-[var(--color-faint)]" style={{ fontFamily: "var(--font-sans, 'Archivo', system-ui, sans-serif)" }}>
              %
            </small>
          </p>
        </div>
        <div className="bg-[var(--color-surface)] p-[15px_16px]">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)] mb-[5px]">
            Trend
          </p>
          <p
            className="disp text-[36px] leading-[0.82] num"
            style={{
              color: weightTrend === "down" ? "var(--color-green)" : undefined,
            }}
          >
            {trendLabel}{" "}
            <small className="text-[12px] font-semibold text-[var(--color-faint)]" style={{ fontFamily: "var(--font-sans, 'Archivo', system-ui, sans-serif)" }}>
              {unit}/wk
            </small>
          </p>
        </div>
      </div>
    </>
  );
}
