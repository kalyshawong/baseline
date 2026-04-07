interface HealthKitStatusData {
  lastSync: { syncedAt: string; status: string; details: string | null } | null;
  todayWorkout: {
    name: string;
    durationSeconds: number;
    activeCalories: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
  } | null;
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusDot: Record<string, string> = {
  success: "bg-emerald-400",
  partial: "bg-yellow-400",
  failed: "bg-red-400",
};

export function HealthKitStatus({ data }: { data: HealthKitStatusData }) {
  if (!data.lastSync && !data.todayWorkout) return null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Apple Watch
        </h2>
        {data.lastSync && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${statusDot[data.lastSync.status] ?? "bg-neutral-400"}`}
            />
            {formatTime(data.lastSync.syncedAt)}
          </div>
        )}
      </div>

      {data.todayWorkout ? (
        <div className="mt-3">
          <p className="text-sm font-semibold">{data.todayWorkout.name}</p>
          <div className="mt-1 flex gap-3 text-xs text-[var(--color-text-muted)]">
            <span>{formatDuration(data.todayWorkout.durationSeconds)}</span>
            {data.todayWorkout.activeCalories != null && (
              <span>{Math.round(data.todayWorkout.activeCalories)} cal</span>
            )}
            {data.todayWorkout.avgHeartRate != null && (
              <span>
                avg {data.todayWorkout.avgHeartRate} bpm
                {data.todayWorkout.maxHeartRate != null &&
                  ` (max ${data.todayWorkout.maxHeartRate})`}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          No Apple Watch workout today.
        </p>
      )}
    </div>
  );
}
