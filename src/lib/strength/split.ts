/**
 * Training split — asked at intake (strength goal), so strength mode knows
 * the person's own routine from day 1. Pure: no prisma, safe for client code.
 *
 * Baseline never plans someone's training. The split is THEIR routine, stated
 * by them; the app only uses it to say what's usually next and to count how
 * often each muscle gets trained. Logs verify it later.
 */

export type SplitKind = "full" | "upper_lower" | "ppl" | "bro" | "own";

export interface SplitDay {
  name: string;
  /** Exercise.muscleGroup ids (chest, back, shoulders, …). */
  muscles: string[];
}

export interface TrainingSplit {
  kind: SplitKind;
  /** Training days a week, 1–7. */
  daysPerWeek: number | null;
  /** Usual weekdays, 0 = Mon … 6 = Sun. Optional. */
  weekdays: number[];
  /** The days in the order they run. */
  days: SplitDay[];
}

export const SPLIT_MUSCLES: { id: string; label: string }[] = [
  { id: "chest", label: "Chest" },
  { id: "back", label: "Back" },
  { id: "shoulders", label: "Shoulders" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "quads", label: "Quads" },
  { id: "hamstrings", label: "Hamstrings" },
  { id: "glutes", label: "Glutes" },
  { id: "calves", label: "Calves" },
  { id: "core", label: "Abs" },
];
const MUSCLE_IDS = new Set(SPLIT_MUSCLES.map((m) => m.id));
const ALL = SPLIT_MUSCLES.map((m) => m.id);
const LEGS = ["quads", "hamstrings", "glutes", "calves"];

export const SPLIT_KINDS: { id: SplitKind; title: string; detail: string }[] = [
  { id: "full", title: "Full body", detail: "Everything, every session" },
  { id: "upper_lower", title: "Upper / Lower", detail: "Upper day, lower day" },
  { id: "ppl", title: "Push / Pull / Legs", detail: "Push, pull, legs" },
  { id: "bro", title: "One muscle group a day", detail: "Chest, back, shoulders, arms, legs" },
  { id: "own", title: "My own", detail: "Name your days" },
];

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function presetDays(kind: SplitKind): SplitDay[] {
  switch (kind) {
    case "full":
      return [{ name: "Full body", muscles: [...ALL] }];
    case "upper_lower":
      return [
        { name: "Upper", muscles: ["chest", "back", "shoulders", "biceps", "triceps"] },
        { name: "Lower", muscles: [...LEGS, "core"] },
      ];
    case "ppl":
      return [
        { name: "Push", muscles: ["chest", "shoulders", "triceps"] },
        { name: "Pull", muscles: ["back", "biceps"] },
        { name: "Legs", muscles: [...LEGS] },
      ];
    case "bro":
      return [
        { name: "Chest", muscles: ["chest"] },
        { name: "Back", muscles: ["back"] },
        { name: "Shoulders", muscles: ["shoulders"] },
        { name: "Arms", muscles: ["biceps", "triceps"] },
        { name: "Legs", muscles: [...LEGS] },
      ];
    case "own":
      return [];
  }
}

/** A split is usable once it has days, each with a name and at least one muscle. */
export function splitComplete(s: TrainingSplit | null): boolean {
  return !!s && s.daysPerWeek != null && s.days.length > 0 && s.days.every((d) => d.name.trim() && d.muscles.length > 0);
}

export function normalizeSplit(raw: unknown): TrainingSplit | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = SPLIT_KINDS.some((k) => k.id === o.kind) ? (o.kind as SplitKind) : null;
  if (!kind) return null;
  const dpw = typeof o.daysPerWeek === "number" && o.daysPerWeek >= 1 && o.daysPerWeek <= 7 ? Math.round(o.daysPerWeek) : null;
  const weekdays = Array.isArray(o.weekdays)
    ? [...new Set(o.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [];
  const days = Array.isArray(o.days)
    ? o.days
        .map((d) => {
          if (!d || typeof d !== "object") return null;
          const x = d as Record<string, unknown>;
          const name = typeof x.name === "string" ? x.name.trim().slice(0, 24) : "";
          const muscles = Array.isArray(x.muscles) ? [...new Set(x.muscles.filter((m): m is string => typeof m === "string" && MUSCLE_IDS.has(m)))] : [];
          return name ? { name, muscles } : null;
        })
        .filter((d): d is SplitDay => d !== null)
        .slice(0, 7)
    : [];
  return { kind, daysPerWeek: dpw, weekdays, days };
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Which split day a logged session belongs to. Exact name first, then a
 * template that starts with the day's name ("Push A" → Push). -1 = none.
 */
export function matchSplitDay(template: string | null, days: SplitDay[]): number {
  if (!template) return -1;
  const t = norm(template);
  const exact = days.findIndex((d) => norm(d.name) === t);
  if (exact >= 0) return exact;
  // Longest name first so "Upper" doesn't steal "Upper back".
  const byLen = days.map((d, i) => ({ i, n: norm(d.name) })).sort((a, b) => b.n.length - a.n.length);
  const hit = byLen.find(({ n }) => t === n || t.startsWith(n + " "));
  return hit ? hit.i : -1;
}

/**
 * The day that usually comes next in THEIR rotation: the one after the most
 * recent logged session that matches a split day. No match yet → day 1.
 * `recentTemplates` newest first.
 */
export function usualNextDay(split: TrainingSplit, recentTemplates: (string | null)[]): { index: number; afterTemplate: string | null } | null {
  if (!split.days.length) return null;
  for (const t of recentTemplates) {
    const i = matchSplitDay(t, split.days);
    if (i >= 0) return { index: (i + 1) % split.days.length, afterTemplate: t };
  }
  return { index: 0, afterTemplate: null };
}
