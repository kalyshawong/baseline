interface ActivityData {
  totalCalories: number | null;
  activeCalories: number | null;
  steps: number | null;
  highActivityTime: number | null;
  mediumActivityTime: number | null;
}

function formatMinutes(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function ActivityCard({ data }: { data: ActivityData | null }) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text-muted)]">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider">Activity</h2>
        <p>No activity data for this day. Sync Oura to see totals.</p>
      </div>
    );
  }

  const activeTime =
    (data.highActivityTime ?? 0) + (data.mediumActivityTime ?? 0);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Activity
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Total burn</p>
          <p className="text-lg font-bold tabular-nums">
            {data.totalCalories ?? "—"}
            {data.totalCalories != null && (
              <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">cal</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Active</p>
          <p className="text-lg font-bold tabular-nums">
            {data.activeCalories ?? "—"}
            {data.activeCalories != null && (
              <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">cal</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Steps</p>
          <p className="text-lg font-bold tabular-nums">
            {data.steps != null ? data.steps.toLocaleString() : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Active time</p>
          <p className="text-lg font-bold tabular-nums">
            {formatMinutes(activeTime)}
          </p>
        </div>
      </div>
    </div>
  );
}
