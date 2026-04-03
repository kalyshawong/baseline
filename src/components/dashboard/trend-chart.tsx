"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { DaySnapshot } from "@/lib/baseline-score";

function formatDay(day: string): string {
  const d = new Date(day + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const colorForScore = (score: number | null) => {
  if (score == null) return "#525252";
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  return "#ef4444";
};

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: DaySnapshot;
}

function CustomDot({ cx, cy, payload }: CustomDotProps) {
  if (!cx || !cy || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={colorForScore(payload.baselineScore)}
      stroke="var(--color-surface)"
      strokeWidth={2}
    />
  );
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DaySnapshot }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs shadow-lg">
      <p className="font-medium">{formatDay(d.day)}</p>
      <div className="mt-1 space-y-0.5 text-[var(--color-text-muted)]">
        <p>
          Baseline:{" "}
          <span
            className="font-mono font-medium"
            style={{ color: colorForScore(d.baselineScore) }}
          >
            {d.baselineScore ?? "—"}
          </span>
        </p>
        <p>Readiness: <span className="font-mono">{d.readinessScore ?? "—"}</span></p>
        <p>Sleep: <span className="font-mono">{d.sleepScore ?? "—"}</span></p>
        <p>HRV: <span className="font-mono">{d.averageHrv ?? "—"}</span> ms</p>
      </div>
    </div>
  );
}

export function TrendChart({ data }: { data: DaySnapshot[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-sm text-[var(--color-text-muted)]">
        No trend data available yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        7-Day Trend
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            tickFormatter={(d: string) => {
              const date = new Date(d + "T00:00:00");
              return date.toLocaleDateString("en-US", { weekday: "short" });
            }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--color-text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="baselineScore"
            stroke="#a3a3a3"
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 7, stroke: "white", strokeWidth: 2 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="readinessScore"
            stroke="#6366f1"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="averageHrv"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-3 flex gap-4 text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-[#a3a3a3]" />
          Baseline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-[#6366f1] opacity-60" />
          Readiness
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded bg-[#8b5cf6] opacity-60" />
          HRV
        </span>
      </div>
    </div>
  );
}
