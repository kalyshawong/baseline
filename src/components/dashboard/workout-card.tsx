"use client";

import Link from "next/link";
import { Area, AreaChart, ReferenceArea, ResponsiveContainer, YAxis } from "recharts";
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
  /** Pre-run fuel attribution ("oatmeal · 1.5h before · …" or fasted note) —
   * what the meal→GI analyzer will pair this workout's GI outcome with. */
  fuelLine?: string | null;
  /** HR-zone anchor: her OBSERVED max HR (falls back to 220−age only if set
   *  and higher). Null → no zone bands. */
  zoneMaxHr?: number | null;
}

/** Five classic zones as fractions of max HR, coldest → hottest. */
const ZONES = [
  { id: "Z1", lo: 0.5, hi: 0.6, color: "#4a90d9" },
  { id: "Z2", lo: 0.6, hi: 0.7, color: "#3fa66a" },
  { id: "Z3", lo: 0.7, hi: 0.8, color: "#d9b03f" },
  { id: "Z4", lo: 0.8, hi: 0.9, color: "#d97b3f" },
  { id: "Z5", lo: 0.9, hi: 1.01, color: "#d94a4a" },
] as const;

function zoneOf(bpm: number, maxHr: number): number {
  const f = bpm / maxHr;
  if (f < 0.6) return 0;
  if (f < 0.7) return 1;
  if (f < 0.8) return 2;
  if (f < 0.9) return 3;
  return 4;
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

export function WorkoutCard({ workout, hrChart, fuelLine, zoneMaxHr }: Props) {
  const timeRange = `${formatTime(workout.startedAt)} – ${formatTime(workout.endedAt)}`;
  const durationStr = formatDuration(workout.durationSeconds);
  const hasHrData = workout.avgHeartRate != null;
  const hasHrChart = hrChart.length > 1;

  // Time-in-zone from the (evenly downsampled) curve — % of samples per zone.
  const maxHr = zoneMaxHr ?? null;
  const zonePct: number[] | null =
    maxHr && hasHrChart
      ? (() => {
          const counts = [0, 0, 0, 0, 0];
          for (const p of hrChart) counts[zoneOf(p.bpm, maxHr)]++;
          return counts.map((c) => Math.round((c / hrChart.length) * 100));
        })()
      : null;

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
                  {/* Zone bands anchored to HER observed max HR — horizontal
                      tints behind the curve, coldest to hottest. */}
                  {maxHr &&
                    ZONES.map((z) => (
                      <ReferenceArea
                        key={z.id}
                        y1={z.lo * maxHr}
                        y2={z.hi * maxHr}
                        fill={z.color}
                        fillOpacity={0.09}
                        stroke="none"
                        ifOverflow="hidden"
                      />
                    ))}
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

          {/* Time-in-zone strip + legend (only with zones + a curve) */}
          {zonePct && maxHr && (
            <div className="mt-2">
              <div className="flex h-[8px] w-full overflow-hidden">
                {ZONES.map((z, i) =>
                  zonePct[i] > 0 ? (
                    <div key={z.id} style={{ width: `${zonePct[i]}%`, background: z.color, opacity: 0.85 }} />
                  ) : null,
                )}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-[2px]">
                {ZONES.map((z, i) => (
                  <span key={z.id} className="text-[10px] tabular-nums text-[var(--color-faint)]">
                    <span style={{ color: z.color, fontWeight: 700 }}>{z.id}</span>{" "}
                    {Math.round(z.lo * maxHr)}–{Math.round(Math.min(1, z.hi) * maxHr)} · {zonePct[i]}%
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[9.5px] text-[var(--color-faint)]">
                Zones vs your observed max ({maxHr} bpm), not an age formula.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pre-run fuel attribution — context for the GI outcome logged below */}
      {fuelLine && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
            Pre-run fuel
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-text-muted)]">
            {fuelLine}
          </p>
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
