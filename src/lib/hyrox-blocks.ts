/**
 * Hyrox block periodization engine — pure functions, no DB dependency.
 *
 * Implements the Issurin (2010) block periodization model:
 *   accumulation → transmutation → realization → taper
 *
 * Block lengths auto-scale to the runway (weeks until race) with clamps
 * drawn from the research:
 *   - Taper: 10-21 days (Bosquet 2007)
 *   - Realization: 7-14 days (Issurin 2010)
 *   - Accumulation absorbs any remainder; can be 0 on very short runways
 *
 * Volume + intensity multipliers per block follow Bosquet 2007's
 * 41-60% taper volume reduction, with intensity preserved.
 *
 * Spec: docs/hyrox-module-spec.md § Block periodization engine
 */

export type Block =
  | "accumulation"
  | "transmutation"
  | "realization"
  | "taper"
  | "complete";

export interface BlockDays {
  accumulationDays: number;
  transmutationDays: number;
  realizationDays: number;
  taperDays: number;
}

export interface CurrentBlockState {
  block: Block;
  dayInBlock: number;     // 1-indexed day within the current block
  weekInBlock: number;    // 1-indexed week within the current block
  daysToRace: number;     // may be 0 on race day, negative after
  totalDaysInBlock: number;
  volumeMultiplier: number;    // 1.0 = baseline, 0.5 = mid-taper
  intensityMultiplier: number; // 1.0 = baseline, 1.1 = realization peak
}

/**
 * Canonical default ratio: 2w accumulation / 2w transmutation / 1.5w realization / 2w taper.
 * Sums to 7.5 weeks (52.5 days).
 */
const CANONICAL_WEEKS = 7.5;
const RATIO = {
  accumulation: 2 / CANONICAL_WEEKS,
  transmutation: 2 / CANONICAL_WEEKS,
  realization: 1.5 / CANONICAL_WEEKS,
  taper: 2 / CANONICAL_WEEKS,
} as const;

// Research-backed clamps
const TAPER_MIN_DAYS = 10;
const TAPER_MAX_DAYS = 21;
const REALIZATION_MIN_DAYS = 7;
const REALIZATION_MAX_DAYS = 14;

/**
 * Auto-scale the four blocks to fit a given runway.
 *
 * Algorithm:
 *   1. Compute totalDays = max(weeksToRace * 7, 0)
 *   2. Apply ratio to get raw days per block
 *   3. Clamp taper to [10, 21]
 *   4. Clamp realization to [7, 14]
 *   5. transmutation keeps its proportional share
 *   6. accumulation absorbs any remainder (can be 0 on very short runways)
 *
 * @param weeksToRace Number of weeks from plan start to race day (can be fractional)
 * @returns BlockDays with integer day counts
 */
export function autoScaleBlocks(weeksToRace: number): BlockDays {
  if (!Number.isFinite(weeksToRace) || weeksToRace <= 0) {
    // Race is already over or input is garbage — return zeros
    return {
      accumulationDays: 0,
      transmutationDays: 0,
      realizationDays: 0,
      taperDays: 0,
    };
  }

  const totalDays = Math.round(weeksToRace * 7);

  // Very short runway (< taper floor) — everything collapses into taper
  if (totalDays <= TAPER_MIN_DAYS) {
    return {
      accumulationDays: 0,
      transmutationDays: 0,
      realizationDays: 0,
      taperDays: totalDays,
    };
  }

  // Compute clamped taper and realization first; they have research floors.
  const rawTaper = totalDays * RATIO.taper;
  const taperDays = Math.round(
    Math.min(Math.max(rawTaper, TAPER_MIN_DAYS), TAPER_MAX_DAYS)
  );

  const remainingAfterTaper = totalDays - taperDays;

  // If removing the taper leaves too little room for realization's floor,
  // give everything that's left to realization.
  if (remainingAfterTaper <= REALIZATION_MIN_DAYS) {
    return {
      accumulationDays: 0,
      transmutationDays: 0,
      realizationDays: Math.max(remainingAfterTaper, 0),
      taperDays,
    };
  }

  const rawRealization = totalDays * RATIO.realization;
  const realizationDays = Math.round(
    Math.min(
      Math.max(rawRealization, REALIZATION_MIN_DAYS),
      REALIZATION_MAX_DAYS
    )
  );

  const remainingAfterRealization = remainingAfterTaper - realizationDays;

  // Transmutation gets its proportional share (of total, not remainder) —
  // research says transmutation intensity drives race-specific adaptation,
  // so we don't shrink it unless there literally isn't room.
  const rawTransmutation = totalDays * RATIO.transmutation;
  const transmutationDays = Math.min(
    Math.round(rawTransmutation),
    Math.max(remainingAfterRealization, 0)
  );

  const accumulationDays = Math.max(
    remainingAfterRealization - transmutationDays,
    0
  );

  return {
    accumulationDays,
    transmutationDays,
    realizationDays,
    taperDays,
  };
}

