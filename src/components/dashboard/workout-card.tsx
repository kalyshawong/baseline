"use client";

import Link from "next/link";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { WorkoutNotesBlock } from "@/components/dashboard/workout-notes-block";

/**
 * Full-treatment card for a single workout. Replaces the squashed
 * sub-section that used to live inside ActivityCard.
 *
 * Design influences: Apple Fitness's workout-summary card (prominent
 * title, time range, stat grid, HR section with chart) — adapted to
 * Baseline's calmer palette and typography. The HR curve is the
 * featured artifact since it's what most strongly differentiates a
 * "workout card" from a flat stat row.
 *
 * The embedded WorkoutNotesBlock keeps the existing narrative +
 * analyze flow attached to this card so all the workout context lives
 * in one place.
 */

interface Props {
  workout: {
    id: string;
    name: string;
    /** ISO string for safe RSC → client serialization */
    startedAt: string;
    endedAt: string;
    durationSeconds: number;
    activeCalories: number | null;
    avgHeartRate: number | null;
    maxHeartRate: number | null;
    minHeartRate: number | null;
  };
  /** Downsampled HR curve. Empty array when no samples exist for the window. */
  hrChart: Array<{ t: number; bpm: number }>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function WorkoutCard({ workout, hrChart }: Props) {
  const timeRange = `${formatTime(workout.startedAt)} – ${formatTime(workout.endedAt)}`;
  const durationStr = formatDuration(workout.durationSeconds);
  const hasHrData = workout.avgHeartRate != null;
  const hasHrChart = hrChart.length > 1;

  return (
    <div className="panel">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
        Workout
      </p>

      {/* Title + time */}
      <h2 className="mt-3 text-xl font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-2xl">
        {workout.name}
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{timeRange}</p>

      {/* Stat grid: duration + active calories */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label="Duration" value={durationStr} />
        <Stat
          label="Active cal"
          value={
            workout.activeCalories != null
              ? `${Math.round(workout.activeCalories)}`
              : "—"
          }
          unit={workout.activeCalories != null ? "cal" : undefined}
        />
      </div>

      {/* HR feature block — bigger type, range below */}
      {hasHrData && (
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
            Avg heart rate
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-4xl font-bold tabular-nums text-[var(--color-red)]">
              {workout.avgHeartRate}
            </span>
            <span className="text-sm font-medium text-[var(--color-text-muted)]">
              bpm
            </span>
            {workout.maxHeartRate != null && workout.minHeartRate != null && (
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                range {workout.minHeartRate}–{workout.maxHeartRate}
              </span>
            )}
          </div>

          {/* HR chart — only renders when we have enough points to draw a curve.
            * Single-color filled area, no axes, no gridlines. The shape IS the data;
            * any chrome would dilute it. */}
          {hasHrChart && (
            <div className="mt-3 h-20 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={hrChart}
                  margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="var(--color-red)"
                        stopOpacity={0.55}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--color-red)"
                        stopOpacity={0.05}
                      />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                  <Area
                    type="monotone"
                    dataKey="bpm"
                    stroke="var(--color-red)"
                    strokeWidth={1.5}
                    fill="url(#hrFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Notes + analyze flow */}
      <WorkoutNotesBlock source="healthkit" workoutId={workout.id} />

      {/* Deep-dive path: opens /coach with a draft message pre-loaded
       * from this workout's data + narrative + signals + any prior
       * one-shot analysis. The user can edit the draft before sending —
       * we never auto-trigger AI. Complements (does not replace) the
       * inline Analyze button above. */}
      <div className="mt-4 border-t border-[var(--color-border)] pt-3">
        <Link
          href={`/coach?workout=${encodeURIComponent(workout.id)}&source=healthkit`}
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:text-[var(--color-text)] active:scale-[0.97]"
        >
          Discuss with coach
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h6M6 3l3 3-3 3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-[var(--color-surface-2)] px-4 py-3">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text)]">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-[var(--color-text-muted)]">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}
