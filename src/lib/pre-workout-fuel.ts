import { prisma } from "@/lib/db";
import { tagFood, type FoodTag } from "./food-tags";

/**
 * Pre-workout fuel computation.
 *
 * Background — the May 28 food↔performance audit (see CLAUDE.md / repo
 * conversation history): every consumer of nutrition data in the app
 * was either dropping `timeUnknown` entries entirely or rendering them
 * as "time unknown" with no time band, even though the user's logging
 * convention treats `mealType` itself as a coarse time band. That made
 * ~15% of nutrition entries invisible for meal-to-workout-gap
 * questions, and forced the model to re-derive "what did I eat before
 * this workout?" from raw entries every time.
 *
 * This helper centralizes that computation. Given a workout's start
 * time, it returns the macros eaten in the last N hours plus a list of
 * the actual items, with each item's gap-to-workout range. Time-known
 * entries get an exact gap; `timeUnknown` entries get a {min, max}
 * range derived from the mealType band:
 *
 *   - breakfast = 00:00–12:00 local
 *   - lunch     = 12:00–17:00 local
 *   - dinner    = 17:00–24:00 local
 *   - snack     = 00:00–24:00 local (entire day — least useful but
 *                 still included rather than silently dropped)
 *
 * The window can cross midnight (e.g. an early-morning workout pulls
 * the previous evening's dinner), so we pre-fetch a generous lookback
 * and filter by overlap.
 */

const MEAL_BANDS: Record<string, [number, number]> = {
  breakfast: [0, 12],
  lunch: [12, 17],
  dinner: [17, 24],
  snack: [0, 24],
};

export interface FuelItem {
  description: string;
  mealType: string;
  /** True when the entry has a real logged time; false when only the meal band is known. */
  timeKnown: boolean;
  /** Display label: clock time, or band hint like "breakfast (before noon)". */
  timeLabel: string;
  /**
   * Gap from this item to workout start, in hours. For time-known
   * items, min === max. For band-only items, min is the latest the
   * meal could have been (= shortest possible gap) and max is the
   * earliest (= longest possible gap).
   */
  gapHours: { min: number; max: number };
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Meal source (home_cooked | takeout | restaurant | pre_packaged), or null. */
  source: string | null;
  /** Coarse food tags for the meal->GI analyzer (red_meat, dairy, fried, high_fiber, high_fat). */
  tags: (FoodTag | "high_fat")[];
}

export interface PreWorkoutFuel {
  /** Hours of lookback used. */
  windowHours: number;
  /** Local-formatted workout start time, for echoing back in prompts. */
  workoutStartLocal: string;
  /** Sum across all items overlapping the window. */
  totals: { calories: number; protein: number; carbs: number; fat: number };
  /** Items that overlap the window, oldest first. */
  items: FuelItem[];
  /**
   * Smallest "could have been this recent" gap across all items, in
   * hours. Null when no items overlap. Use this as the headline
   * "last-meal gap" metric.
   */
  lastMealGapHours: number | null;
  /** True if any included item is band-only (i.e. lastMealGapHours is an upper bound, not exact). */
  includesEstimated: boolean;
}

function formatBandHint(mealType: string): string {
  switch (mealType) {
    case "breakfast":
      return "before noon";
    case "lunch":
      return "12-5pm";
    case "dinner":
      return "5pm onward";
    default:
      return "unspecified time of day";
  }
}

function formatLocalDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLocalClock(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function getPreWorkoutFuel(
  workoutStartedAt: Date,
  windowHours = 4,
): Promise<PreWorkoutFuel> {
  const windowStart = new Date(
    workoutStartedAt.getTime() - windowHours * 60 * 60 * 1000,
  );
  // Pre-fetch a generous lookback so that timeUnknown entries from
  // the previous local day can still be considered. 24h beyond the
  // window covers every meal-band on the prior day.
  const fetchStart = new Date(
    workoutStartedAt.getTime() - (windowHours + 24) * 60 * 60 * 1000,
  );
  // Upper bound: end of the workout's local day. We CANNOT filter
  // `eatenAt <= workoutStartedAt` here because timeUnknown entries
  // default to 21:00 of the logged day — a morning workout would
  // then drop a breakfast-band entry that was conceptually before
  // it. The band-overlap check below does the real filtering.
  const fetchEnd = new Date(
    workoutStartedAt.getFullYear(),
    workoutStartedAt.getMonth(),
    workoutStartedAt.getDate() + 1,
    0,
    0,
    0,
    0,
  );

  const entries = await prisma.nutritionEntry.findMany({
    where: { eatenAt: { gte: fetchStart, lt: fetchEnd } },
    orderBy: { eatenAt: "asc" },
  });

  const items: FuelItem[] = [];
  for (const e of entries) {
    // For each entry, compute [earliest, latest] — the absolute-time
    // window in which the meal could have actually happened.
    let earliest: Date;
    let latest: Date;
    if (e.timeUnknown) {
      const y = e.eatenAt.getFullYear();
      const m = e.eatenAt.getMonth();
      const d = e.eatenAt.getDate();
      const band = MEAL_BANDS[e.mealType] ?? MEAL_BANDS.snack;
      earliest = new Date(y, m, d, band[0], 0, 0, 0);
      // [startHour, endHour) — endHour=24 clamps to 23:59:59.999.
      if (band[1] >= 24) {
        latest = new Date(y, m, d, 23, 59, 59, 999);
      } else {
        latest = new Date(y, m, d, band[1], 0, 0, 0);
      }
    } else {
      earliest = e.eatenAt;
      latest = e.eatenAt;
    }

    // Include the entry if its possible-time window overlaps the
    // workout's lookback window: [windowStart, workoutStartedAt].
    if (
      latest.getTime() < windowStart.getTime() ||
      earliest.getTime() > workoutStartedAt.getTime()
    ) {
      continue;
    }

    // Gap-to-workout in hours. Clamp at 0 so a band that extends past
    // the workout start doesn't report a negative "future" gap.
    const minGap = Math.max(
      0,
      (workoutStartedAt.getTime() - latest.getTime()) / (60 * 60 * 1000),
    );
    const maxGap = Math.max(
      0,
      (workoutStartedAt.getTime() - earliest.getTime()) / (60 * 60 * 1000),
    );

    const timeLabel = e.timeUnknown
      ? `${e.mealType} (time unknown — typical: ${formatBandHint(e.mealType)})`
      : formatLocalClock(e.eatenAt);

    items.push({
      description: e.description,
      mealType: e.mealType,
      timeKnown: !e.timeUnknown,
      timeLabel,
      gapHours: {
        min: Math.round(minGap * 10) / 10,
        max: Math.round(maxGap * 10) / 10,
      },
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      source: e.source ?? null,
      // Food-type tags from the name/description, plus a per-item high_fat
      // flag derived from the actual macros (keyword tagging can't see grams).
      tags: [
        ...tagFood(e.foodName, e.description),
        ...(e.fat >= 20 ? (["high_fat"] as const) : []),
      ],
    });
  }

  const totals = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const lastMealGapHours =
    items.length === 0
      ? null
      : Math.round(Math.min(...items.map((i) => i.gapHours.min)) * 10) / 10;

  return {
    windowHours,
    workoutStartLocal: formatLocalDateTime(workoutStartedAt),
    totals: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein),
      carbs: Math.round(totals.carbs),
      fat: Math.round(totals.fat),
    },
    items,
    lastMealGapHours,
    includesEstimated: items.some((i) => !i.timeKnown),
  };
}

/**
 * Plain-text rendering for prompt injection. Compact, model-friendly,
 * preserves the time-band semantics so the analyzer can reason about
 * "the user ate red meat 3-4h before the workout."
 */
export function formatPreWorkoutFuelForPrompt(fuel: PreWorkoutFuel): string {
  if (fuel.items.length === 0) {
    return `Pre-workout fuel (${fuel.windowHours}h window before ${fuel.workoutStartLocal}): NONE LOGGED. Either the workout was fasted or the food wasn't logged — both are possible; don't assume one.`;
  }
  const lines: string[] = [];
  lines.push(
    `Pre-workout fuel (${fuel.windowHours}h window before ${fuel.workoutStartLocal}):`,
  );
  lines.push(
    `- Totals: ${fuel.totals.calories} kcal, ${fuel.totals.protein}g protein, ${fuel.totals.carbs}g carbs, ${fuel.totals.fat}g fat`,
  );
  const gapDesc =
    fuel.lastMealGapHours == null
      ? "n/a"
      : fuel.includesEstimated
        ? `${fuel.lastMealGapHours}h or more (band-estimated)`
        : `${fuel.lastMealGapHours}h`;
  lines.push(`- Shortest possible last-meal gap: ${gapDesc}`);
  lines.push("- Items (oldest first):");
  for (const i of fuel.items) {
    const gap =
      i.gapHours.min === i.gapHours.max
        ? `${i.gapHours.min}h before workout`
        : `${i.gapHours.min}-${i.gapHours.max}h before workout`;
    const macros: string[] = [];
    if (i.protein > 0) macros.push(`${Math.round(i.protein)}g P`);
    if (i.carbs > 0) macros.push(`${Math.round(i.carbs)}g C`);
    if (i.fat > 0) macros.push(`${Math.round(i.fat)}g F`);
    lines.push(
      `  · ${i.timeLabel} (${gap}) — ${i.description} — ${Math.round(i.calories)} kcal${macros.length ? ` (${macros.join(", ")})` : ""}`,
    );
  }
  return lines.join("\n");
}
