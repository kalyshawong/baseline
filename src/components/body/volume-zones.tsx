import { volumeZones, classifyVolume, volumeStatusLabel } from "@/lib/training";

/**
 * Weekly Volume zones card — MEV/MAV/MRV bar chart.
 * Design ref: Baseline Body.html → .volcard
 */

interface MuscleVolume {
  muscleGroup: string;
  sets: number;
}

const statusColor: Record<string, string> = {
  g: "var(--color-green)",
  a: "var(--color-yellow)",
  r: "var(--color-red)",
  y: "oklch(0.85 0.15 95)",
  b: "var(--color-blue)",
};

function statusKey(status: string): string {
  switch (status) {
    case "in_mav": return "g";
    case "above_mav": return "a";
    case "at_mrv": case "above_mrv": return "r";
    case "below_mev": return "y";
    default: return "b";
  }
}

export function VolumeZones({ data }: { data: MuscleVolume[] }) {
  const groups = Object.keys(volumeZones);

  const belowMev = groups.filter((g) => {
    const s = data.find((d) => d.muscleGroup === g)?.sets ?? 0;
    return s > 0 && s < volumeZones[g].mev;
  });
  const nearMrv = groups.filter((g) => {
    const s = data.find((d) => d.muscleGroup === g)?.sets ?? 0;
    return s >= volumeZones[g].mrv * 0.9;
  });

  return (
    <div className="panel p-[22px_24px]">
      <p className="ov">Weekly Volume</p>
      <p className="text-xs text-[var(--color-faint)] mt-[2px]">
        Sets per muscle group vs MEV/MAV/MRV (Israetel 2021)
      </p>

      {/* Alerts */}
      {nearMrv.length > 0 && (
        <div
          className="mt-3 px-3 py-2 text-xs font-semibold"
          style={{
            color: "var(--color-red)",
            background: "color-mix(in oklch, var(--color-red), transparent 88%)",
            border: "1px solid color-mix(in oklch, var(--color-red), transparent 70%)",
          }}
        >
          Approaching/exceeding MRV: <b className="capitalize">{nearMrv.join(", ")}</b> — consider deload
        </div>
      )}
      {belowMev.length > 0 && (
        <div
          className="mt-3 px-3 py-2 text-xs font-semibold"
          style={{
            color: "var(--color-yellow)",
            background: "color-mix(in oklch, var(--color-yellow), transparent 88%)",
            border: "1px solid color-mix(in oklch, var(--color-yellow), transparent 70%)",
          }}
        >
          Below MEV: <b className="capitalize">{belowMev.join(", ")}</b> — insufficient stimulus for growth
        </div>
      )}

      {/* Volume rows */}
      <div className="mt-4 flex flex-col gap-[13px]">
        {groups.map((group) => {
          const zone = volumeZones[group];
          const sets = data.find((d) => d.muscleGroup === group)?.sets ?? 0;
          const status = classifyVolume(sets, zone);
          const { label } = volumeStatusLabel(status);
          const sk = statusKey(status);
          const color = statusColor[sk];

          const scale = zone.mrv * 1.2;
          const mavStartPct = (zone.mav[0] / scale) * 100;
          const mavWidthPct = ((zone.mav[1] - zone.mav[0]) / scale) * 100;
          const currentPct = Math.min(100, (sets / scale) * 100);

          return (
            <div key={group}>
              <div className="flex items-center justify-between text-[12.5px] mb-[5px]">
                <span className="font-semibold capitalize">{group}</span>
                <div className="flex items-center gap-[9px]">
                  <span className="font-mono num text-[var(--color-text-muted)]">{sets} sets</span>
                  <span
                    className="text-[10.5px] font-bold whitespace-nowrap"
                    style={{ color }}
                  >
                    {label}
                  </span>
                </div>
              </div>
              <div className="relative h-[9px] bg-[var(--color-surface-2)] rounded-[5px] overflow-hidden">
                {/* MAV green band */}
                <div
                  className="absolute top-0 h-full"
                  style={{
                    left: `${mavStartPct}%`,
                    width: `${mavWidthPct}%`,
                    background: "color-mix(in oklch, var(--color-green), transparent 78%)",
                  }}
                />
                {/* Current position marker */}
                <div
                  className="absolute rounded-[2px]"
                  style={{
                    left: `${currentPct}%`,
                    top: "-2px",
                    height: "13px",
                    width: "5px",
                    background: color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex gap-[18px] text-[10.5px] text-[var(--color-faint)]">
        <span>│ MEV</span>
        <span>▭ MAV (optimal)</span>
        <span>│ MRV</span>
      </div>
    </div>
  );
}
