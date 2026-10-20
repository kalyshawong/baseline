import Anthropic from "@anthropic-ai/sdk";
import { withAnthropicRetry } from "./anthropic-retry";

const client = new Anthropic();

export interface MacroEstimate {
  description: string;
  foodName: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** "name|count|unit" — generic identity for spotting repeat meals. */
  canonical?: string;
}

/**
 * Builds the canonical key from the estimator's generic-identity fields:
 * lowercase singular name, count in natural units, unit ("" for countable
 * things like eggs). Same food + same amount → same key, however she typed it
 * ("three eggs" / "3 eggs" / "eggs x3").
 */
export function canonicalKey(name: unknown, count: unknown, unit: unknown): string | undefined {
  if (typeof name !== "string" || !name.trim()) return undefined;
  const n = name.trim().toLowerCase().replace(/\s+/g, " ");
  const c = typeof count === "number" && Number.isFinite(count) ? Math.round(count * 100) / 100 : 1;
  const u = typeof unit === "string" ? unit.trim().toLowerCase() : "";
  return `${n}|${c}|${u}`;
}

/** A saved recipe as the estimator sees it: name + its fixed items. */
export interface RecipeContext {
  name: string;
  items: MacroEstimate[];
}

export async function estimateMacros(
  rawInput: string,
  recipes: RecipeContext[] = [],
): Promise<MacroEstimate[]> {
  // Her saved recipes, so a variant ("coffee with 1 tbsp honey") starts from
  // her real ingredients rather than a generic guess.
  const recipeBlock = recipes.length
    ? `\n\nThe user has these saved recipes. If the food mentions one by name, expand it into its ingredients using these values, applying any changes the user states (e.g. a different amount of one ingredient):\n${recipes
        .map((r) => `- "${r.name}": ${JSON.stringify(r.items.map(({ description, quantity, unit, calories, protein, carbs, fat }) => ({ description, quantity, unit, calories, protein, carbs, fat })))}`)
        .join("\n")}`
    : "";
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set — add it to .env");
  }
  const message = await withAnthropicRetry(
    () =>
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: `Parse this food description and estimate the macronutrient breakdown for each item. Return ONLY a JSON array, no other text.

Food: ${rawInput}${recipeBlock}

For each item return:
{
  "description": "original text for this item",
  "foodName": "normalized food name",
  "quantity": number,
  "unit": "g" | "oz" | "cup" | "serving" | etc,
  "calories": number (kcal),
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "canonicalName": "the generic food, lowercase and singular, no brand, no size/grade words, no amounts — e.g. 'egg', 'white bread toast', 'canned salmon', 'oat milk'. Use the SAME name every time for the same food however it is phrased",
  "canonicalCount": number (the amount in the canonicalUnit, e.g. 3 for three eggs, 1 for a slice of toast),
  "canonicalUnit": "" for things counted whole (eggs, bananas), else a simple unit: 'slice', 'can', 'cup', 'tbsp', 'g', 'ml', 'serving'
}

Return each food ONCE. If the text is a dish made of named ingredients ("egg white omelette with spinach and cheese", "avocado turkey toast"), return EITHER one item for the whole dish OR one item per ingredient — NEVER both, or the meal is counted twice. Use ingredients when the text gives their amounts, otherwise one item for the dish. Never repeat the same item.
Use standard USDA nutritional values. Be accurate with portion sizes — "1 cup rice" means ~200g cooked white rice, "3 eggs" means 3 large eggs (~150g total, ~50g each). Round to 1 decimal place for macros, whole numbers for calories.`,
          },
        ],
      }),
    { label: "estimateMacros" }
  );

  // BUG-C2 fix: aggregate all text blocks rather than assuming index 0 exists
  // and is text. Avoids crashing on empty content arrays or tool_use blocks.
  const text = message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");

  // Extract JSON array from response (handle potential markdown fencing)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("Failed to parse Claude response:", text);
    return [];
  }

  try {
    let parsed: MacroEstimate[];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse Claude macro response:", jsonMatch[0].slice(0, 200));
      return [];
    }
    return dedupeEstimates(parsed.map((item) => ({
      description: item.description || rawInput,
      foodName: item.foodName || item.description,
      quantity: item.quantity || 1,
      unit: item.unit || "serving",
      calories: Math.round(item.calories || 0),
      protein: Math.round((item.protein || 0) * 10) / 10,
      carbs: Math.round((item.carbs || 0) * 10) / 10,
      fat: Math.round((item.fat || 0) * 10) / 10,
      canonical: canonicalKey(
        (item as unknown as Record<string, unknown>).canonicalName,
        (item as unknown as Record<string, unknown>).canonicalCount,
        (item as unknown as Record<string, unknown>).canonicalUnit,
      ),
    })));
  } catch (e) {
    console.error("Failed to parse JSON from Claude:", e, text);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Duplicate guard (2026-10-19)
// ---------------------------------------------------------------------------

const STOP = new Set(["with", "and", "the", "of", "a", "an", "in", "on", "from", "large", "small", "medium", "slice", "piece", "cup", "approx", "about", "cooked", "raw"]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/**
 * The estimator sometimes returns a dish AND its ingredients for one input
 * ("Egg white omelette with spinach, mushroom and white cheese" → the
 * omelette + egg whites + spinach + mushroom + cheese), or the same item
 * twice, so one meal is counted twice. Drops:
 *  - exact repeats (same description, food and macros);
 *  - a "whole dish" item when 2+ other items are named inside it and some
 *    of them add up to 60–140% of its calories (the ingredients are kept —
 *    they carry the amounts).
 */
export function dedupeEstimates(items: MacroEstimate[]): MacroEstimate[] {
  const seen = new Set<string>();
  let out = items.filter((i) => {
    const k = `${i.description}|${i.foodName}|${i.calories}|${i.protein}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const drop = new Set<MacroEstimate>();
  for (const dish of out) {
    if (dish.calories <= 0) continue;
    const dishWords = new Set([...words(dish.foodName), ...words(dish.description)]);
    const parts = out.filter((o) => {
      if (o === dish || drop.has(o)) return false;
      const w = words(o.foodName);
      return w.length > 0 && w.every((x) => dishWords.has(x));
    });
    if (parts.length < 2 || parts.length > 10) continue;
    // Any subset of 2+ named parts that adds up to roughly the dish.
    let match = false;
    for (let mask = 1; mask < 1 << parts.length && !match; mask++) {
      const sub = parts.filter((_, i) => mask & (1 << i));
      if (sub.length < 2) continue;
      const kcal = sub.reduce((t, p) => t + p.calories, 0);
      if (kcal >= dish.calories * 0.6 && kcal <= dish.calories * 1.4) match = true;
    }
    if (match) drop.add(dish);
  }
  if (drop.size) out = out.filter((i) => !drop.has(i));
  return out;
}
