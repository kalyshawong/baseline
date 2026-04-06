"use client";

import type { BaselineScore } from "@/lib/baseline-score";

const colorMap = {
  green: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    ring: "ring-emerald-500",
    glow: "shadow-emerald-500/20",
  },
  yellow: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-400",
    ring: "ring-yellow-500",
    glow: "shadow-yellow-500/20",
  },
  red: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
    ring: "ring-red-500",
    glow: "shadow-red-500/20",
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
          className="h-full rounded-full bg-white/30 transition-all duration-500"
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
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-[var(--color-text-muted)]">
          {isConnected
            ? "No readiness data yet. Hit Sync to pull your latest Oura data."
            : "Connect your Oura ring and sync to see your Baseline Score."}
        </p>
        {!isConnected && (
          <a
            href="/api/auth/oura"
            className="mt-4 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition-colors"
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
      className={`rounded-2xl border ${colors.border} ${colors.bg} p-6 shadow-lg ${colors.glow}`}
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
              className={`rounded-full px-3 py-1 text-sm font-semibold ${colors.bg} ${colors.text} border ${colors.border}`}
            >
              {score.label}
            </span>
          </div>
        </div>
        <div
          className={`h-3 w-3 rounded-full ${colors.ring} ring-4 ring-offset-0 ${
            score.color === "green"
              ? "bg-emerald-400"
              : score.color === "yellow"
                ? "bg-yellow-400"
                : "bg-red-400"
          }`}
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
