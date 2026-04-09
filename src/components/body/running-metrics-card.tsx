import { MetricCard } from "@/components/dashboard/metric-card";

interface RunningMetricsCardProps {
  metrics: {
    runningSpeed: number | null;
    runningPower: number | null;
    groundContactTime: number | null;
    verticalOscillation: number | null;
    strideLength: number | null;
    cardioRecovery: number | null;
    walkingRunningDistance: number | null;
    respiratoryRate: number | null;
    physicalEffort: number | null;
  } | null;
  vo2Max: number | null;
  vo2MaxDate: string | null;
}

export function RunningMetricsCard({ metrics, vo2Max, vo2MaxDate }: RunningMetricsCardProps) {
  const hasAnyData = vo2Max != null || (metrics && Object.values(metrics).some((v) => v != null));

  if (!hasAnyData) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Running & Cardio
        </h2>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <p className="text-xs text-[var(--color-text-muted)]">
            No running or cardio data yet. Do a tracked outdoor run with your Apple Watch, then sync via Health Auto Export.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Running & Cardio
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Running Speed"
          value={metrics?.runningSpeed?.toFixed(1) ?? null}
          unit="km/h"
        />
        <MetricCard
          label="Running Power"
          value={metrics?.runningPower ? Math.round(metrics.runningPower) : null}
          unit="W"
        />
        <MetricCard
          label="VO2 Max"
          value={vo2Max?.toFixed(1) ?? null}
          unit="mL/kg/min"
          detail={vo2MaxDate ?? undefined}
        />
        <MetricCard
          label="Ground Contact"
          value={metrics?.groundContactTime ? Math.round(metrics.groundContactTime) : null}
          unit="ms"
        />
        <MetricCard
          label="Vert. Oscillation"
          value={metrics?.verticalOscillation?.toFixed(1) ?? null}
          unit="cm"
        />
        <MetricCard
          label="Stride Length"
          value={metrics?.strideLength?.toFixed(2) ?? null}
          unit="m"
        />
        <MetricCard
          label="Cardio Recovery"
          value={metrics?.cardioRecovery ? Math.round(metrics.cardioRecovery) : null}
          unit="BPM"
          detail="Post-workout HR drop"
        />
        <MetricCard
          label="Physical Effort"
          value={metrics?.physicalEffort?.toFixed(1) ?? null}
          detail="Apple effort score"
        />
        <MetricCard
          label="Distance"
          value={metrics?.walkingRunningDistance
            ? (metrics.walkingRunningDistance / 1000).toFixed(1)
            : null}
          unit="km"
          detail="Walking + running"
        />
      </div>
      {metrics?.respiratoryRate && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Respiratory rate: {metrics.respiratoryRate.toFixed(1)} breaths/min
        </p>
      )}
    </div>
  );
}
