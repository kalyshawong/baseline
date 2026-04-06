"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

interface VolumeTrendRow {
  week: string;
  [muscleGroup: string]: string | number;
}

interface E1rmSeries {
  exercise: string;
  dataPoints: Array<{ date: string; e1rm: number }>;
}

const muscleColors: Record<string, string> = {
  quads: "#22c55e",
  hamstrings: "#10b981",
  glutes: "#a855f7",
  back: "#3b82f6",
  chest: "#ef4444",
  shoulders: "#f59e0b",
  biceps: "#ec4899",
  triceps: "#f97316",
  calves: "#06b6d4",
  core: "#6366f1",
};

function formatWeek(wk: string): string {
  const d = new Date(wk + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function TrendsCharts() {
  const [volumeTrend, setVolumeTrend] = useState<VolumeTrendRow[]>([]);
  const [e1rmTrend, setE1rmTrend] = useState<E1rmSeries[]>([]);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([
    "quads",
    "back",
    "chest",
  ]);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/workouts/trends?weeks=8")
      .then((r) => r.json())
      .then((data) => {
        setVolumeTrend(data.volumeTrend ?? []);
        setE1rmTrend(data.e1rmTrend ?? []);
        if (data.e1rmTrend?.length > 0) {
          setSelectedExercise(data.e1rmTrend[0].exercise);
        }
      });
  }, []);

  const hasVolumeData = volumeTrend.some((row) =>
    Object.entries(row).some(([k, v]) => k !== "week" && Number(v) > 0)
  );

  const muscleOptions = Object.keys(muscleColors);

  function toggleMuscle(m: string) {
    setSelectedMuscles((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }

  const selectedE1rmSeries = e1rmTrend.find((s) => s.exercise === selectedExercise);

  return (
    <div className="space-y-6">
      {/* Volume Load Trend */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Volume Trend (8 weeks)
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Weekly sets per muscle group
            </p>
          </div>
        </div>

        {!hasVolumeData ? (
          <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
            Log workouts to see volume trends.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {muscleOptions.map((m) => (
                <button
                  key={m}
                  onClick={() => toggleMuscle(m)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-opacity ${
                    selectedMuscles.includes(m)
                      ? "text-white"
                      : "text-[var(--color-text-muted)] opacity-50"
                  }`}
                  style={{
                    backgroundColor: selectedMuscles.includes(m)
                      ? `${muscleColors[m]}33`
                      : "var(--color-surface-2)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: selectedMuscles.includes(m)
                      ? muscleColors[m]
                      : "var(--color-border)",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={volumeTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="week"
                  tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
                  tickFormatter={formatWeek}
                  axisLine={{ stroke: "var(--color-border)" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "var(--color-text-muted)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  labelFormatter={(wk: string) => `Week of ${formatWeek(wk)}`}
                />
                {selectedMuscles.map((m) => (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={m}
                    stroke={muscleColors[m]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </div>

      {/* e1RM Trend */}
      {e1rmTrend.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Estimated 1RM Trend
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Epley formula per compound lift
            </p>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {e1rmTrend.map((s) => (
              <button
                key={s.exercise}
                onClick={() => setSelectedExercise(s.exercise)}
                className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition-all ${
                  selectedExercise === s.exercise
                    ? "border-white/30 bg-white/10 text-white"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]/50"
                }`}
              >
                {s.exercise}
              </button>
            ))}
          </div>
          {selectedE1rmSeries && (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={selectedE1rmSeries.dataPoints}>
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
                  domain={["dataMin - 10", "dataMax + 10"]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  labelFormatter={formatDate}
                  formatter={(value: number) => [`${value}`, "e1RM"]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="e1rm"
                  name={selectedE1rmSeries.exercise}
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={{ r: 4, fill: "#22c55e" }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}
