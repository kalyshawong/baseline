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

/**
 * Weight trend chart — no panel wrapper, composed inside parent .compcard.
 * Design ref: Baseline Body.html → .trendph
 */

interface WeightPoint {
  date: string;
  weight: number;
  avg: number | null;
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
      <div className="mt-[14px] h-[120px] bg-[var(--color-surface-2)] flex items-center justify-center">
        <p className="text-xs text-[var(--color-faint)]">No weight logs yet.</p>
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
    <>
      <div
        className="mt-[14px] relative overflow-hidden"
        style={{ height: "120px", background: "var(--color-surface-2)" }}
      >
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" hide />
            <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 0,
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
                stroke="oklch(0.82 0.155 88)"
                strokeDasharray="5 5"
                strokeOpacity={0.5}
              />
            )}
            <Line
              type="monotone"
              dataKey="weight"
              stroke="oklch(0.66 0.012 264)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="avg"
              stroke="oklch(0.82 0.155 88)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-[10px] text-[11.5px] text-[var(--color-faint)]">
        30-day weight · 7-day moving average (gold) · target line dashed
      </p>
    </>
  );
}
