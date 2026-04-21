/**
 * Hyrox race-prep module — static constants.
 *
 * Station order and standards from the official Hyrox Open format:
 * 8 × 1km runs interleaved with 8 workout stations, run first.
 *
 * Women's Open weights per 2025 ruleset. "Pro" uses heavier weights —
 * add a separate constant if/when we support Pro division.
 *
 * Spec: docs/hyrox-module-spec.md
 */

export type HyroxStationKey =
  | "ski_erg"
  | "sled_push"
  | "sled_pull"
  | "burpee_broad_jump"
  | "row"
  | "farmers_carry"
  | "sandbag_lunges"
  | "wall_balls";

export interface HyroxStation {
  /** Stable DB key — never change once shipped. */
  key: HyroxStationKey;
  /** Display label. */
  label: string;
  /** Work distance in meters, if the station is distance-scored. */
  distanceMeters?: number;
  /** Work reps, if the station is rep-scored (wall balls). */
  reps?: number;
  /** Women's Open prescribed weight in kg. null = bodyweight / machine. */
  womenWeightKg: number | null;
  /** Short description of what one unit of work looks like. */
  description: string;
}

/**
 * Canonical station order for a Hyrox race. Run 1km precedes each station.
 */
export const HYROX_STATIONS: readonly HyroxStation[] = [
  {
    key: "ski_erg",
    label: "Ski Erg",
    distanceMeters: 1000,
    womenWeightKg: null,
    description: "1000m on the Concept2 SkiErg",
  },
  {
    key: "sled_push",
    label: "Sled Push",
    distanceMeters: 50,
    womenWeightKg: 102,
    description: "50m sled push @ 102kg (women's Open)",
  },
  {
    key: "sled_pull",
    label: "Sled Pull",
    distanceMeters: 50,
    womenWeightKg: 78,
    description: "50m sled pull @ 78kg (women's Open)",
  },
  {
    key: "burpee_broad_jump",
    label: "Burpee Broad Jumps",
    distanceMeters: 80,
    womenWeightKg: null,
    description: "80m of burpee broad jumps",
  },
  {
    key: "row",
    label: "Rowing",
    distanceMeters: 1000,
    womenWeightKg: null,
    description: "1000m on the Concept2 RowErg",
  },
  {
    key: "farmers_carry",
    label: "Farmers Carry",
    distanceMeters: 200,
    womenWeightKg: 16, // per hand
    description: "200m farmers carry @ 2×16kg (women's Open)",
  },
  {
    key: "sandbag_lunges",
    label: "Sandbag Lunges",
    distanceMeters: 100,
    womenWeightKg: 20,
    description: "100m of walking lunges with a 20kg sandbag",
  },
  {
    key: "wall_balls",
    label: "Wall Balls",
    reps: 100,
    womenWeightKg: 4, // 9lb ball
    description: "100 wall balls @ 4kg ball to 9ft target",
  },
] as const;

/**
 * Quick lookup by key.
 */
export const HYROX_STATIONS_BY_KEY: Record<HyroxStationKey, HyroxStation> =
  HYROX_STATIONS.reduce(
    (acc, s) => {
      acc[s.key] = s;
      return acc;
    },
    {} as Record<HyroxStationKey, HyroxStation>
  );

/** Distance of one run segment. */
export const HYROX_RUN_DISTANCE_METERS = 1000;

/** Total running distance across all 8 segments. */
export const HYROX_TOTAL_RUN_DISTANCE_METERS = 8 * HYROX_RUN_DISTANCE_METERS;

/** Number of run segments (= number of stations). */
export const HYROX_RUN_COUNT = 8;

/**
 * Brandt et al. (2025) split of total race time across categories.
 * Used by hyrox-pace.ts to translate a target time into run/station/transition budgets.
 *
 * These sum to 1.0. Running dominates (~60%), stations ~35%, transitions ~5%.
 */
export const HYROX_TIME_SPLIT = {
  running: 0.6,
  stations: 0.35,
  transitions: 0.05,
} as const;

/**
 * Relative difficulty weights for the 8 stations when distributing the station
 * time budget. Heavier = slower.
 *
 * Derived from Brandt 2025 sample medians (women's Open): wall balls and
 * sandbag lunges are the longest stations, ski erg / row the shortest.
 *
 * Weights sum to 1.0 so they can directly multiply `stationSeconds`.
 */
export const HYROX_STATION_TIME_WEIGHTS: Record<HyroxStationKey, number> = {
  ski_erg: 0.1,
  sled_push: 0.13,
  sled_pull: 0.12,
  burpee_broad_jump: 0.15,
  row: 0.1,
  farmers_carry: 0.09,
  sandbag_lunges: 0.15,
  wall_balls: 0.16,
};
