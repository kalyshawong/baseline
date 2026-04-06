"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { kgToLb } from "@/lib/tdee";

interface WeightPoint {
  date: string;
  weight: number; // in display unit
  avg: number | null; // in display unit
}

function formatDate(d: string): string {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WeightTrendChart({
  logs,
  unit,
  targetWeightKg,
}: {
  logs: Array<{ date: string; weightKg: number; avg: number | null }>;
  unit: "lb" | "kg";
  targetWeightKg: number | null;
}) {
  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text-muted)]">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider">Weight Trend</h2>
        <p>No weight logs yet. Log your first entry to see the 30-day chart.</p>
      </div>
    );
  }

  const data: WeightPoint[] = logs.map((l) => ({
    date: l.date,
    weight: unit === "lb" ? kgToLb(l.weightKg) : Math.round(l.weightKg * 10) / 10,
    avg: l.avg != null ? (unit === "lb" ? kgToLb(l.avg) : Math.round(l.avg * 10) / 10) : null,
  }));

  const targetDisplay = targetWeightKg
    ? unit === "lb"
      ? kgToLb(targetWeightKg)
      : targetWeightKg
    : null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="mb-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Weight Trend (30 days)
        </h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Raw + 7-day moving average
        </p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
            tickFormatter={formatDate}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={35}
            domain={["dataMin - 2", "dataMax + 2"]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 11,
            }}
            labelFormatter={formatDate}
            formatter={(value: number, name: string) => [
              value != null ? `${value} ${unit}` : "—",
              name === "weight" ? "Raw" : "7-day avg",
            ]}
          />
          {targetDisplay && (
            <ReferenceLine
              y={targetDisplay}
              stroke="#a855f7"
              strokeDasharray="4 4"
              label={{ value: `Target ${targetDisplay}${unit}`, fill: "#a855f7", fontSize: 10, position: "right" }}
            />
          )}
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#525252"
            strokeWidth={1.5}
            dot={{ r: 2 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="avg"
            stroke="#22c55e"
            strokeWidth={2.5}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4 text-[10px] text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-[#525252]" /> Raw
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-emerald-500" /> 7-day avg
        </span>
        {targetDisplay && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-purple-500" /> Target
          </span>
        )}
      </div>
    </div>
  );
}
