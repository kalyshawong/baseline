import { volumeZones, classifyVolume, volumeStatusLabel } from "@/lib/training";

interface MuscleVolume {
  muscleGroup: string;
  sets: number;
}

export function VolumeZones({ data }: { data: MuscleVolume[] }) {
  const groups = Object.keys(volumeZones);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-1 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Weekly Volume
      </h2>
      <p className="mb-4 text-xs text-[var(--color-text-muted)]">
        Sets per muscle group vs MEV/MAV/MRV (Israetel 2021)
      </p>
      {/* Alerts for muscles needing attention */}
      {(() => {
        const belowMev = groups.filter((g) => {
          const s = data.find((d) => d.muscleGroup === g)?.sets ?? 0;
          return s > 0 && s < volumeZones[g].mev;
        });
        const nearMrv = groups.filter((g) => {
          const s = data.find((d) => d.muscleGroup === g)?.sets ?? 0;
          return s >= volumeZones[g].mrv * 0.9;
        });
        if (belowMev.length === 0 && nearMrv.length === 0) return null;
        return (
          <div className="mb-4 space-y-1.5">
            {nearMrv.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                Approaching/exceeding MRV: <span className="font-semibold capitalize">{nearMrv.join(", ")}</span> — consider deload
              </div>
            )}
            {belowMev.length > 0 && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                Below MEV: <span className="font-semibold capitalize">{belowMev.join(", ")}</span> — insufficient stimulus for growth
              </div>
            )}
          </div>
        );
      })()}

      <div className="space-y-3">
        {groups.map((group) => {
          const zone = volumeZones[group];
          const sets = data.find((d) => d.muscleGroup === group)?.sets ?? 0;
          const status = classifyVolume(sets, zone);
          const { label, color } = volumeStatusLabel(status);

          // Visual: scale bar to MRV
          const scale = zone.mrv * 1.2;
          const mevPct = (zone.mev / scale) * 100;
          const mavStartPct = (zone.mav[0] / scale) * 100;
          const mavEndPct = (zone.mav[1] / scale) * 100;
          const mrvPct = (zone.mrv / scale) * 100;
          const currentPct = Math.min(100, (sets / scale) * 100);

          return (
            <div key={group}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium capitalize">{group}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular-nums">{sets} sets</span>
                  <span className={`${color} text-[10px]`}>{label}</span>
                </div>
              </div>
              <div className="relative mt-1 h-2.5 rounded-full bg-[var(--color-surface-2)]">
                {/* Below MEV zone (red tint) */}
                {mevPct > 0 && (
                  <div
                    className="absolute h-full rounded-l-full bg-red-500/10"
                    style={{ left: 0, width: `${mevPct}%` }}
                  />
                )}
                {/* MAV green band */}
                <div
                  className="absolute h-full bg-emerald-500/15"
                  style={{
                    left: `${mavStartPct}%`,
                    width: `${mavEndPct - mavStartPct}%`,
                  }}
                />
                {/* Above MRV zone (red tint) */}
                <div
                  className="absolute h-full rounded-r-full bg-red-500/10"
                  style={{ left: `${mrvPct}%`, width: `${100 - mrvPct}%` }}
                />
                {/* MEV marker */}
                <div
                  className="absolute top-0 h-full w-px bg-yellow-400/60"
                  style={{ left: `${mevPct}%` }}
                />
                {/* MRV marker */}
                <div
                  className="absolute top-0 h-full w-px bg-red-400/80"
                  style={{ left: `${mrvPct}%` }}
                />
                {/* Current position marker — colored by zone */}
                <div
                  className={`absolute -top-0.5 h-3.5 w-1.5 rounded-sm shadow ${
                    status === "below_mev"
                      ? "bg-red-400"
                      : status === "in_mav"
                        ? "bg-emerald-400"
                        : status === "above_mav" || status === "at_mrv"
                          ? "bg-yellow-400"
                          : status === "above_mrv"
                            ? "bg-red-500"
                            : "bg-blue-400"
                  }`}
                  style={{ left: `${currentPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-4 text-[10px] text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-2 bg-blue-400/50" /> MEV
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 bg-emerald-500/20" /> MAV (optimal)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-2 bg-red-400/70" /> MRV
        </span>
      </div>
    </div>
  );
}
