/**
 * Pure constants for the lifter soreness map (no server imports) — shared by
 * the Body tab (server) and the check-in screen (client).
 */

/* ---------- soreness (shared with the check-in) ---------- */

/** Tile ids, front then back, as drawn (12 tiles; left/right pairs share a value). */
export const SORE_TILES = [
  { id: "side delts", n: "Side delts", a: "SD" },
  { id: "front delts", n: "Front delts", a: "F DELT" },
  { id: "biceps", n: "Biceps", a: "BI" },
  { id: "chest", n: "Chest", a: "CHEST" },
  { id: "core", n: "Abs", a: "ABS" },
  { id: "quads", n: "Quads", a: "QUADS" },
  { id: "rear delts", n: "Rear delts", a: "RD" },
  { id: "back", n: "Back", a: "BACK" },
  { id: "triceps", n: "Triceps", a: "TRI" },
  { id: "glutes", n: "Glutes", a: "GLUTES" },
  { id: "hamstrings", n: "Hamstrings", a: "HAMS" },
  { id: "calves", n: "Calves", a: "CALVES" },
] as const;
export type SoreTileId = (typeof SORE_TILES)[number]["id"];

/** [tile id, grid-column, span, grid-row, span] — the figure layout from the prototype. */
export const TILES_FRONT: [SoreTileId, number, number, number, number][] = [
  ["side delts", 1, 1, 1, 1], ["front delts", 2, 2, 1, 1], ["side delts", 4, 1, 1, 1],
  ["biceps", 1, 1, 2, 1], ["chest", 2, 2, 2, 1], ["biceps", 4, 1, 2, 1],
  ["core", 2, 2, 3, 1], ["quads", 2, 2, 4, 1],
];
export const TILES_BACK: [SoreTileId, number, number, number, number][] = [
  ["rear delts", 1, 1, 1, 1], ["back", 2, 2, 1, 2], ["rear delts", 4, 1, 1, 1],
  ["triceps", 1, 1, 2, 1], ["triceps", 4, 1, 2, 1],
  ["glutes", 2, 2, 3, 1], ["hamstrings", 2, 2, 4, 1], ["calves", 2, 2, 5, 1],
];

/** SorenessLog keeps the 1–10 scale the rest of the app uses; the lifter map is 0–3. */
export function sorenessToLevel(severity: number): 0 | 1 | 2 | 3 {
  if (severity <= 0) return 0;
  if (severity <= 3) return 1;
  if (severity <= 6) return 2;
  return 3;
}
export function levelToSeverity(level: number): number {
  return [0, 3, 6, 9][Math.max(0, Math.min(3, level))];
}

