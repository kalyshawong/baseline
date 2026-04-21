/**
 * Hyrox pace math — pure functions, no DB or API dependencies.
 *
 * Translates a target finish time into:
 *   - per-km run pace
 *   - per-station time budget
 *   - transition budget
 *
 * Foundation: Brandt et al. (2025) — running is ~60% of total race time for
 * sub-elite athletes, stations ~35%, transitions ~5%. Station time is unequal
 * in reality; we weight by HYROX_STATION_TIME_WEIGHTS from hyrox-constants.
 *
 * Spec: docs/hyrox-module-spec.md § Pace math
 */

import {
  HYROX_RUN_COUNT,
  HYROX_STATIONS,
  HYROX_STATION_TIME_WEIGHTS,
  HYROX_TIME_SPLIT,
  HYROX_TOTAL_RUN_DISTANCE_METERS,
  type HyroxStationKey,
} from "./hyrox-constants";

export interface HyroxPaceBudget {
  /** Target total race time in seconds. */
  totalSeconds: number;
  /** Total time allocated to running (all 8 × 1km). */
  runSeconds: number;
  /** Total time allocated to the 8 stations (sum of per-station budgets). */
  stationSeconds: number;
  /** Total time allocated to transitions (run↔station). */
  transitionSeconds: number;
  /** Average seconds per km for running (all 8km equal). */
  kmPaceSeconds: number;
  /** Average seconds per station (uniform — see perStationBudget for weighted). */
  avgStationSeconds: number;
  /** Average seconds per transition (16 transitions total — before and after each station). */
  transitionPerSegmentSeconds: number;
  /** Per-station seconds allocated using HYROX_STATION_TIME_WEIGHTS. */
  perStationBudget: Record<HyroxStationKey, number>;
}

/**
 * Compute a full pace budget from a target finish time.
 *
 * @param targetSeconds Total target time in seconds (e.g., 5100 for sub-85 min)
 * @returns HyroxPaceBudget with all derived targets
 * @throws If targetSeconds is not a positive finite number
 */
export function computePaceBudget(targetSeconds: number): HyroxPaceBudget {
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) {
    throw new Error(
      `computePaceBudget: targetSeconds must be a positive finite number, got ${targetSeconds}`
    );
  }

  const runSeconds = targetSeconds * HYROX_TIME_SPLIT.running;
  const stationSeconds = targetSeconds * HYROX_TIME_SPLIT.stations;
  const transitionSeconds = targetSeconds * HYROX_TIME_SPLIT.transitions;

  // 1 km per run segment; total 8 km → km pace is runSeconds / 8.
  const totalRunKm = HYROX_TOTAL_RUN_DISTANCE_METERS / 1000;
  const kmPaceSeconds = runSeconds / totalRunKm;

  const avgStationSeconds = stationSeconds / HYROX_RUN_COUNT;

  // There are 16 half-transitions (run→station, station→run) for each of
  // 8 pairs, but some counts use 8. We use 16 as the conservative granularity.
  const transitionPerSegmentSeconds = transitionSeconds / (HYROX_RUN_COUNT * 2);

  // Weighted per-station budget. Weights already sum to 1.0.
  const perStationBudget = HYROX_STATIONS.reduce(
    (acc, station) => {
      const weight = HYROX_STATION_TIME_WEIGHTS[station.key];
      acc[station.key] = roundSeconds(stationSeconds * weight);
      return acc;
    },
    {} as Record<HyroxStationKey, number>
  );

  return {
    totalSeconds: roundSeconds(targetSeconds),
    runSeconds: roundSeconds(runSeconds),
    stationSeconds: roundSeconds(stationSeconds),
    transitionSeconds: roundSeconds(transitionSeconds),
    kmPaceSeconds: roundSeconds(kmPaceSeconds),
    avgStationSeconds: roundSeconds(avgStationSeconds),
    transitionPerSegmentSeconds: roundSeconds(transitionPerSegmentSeconds),
    perStationBudget,
  };
}

/**
 * Format seconds as "mm:ss" for run-pace display (e.g., 382 → "6:22").
 */
export function formatKmPace(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—:—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Format seconds as "h:mm:ss" or "mm:ss" for total-time display.
 */
export function formatClockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—:—:—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Parse common target-time formats from goal.target strings.
 * Accepts:
 *   - "sub 85", "sub-85", "sub 85 min", "sub 85 minutes"
 *   - "85 min", "85 minutes"
 *   - "1:25:00", "1:25", "85:00"
 * Returns total seconds, or null if unparseable.
 */
export function parseTargetTimeSeconds(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.toLowerCase().trim();

  // "1:25:00" or "85:00" — colon-separated
  const colonMatch = s.match(/(\d+):(\d+)(?::(\d+))?/);
  if (colonMatch) {
    const a = parseInt(colonMatch[1], 10);
    const b = parseInt(colonMatch[2], 10);
    const c = colonMatch[3] ? parseInt(colonMatch[3], 10) : null;
    if (c !== null) {
      // h:mm:ss
      return a * 3600 + b * 60 + c;
    }
    // mm:ss (if first < 10, treat as h:mm; otherwise mm:ss)
    if (a < 10) {
      return a * 3600 + b * 60;
    }
    return a * 60 + b;
  }

  // "sub 85", "sub-85", "85 min", "85 minutes"
  const minMatch = s.match(/(?:sub[-\s]*)?(\d+(?:\.\d+)?)\s*(?:min|minutes|m\b)?/);
  if (minMatch) {
    const mins = parseFloat(minMatch[1]);
    if (Number.isFinite(mins) && mins > 10 && mins < 300) {
      return Math.round(mins * 60);
    }
  }

  return null;
}

function roundSeconds(n: number): number {
  return Math.round(n);
}

/**
 * Compare an actual recorded time against a budget and return the delta.
 * Positive delta = slower than budget; negative = faster.
 */
export function paceDelta(actualSeconds: number, budgetSeconds: number): {
  deltaSeconds: number;
  pctOff: number;
  onPace: boolean;
} {
  const deltaSeconds = actualSeconds - budgetSeconds;
  const pctOff = budgetSeconds > 0 ? deltaSeconds / budgetSeconds : 0;
  // "On pace" = within ±2% of budget
  const onPace = Math.abs(pctOff) <= 0.02;
  return { deltaSeconds, pctOff, onPace };
}
