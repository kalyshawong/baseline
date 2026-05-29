"use client";

import type { BaselineScore } from "@/lib/baseline-score";

/* Colors are derived from the --color-green/yellow/red tokens via
 * color-mix so the score card respects the design system tokens rather
 * than drifting to Tailwind's emerald/yellow/red palette. */
const colorMap = {
  green: {
    bg: "bg-[color-mix(in_srgb,var(--color-green)_10%,transparent)]",
    border: "border-[color-mix(in_srgb,var(--color-green)_30%,transparent)]",
    text: "text-[var(--color-green)]",
    ring: "ring-[var(--color-green)]",
    dot: "bg-[var(--color-green)]",
    glow: "shadow-[0_0_24px_color-mix(in_srgb,var(--color-green)_20%,transparent)]",
  },
  yellow: {
    bg: "bg-[color-mix(in_srgb,var(--color-yellow)_10%,transparent)]",
    border: "border-[color-mix(in_srgb,var(--color-yellow)_30%,transparent)]",
    text: "text-[var(--color-yellow)]",
    ring: "ring-[var(--color-yellow)]",
    dot: "bg-[var(--color-yellow)]",
    glow: "shadow-[0_0_24px_color-mix(in_srgb,var(--color-yellow)_20%,transparent)]",
  },
  red: {
    bg: "bg-[color-mix(in_srgb,var(--color-red)_10%,transparent)]",
    border: "border-[color-mix(in_srgb,var(--color-red)_30%,transparent)]",
    text: "text-[var(--color-red)]",
    ring: "ring-[var(--color-red)]",
    dot: "bg-[var(--color-red)]",
    glow: "shadow-[0_0_24px_color-mix(in_srgb,var(--color-red)_20%,transparent)]",
  },
};

function ComponentBar({
  label,
  value,
  weight,
}: {
  label: string;
  value: number | null;
  weight: number;
}) {
  const pct = value ?? 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-[var(--color-text-muted)]">
          {label}{" "}
          <span className="opacity-50">({Math.round(weight * 100)}%)</span>
        </span>
        <span className="font-mono">
          {value != null ? value : "—"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-full bg-white/30 transition-[width] duration-300 ease-out-strong"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function BaselineScoreCard({
  score,
  isConnected,
}: {
  score: BaselineScore | null;
  isConnected: boolean;
}) {
  if (!score) {
    return (
      <div className="card-enter border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-[var(--color-text-muted)]">
          {isConnected
            ? "No readiness data yet. Hit Sync to pull your latest Oura data."
            : "Connect your Oura ring and sync to see your Baseline Score."}
        </p>
        {!isConnected && (
          <a
            href="/api/auth/oura"
            className="mt-4 inline-block bg-white/10 px-4 py-2 text-sm transition duration-150 ease-out-strong hover:bg-white/20 active:scale-[0.97]"
          >
            Connect Oura
          </a>
        )}
      </div>
    );
  }

  const colors = colorMap[score.color];

  return (
    <div
      className={`card-enter border ${colors.border} ${colors.bg} bg-[var(--color-surface-2)] p-8 shadow-lg ${colors.glow}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Baseline Score
          </p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className={`text-5xl font-bold tabular-nums ${colors.text}`}>
              {score.overall}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
            >
              {score.label}
            </span>
          </div>
        </div>
        <div
          className={`h-3 w-3 rounded-full ${colors.dot} ring-4 ring-offset-0 ${colors.ring}/30`}
        />
      </div>

      <div className="mt-6 space-y-3">
        <ComponentBar
          label="Readiness"
          value={score.components.readiness.value}
          weight={score.components.readiness.weight}
        />
        <ComponentBar
          label="HRV Trend"
          value={score.components.hrvTrend.value}
          weight={score.components.hrvTrend.weight}
        />
        <ComponentBar
          label="Sleep Quality"
          value={score.components.sleepQuality.value}
          weight={score.components.sleepQuality.weight}
        />
        <ComponentBar
          label="Temp Deviation"
          value={score.components.tempDeviation.value}
          weight={score.components.tempDeviation.weight}
        />
      </div>
    </div>
  );
}
