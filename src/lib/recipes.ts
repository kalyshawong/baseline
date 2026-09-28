import { prisma } from "@/lib/db";
import type { MacroEstimate } from "@/lib/usda";

/**
 * Saved recipes (SavedRecipe) — named, fixed-macro items like her "coffee".
 *
 * Tagging a recipe's name (e.g. the caffeine quick-tag "coffee") also logs
 * the recipe's calories on that day, so the tag and the intake never
 * disagree (2026-09-28). The created entry ids are stored on the tag's
 * metadata (`recipeEntryIds`) so deleting the tag removes them too.
 */

export async function findRecipeItems(userId: string, name: string): Promise<MacroEstimate[] | null> {
  const recipe = await prisma.savedRecipe.findUnique({
    where: { userId_name: { userId, name: name.trim().toLowerCase() } },
  });
  if (!recipe) return null;
  try {
    return JSON.parse(recipe.items) as MacroEstimate[];
  } catch {
    return null;
  }
}

/** YYYY-MM-DD of an instant as seen in tz. */
function dayStrOf(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Logs a recipe's items as nutrition entries at `eatenAt`; returns their ids. */
export async function logRecipeEntries(opts: {
  userId: string;
  items: MacroEstimate[];
  eatenAt: Date;
  tz: string;
  dayStr?: string;
  timeUnknown?: boolean;
  mealType?: string;
}): Promise<string[]> {
  const { userId, items, eatenAt, tz } = opts;
  const dayStr = opts.dayStr ?? dayStrOf(eatenAt, tz);
  const day = new Date(dayStr + "T00:00:00.000Z");
  const log = await prisma.nutritionLog.upsert({
    where: { userId_day: { userId, day } },
    update: {},
    create: { userId, day, calories: 0, protein: 0, carbs: 0, fat: 0 },
  });
  const ids: string[] = [];
  let cal = 0, prot = 0, carb = 0, fat = 0;
  for (const it of items) {
    const e = await prisma.nutritionEntry.create({
      data: {
        userId,
        nutritionLogId: log.id,
        description: it.description,
        foodName: it.foodName,
        quantity: it.quantity,
        unit: it.unit,
        calories: it.calories,
        protein: it.protein,
        carbs: it.carbs,
        fat: it.fat,
        canonical: it.canonical ?? null,
        mealType: opts.mealType ?? "snack",
        eatenAt: opts.eatenAt,
        timeUnknown: opts.timeUnknown === true,
      },
    });
    ids.push(e.id);
    cal += it.calories; prot += it.protein; carb += it.carbs; fat += it.fat;
  }
  await prisma.nutritionLog.update({
    where: { id: log.id },
    data: { calories: { increment: cal }, protein: { increment: prot }, carbs: { increment: carb }, fat: { increment: fat } },
  });
  return ids;
}

/** Removes entries a tag created (skips any already deleted by hand). */
export async function removeRecipeEntries(userId: string, ids: string[]): Promise<void> {
  const entries = await prisma.nutritionEntry.findMany({ where: { userId, id: { in: ids } } });
  for (const e of entries) {
    await prisma.nutritionEntry.delete({ where: { id: e.id } });
    await prisma.nutritionLog.update({
      where: { id: e.nutritionLogId },
      data: { calories: { decrement: e.calories }, protein: { decrement: e.protein }, carbs: { decrement: e.carbs }, fat: { decrement: e.fat } },
    });
  }
}

// ---------------------------------------------------------------------------
// Auto-saved recipes (2026-09-28): "when you see i consistently put in a
// recipe, e.g. 1 piece of white toast and three eggs, save that as a recipe."
//
// A meal = the entries sharing one day's log, meal type and eaten time. Its
// key = its items' canonical keys (see usda.ts canonicalKey), deduped and
// sorted, so "three eggs + a piece of toast" and "toast, 3 eggs" match.
// Seen on AUTO_SAVE_MIN_DAYS different days → saved once (autoKey guards
// against saving it again).
// ---------------------------------------------------------------------------

export const AUTO_SAVE_MIN_DAYS = 3;
const LOOKBACK_DAYS = 180;

type EntryRow = {
  nutritionLogId: string;
  mealType: string;
  eatenAt: Date;
  canonical: string | null;
  description: string;
  foodName: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

function groupMeals(rows: EntryRow[]): Map<string, EntryRow[]> {
  const meals = new Map<string, EntryRow[]>();
  for (const r of rows) {
    const g = `${r.nutritionLogId}|${r.mealType}|${r.eatenAt.getTime()}`;
    const list = meals.get(g) ?? [];
    // One row per canonical item — a double-submitted log shouldn't make
    // "3 eggs" look like "3 eggs + 3 eggs".
    if (!r.canonical || !list.some((x) => x.canonical === r.canonical)) list.push(r);
    meals.set(g, list);
  }
  return meals;
}

function mealKey(items: EntryRow[]): string | null {
  if (items.some((i) => !i.canonical)) return null;
  const keys = items.map((i) => i.canonical as string).sort();
  return keys.length >= 2 ? keys.join(" + ") : null;
}

/** "egg|3|" → "3 eggs"; "white bread toast|1|slice" → "1 slice white bread toast". */
function labelOf(canonical: string): string {
  const [name, count, unit] = canonical.split("|");
  const c = Number(count);
  if (unit) return `${count} ${unit} ${name}`;
  return `${count} ${name}${c !== 1 && !name.endsWith("s") ? "s" : ""}`;
}

/**
 * Scans her recent meals and saves every multi-item meal she has logged on
 * AUTO_SAVE_MIN_DAYS+ different days that isn't saved yet. Returns the names
 * of recipes it created. Cheap (one query); safe to call after every log.
 */
export async function autoSaveRecurringMeals(userId: string): Promise<string[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000);
  const rows = (await prisma.nutritionEntry.findMany({
    where: { userId, eatenAt: { gte: since }, canonical: { not: null } },
    orderBy: { eatenAt: "asc" },
  })) as EntryRow[];

  const byKey = new Map<string, { days: Set<string>; latest: EntryRow[] }>();
  for (const items of groupMeals(rows).values()) {
    const key = mealKey(items);
    if (!key) continue;
    const cur = byKey.get(key) ?? { days: new Set<string>(), latest: items };
    cur.days.add(items[0].nutritionLogId);
    cur.latest = items; // rows are eatenAt-ascending → last one wins
    byKey.set(key, cur);
  }

  const existing = await prisma.savedRecipe.findMany({ where: { userId }, select: { name: true, autoKey: true } });
  const takenKeys = new Set(existing.map((r) => r.autoKey).filter(Boolean));
  const takenNames = new Set(existing.map((r) => r.name));
  const created: string[] = [];

  for (const [key, { days, latest }] of byKey) {
    if (days.size < AUTO_SAVE_MIN_DAYS || takenKeys.has(key)) continue;
    const name = key.split(" + ").map(labelOf).join(" + ");
    if (takenNames.has(name)) continue;
    const items: MacroEstimate[] = latest.map((i) => ({
      description: labelOf(i.canonical as string),
      foodName: i.foodName,
      quantity: i.quantity,
      unit: i.unit,
      calories: i.calories,
      protein: i.protein,
      carbs: i.carbs,
      fat: i.fat,
      canonical: i.canonical as string,
    }));
    await prisma.savedRecipe.create({ data: { userId, name, items: JSON.stringify(items), autoKey: key } });
    takenNames.add(name);
    created.push(name);
  }
  return created;
}