export interface PlanBlockInput {
  startDate: Date;
  raceDate: Date;
  accumulationDays: number;
  transmutationDays: number;
  realizationDays: number;
  taperDays: number;
}

/**
 * Determine which block a given date falls into, how deep into it, and what
 * the training multipliers should be.
 *
 * Blocks run sequentially from startDate:
 *   [startDate, +accumulationDays) → accumulation
 *   [.., +transmutationDays)       → transmutation
 *   [.., +realizationDays)         → realization
 *   [.., +taperDays)               → taper
 *   [raceDate, ∞)                  → complete
 *
 * If the sum of block days doesn't reach raceDate (or overshoots it), we trust
 * the block schedule and let the final block run up to raceDate.
 */
export function currentBlock(
  plan: PlanBlockInput,
  today: Date = new Date()
): CurrentBlockState {
  const start = startOfDay(plan.startDate);
  const race = startOfDay(plan.raceDate);
  const now = startOfDay(today);

  const daysToRace = daysBetween(now, race);

  // Race has passed
  if (daysToRace < 0) {
    return {
      block: "complete",
      dayInBlock: Math.abs(daysToRace),
      weekInBlock: Math.floor(Math.abs(daysToRace) / 7) + 1,
      daysToRace,
      totalDaysInBlock: 0,
      volumeMultiplier: 0,
      intensityMultiplier: 0,
    };
  }

  // We walk forward from startDate. But the research-driven way to locate
  // today is from the race date backwards: taper ends on raceDate, so
  // anything within [raceDate - taperDays, raceDate) is taper.
  const taperStart = addDays(race, -plan.taperDays);
  const realizationStart = addDays(taperStart, -plan.realizationDays);
  const transmutationStart = addDays(realizationStart, -plan.transmutationDays);
  const accumulationStart = addDays(
    transmutationStart,
    -plan.accumulationDays
  );

  // "before plan starts" — treat as accumulation day 0 (pre-plan)
  if (now < accumulationStart) {
    return {
      block: "accumulation",
      dayInBlock: 0,
      weekInBlock: 1,
      daysToRace,
      totalDaysInBlock: plan.accumulationDays,
      volumeMultiplier: 0.8,
      intensityMultiplier: 0.9,
    };
  }

  if (now < transmutationStart) {
    const dayInBlock = daysBetween(accumulationStart, now) + 1;
    return {
      block: "accumulation",
      dayInBlock,
      weekInBlock: Math.floor((dayInBlock - 1) / 7) + 1,
      daysToRace,
      totalDaysInBlock: plan.accumulationDays,
      volumeMultiplier: 1.0,
      intensityMultiplier: 0.9,
    };
  }

  if (now < realizationStart) {
    const dayInBlock = daysBetween(transmutationStart, now) + 1;
    return {
      block: "transmutation",
      dayInBlock,
      weekInBlock: Math.floor((dayInBlock - 1) / 7) + 1,
      daysToRace,
      totalDaysInBlock: plan.transmutationDays,
      volumeMultiplier: 0.9,
      intensityMultiplier: 1.05,
    };
  }

  if (now < taperStart) {
    const dayInBlock = daysBetween(realizationStart, now) + 1;
    return {
      block: "realization",
      dayInBlock,
      weekInBlock: Math.floor((dayInBlock - 1) / 7) + 1,
      daysToRace,
      totalDaysInBlock: plan.realizationDays,
      volumeMultiplier: 0.85,
      intensityMultiplier: 1.1,
    };
  }

  // Taper: Bosquet 2007 progressive volume cut, intensity preserved.
  // Week 1 of taper: ~75% volume. Week 2+: ~50% volume.
  const dayInBlock = daysBetween(taperStart, now) + 1;
  const weekInBlock = Math.floor((dayInBlock - 1) / 7) + 1;
  const volumeMultiplier = weekInBlock >= 2 ? 0.5 : 0.75;

  return {
    block: "taper",
    dayInBlock,
    weekInBlock,
    daysToRace,
    totalDaysInBlock: plan.taperDays,
    volumeMultiplier,
    intensityMultiplier: 1.0, // keep intensity during taper
  };
}

/**
 * Convenience: given a raceDate and "now", figure out how many weeks are left.
 */
export function weeksToRace(raceDate: Date, from: Date = new Date()): number {
  const days = daysBetween(startOfDay(from), startOfDay(raceDate));
  return days / 7;
}

// --- date helpers (module-private) ---

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
