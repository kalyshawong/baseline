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
