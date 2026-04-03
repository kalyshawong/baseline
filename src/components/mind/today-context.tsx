const phaseInfo: Record<string, { color: string; label: string; note: string }> = {
  menstrual: {
    color: "bg-red-500/20 text-red-400",
    label: "Menstrual",
    note: "Energy lowest — prioritize recovery experiments, not high-load interventions",
  },
  follicular: {
    color: "bg-emerald-500/20 text-emerald-400",
    label: "Follicular",
    note: "Rising energy — good window to test performance interventions",
  },
  ovulation: {
    color: "bg-amber-500/20 text-amber-400",
    label: "Ovulation",
    note: "Peak output — experiments involving intensity/strength are most valid now",
  },
  luteal: {
    color: "bg-purple-500/20 text-purple-400",
    label: "Luteal",
    note: "Temp elevated, mood may shift — account for this in experiment logging",
  },
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

interface TodayData {
  readinessScore: number | null;
  sleepScore: number | null;
  totalSleep: number | null;
  averageHrv: number | null;
  stressSummary: string | null;
  cyclePhase: string | null;
}

export function TodayContext({ data }: { data: TodayData }) {
  const phase = data.cyclePhase ? phaseInfo[data.cyclePhase] : null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Today&apos;s Context
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Readiness</p>
          <p className="text-lg font-bold tabular-nums">{data.readinessScore ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Sleep</p>
          <p className="text-lg font-bold tabular-nums">{formatDuration(data.totalSleep)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">HRV</p>
          <p className="text-lg font-bold tabular-nums">
            {data.averageHrv ?? "—"}
            {data.averageHrv != null && <span className="text-xs font-normal text-[var(--color-text-muted)]"> ms</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">Stress</p>
          <p className="text-lg font-bold tabular-nums">
            {data.stressSummary
              ? data.stressSummary.charAt(0).toUpperCase() + data.stressSummary.slice(1)
              : "—"}
          </p>
        </div>
      </div>
      {phase && (
        <div className="mt-3 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${phase.color}`}>
            {phase.label}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">{phase.note}</span>
        </div>
      )}
    </div>
  );
}
