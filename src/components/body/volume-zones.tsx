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
              <div className="relative mt-1 h-2 rounded-full bg-[var(--color-surface-2)]">
                {/* MAV green band */}
                <div
                  className="absolute h-full bg-emerald-500/20"
                  style={{
                    left: `${mavStartPct}%`,
                    width: `${mavEndPct - mavStartPct}%`,
                  }}
                />
                {/* MEV marker */}
                <div
                  className="absolute top-0 h-full w-px bg-blue-400/50"
                  style={{ left: `${mevPct}%` }}
                />
                {/* MRV marker */}
                <div
                  className="absolute top-0 h-full w-px bg-red-400/70"
                  style={{ left: `${mrvPct}%` }}
                />
                {/* Current position marker */}
                <div
                  className="absolute -top-0.5 h-3 w-1 rounded-sm bg-white shadow"
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
