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
    <div
      className="grid gap-px"
      style={{
        gridTemplateColumns: "1fr 1fr 1fr 1fr 2.6fr",
        background: "var(--color-border)",
      }}
    >
      {/* Readiness */}
      <div className="bg-[var(--color-surface)] px-5 py-4">
        <p className="ov mb-1">Readiness</p>
        <p className="disp num text-[34px] leading-none">
          {data.readinessScore ?? "—"}
        </p>
      </div>

      {/* Sleep */}
      <div className="bg-[var(--color-surface)] px-5 py-4">
        <p className="ov mb-1">Sleep</p>
        <p className="disp num text-[34px] leading-none">
          {data.sleepScore ?? "—"}
        </p>
        {data.totalSleep != null && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {formatDuration(data.totalSleep)}
          </p>
        )}
      </div>

      {/* HRV */}
      <div className="bg-[var(--color-surface)] px-5 py-4">
        <p className="ov mb-1">HRV</p>
        <p className="disp num text-[34px] leading-none">
          {data.averageHrv != null ? Math.round(data.averageHrv) : "—"}
          {data.averageHrv != null && (
            <span className="text-[16px] text-[var(--color-text-muted)]"> ms</span>
          )}
        </p>
      </div>

      {/* Stress */}
      <div className="bg-[var(--color-surface)] px-5 py-4">
        <p className="ov mb-1">Stress</p>
        <p className="disp num text-[34px] leading-none">
          {data.stressSummary
            ? data.stressSummary.charAt(0).toUpperCase() + data.stressSummary.slice(1)
            : "—"}
        </p>
      </div>

      {/* Menstrual phase note */}
      <div className="flex items-center gap-3 bg-[var(--color-surface)] px-5 py-4">
        {phase ? (
          <>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${phase.color}`}>
              {phase.label}
            </span>
            <span className="text-xs leading-snug text-[var(--color-text-muted)]">
              {phase.note}
            </span>
          </>
        ) : (
          <span className="text-xs text-[var(--color-faint)]">No cycle data</span>
        )}
      </div>
    </div>
  );
}
