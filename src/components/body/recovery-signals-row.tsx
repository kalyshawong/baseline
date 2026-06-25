import { MetricCard } from "@/components/dashboard/metric-card";

/**
 * Row of 4 ambient recovery signals — HRV, Stress, SpO2, Resilience.
 * Section label is provided by the parent page — this just renders the grid.
 */

interface Props {
  hrv: number | null;
  stress: {
    daySummary: string | null;
    stressHigh: number | null;
    recoveryHigh: number | null;
  } | null;
  spO2: number | null;
  resilience: {
    level: string | null;
    sleepRecovery: number | null;
    daytimeRecovery: number | null;
    stress: number | null;
  } | null;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RecoverySignalsRow({ hrv, stress, spO2, resilience }: Props) {
  if (hrv == null && stress == null && spO2 == null && resilience == null) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-[14px]">
      <MetricCard
        label="HRV (overnight)"
        value={hrv != null ? Math.round(hrv) : null}
        unit="ms"
        detail={hrv == null ? "Details pending" : "Avg overnight"}
      />
      <MetricCard
        label="Stress"
        value={
          stress?.daySummary
            ? capitalize(stress.daySummary)
            : stress?.stressHigh != null
              ? `${Math.round(stress.stressHigh / 60)}m high`
              : null
        }
        detail={
          stress?.recoveryHigh != null
            ? `${Math.round(stress.recoveryHigh / 60)}m recovery`
            : stress && !stress.daySummary
              ? "Summary pending"
              : undefined
        }
      />
      <MetricCard
        label="SpO₂"
        value={spO2 != null ? Math.round(spO2) : null}
        unit="%"
        detail="Blood oxygen"
      />
      <MetricCard
        label="Resilience"
        value={resilience?.level ? capitalize(resilience.level) : null}
        detail={
          resilience?.sleepRecovery != null
            ? `Sleep: ${resilience.sleepRecovery >= 50 ? "good" : "low"} · Recovery: ${(resilience.daytimeRecovery ?? 0) >= 50 ? "high" : "low"}`
            : undefined
        }
      />
    </div>
  );
}
