interface ActivityData {
  totalCalories: number | null;
  activeCalories: number | null;
  steps: number | null;
  highActivityTime: number | null;
  mediumActivityTime: number | null;
}

interface WorkoutData {
  name: string;
  durationSeconds: number;
  activeCalories: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

interface SyncData {
  syncedAt: string;
  status: string;
}

interface ActivityCardProps {
  activity: ActivityData | null;
  workout: WorkoutData | null;
  lastHkSync: SyncData | null;
  lastOuraSync: Date | null;
}

function formatMinutes(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatWorkoutDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusDot: Record<string, string> = {
  success: "bg-emerald-400",
  partial: "bg-yellow-400",
  failed: "bg-red-400",
};

function mostRecentTimestamp(
  lastOuraSync: Date | null,
  lastHkSync: SyncData | null,
): { time: string; dotClass: string } | null {
  const candidates: { date: Date; dotClass: string }[] = [];
  if (lastOuraSync) {
    candidates.push({ date: lastOuraSync, dotClass: "bg-emerald-400" });
  }
  if (lastHkSync) {
    candidates.push({
      date: new Date(lastHkSync.syncedAt),
      dotClass: statusDot[lastHkSync.status] ?? "bg-neutral-400",
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { time: formatTime(candidates[0].date), dotClass: candidates[0].dotClass };
}

export function ActivityCard({ activity, workout, lastHkSync, lastOuraSync }: ActivityCardProps) {
  const ts = mostRecentTimestamp(lastOuraSync, lastHkSync);

  const hasOuraData = !!activity;
  const activeTime = hasOuraData
    ? (activity.highActivityTime ?? 0) + (activity.mediumActivityTime ?? 0)
    : null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Activity
        </h2>
        {ts && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <span className={`h-1.5 w-1.5 rounded-full ${ts.dotClass}`} />
            {ts.time}
          </div>
        )}
      </div>

      {/* Oura daily totals */}
      {hasOuraData ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Total burn</p>
            <p className="text-lg font-bold tabular-nums">
              {activity.totalCalories ?? "—"}
              {activity.totalCalories != null && (
                <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">cal</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Active</p>
            <p className="text-lg font-bold tabular-nums">
              {activity.activeCalories ?? "—"}
              {activity.activeCalories != null && (
                <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">cal</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Steps</p>
            <p className="text-lg font-bold tabular-nums">
              {activity.steps != null ? activity.steps.toLocaleString() : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Active time</p>
            <p className="text-lg font-bold tabular-nums">
              {formatMinutes(activeTime)}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Oura publishes daily totals at end of day.
        </p>
      )}

      {/* Apple Watch workout */}
      {workout ? (
        <div className="mt-3 border-t border-[var(--color-border)] pt-3">
          <p className="text-sm font-semibold">{workout.name}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]">
            <span>{formatWorkoutDuration(workout.durationSeconds)}</span>
            {workout.activeCalories != null && (
              <span>{Math.round(workout.activeCalories)} cal</span>
            )}
            {workout.avgHeartRate != null && (
              <span>
                avg {workout.avgHeartRate} bpm
                {workout.maxHeartRate != null && ` (max ${workout.maxHeartRate})`}
              </span>
            )}
          </div>
        </div>
      ) : lastHkSync ? (
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          No Apple Watch workout today.
        </p>
      ) : null}
    </div>
  );
}
