/**
 * Full-width context bar — Readiness/Sleep/HRV/Stress + cycle phase note.
 * Design ref: Baseline Mind.html → .ctxbar
 */

const phaseInfo: Record<string, { label: string; note: string }> = {
  menstrual: {
    label: "Menstrual",
    note: "Energy lowest — prioritize recovery experiments, not high-load interventions.",
  },
  follicular: {
    label: "Follicular",
    note: "Rising energy — good window to test performance interventions.",
  },
  ovulation: {
    label: "Ovulation",
    note: "Peak output — experiments involving intensity/strength are most valid now.",
  },
  luteal: {
    label: "Luteal",
    note: "Temp elevated, mood may shift — account for this in experiment logging.",
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
      <CtxCell label="Readiness">
        <p className="disp num text-[34px] leading-[0.82]">
          {data.readinessScore ?? "—"}
        </p>
      </CtxCell>

      {/* Sleep */}
      <CtxCell label="Sleep">
        <p className="disp num text-[34px] leading-[0.82]">
          {data.totalSleep != null ? formatDuration(data.totalSleep) : (data.sleepScore ?? "—")}
        </p>
      </CtxCell>

      {/* HRV */}
      <CtxCell label="HRV">
        <p className="disp num text-[34px] leading-[0.82]">
          {data.averageHrv != null ? Math.round(data.averageHrv) : "—"}
          {data.averageHrv != null && (
            <small
              className="text-[12px] font-semibold text-[var(--color-faint)]"
              style={{ fontFamily: "var(--font-sans, 'Archivo', system-ui, sans-serif)" }}
            >
              {" "}ms
            </small>
          )}
        </p>
      </CtxCell>

      {/* Stress */}
      <CtxCell label="Stress">
        <p className="disp text-[34px] leading-[0.82]">
          {data.stressSummary
            ? data.stressSummary.charAt(0).toUpperCase() + data.stressSummary.slice(1)
            : "—"}
        </p>
      </CtxCell>

      {/* Cycle phase */}
      <div
        className="flex items-center gap-3 px-5 py-[15px]"
        style={{
          background: "var(--color-surface)",
          backgroundImage: "linear-gradient(160deg, oklch(1 0 0 / 0.03), transparent 50%)",
        }}
      >
        {phase ? (
          <>
            <span
              className="angled-clip shrink-0 px-[11px] py-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.08em]"
              style={{
                background: "color-mix(in oklch, var(--color-red), transparent 78%)",
                color: "var(--color-red)",
              }}
            >
              {phase.label}
            </span>
            <span className="text-[12.5px] leading-snug text-[var(--color-text-muted)]">
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

function CtxCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="px-5 py-[15px] flex flex-col justify-center"
      style={{
        background: "var(--color-surface)",
        backgroundImage: "linear-gradient(160deg, oklch(1 0 0 / 0.03), transparent 50%)",
      }}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--color-faint)] mb-[5px]">
        {label}
      </p>
      {children}
    </div>
  );
}
