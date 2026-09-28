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
    return parsed.map((item) => ({
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
    }));
  } catch (e) {
    console.error("Failed to parse JSON from Claude:", e, text);
    return [];
  }
}
