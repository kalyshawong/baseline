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
}

export async function estimateMacros(rawInput: string): Promise<MacroEstimate[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set — add it to .env");
  }
  const message = await withAnthropicRetry(
    () =>
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Parse this food description and estimate the macronutrient breakdown for each item. Return ONLY a JSON array, no other text.

Food: ${rawInput}

For each item return:
{
  "description": "original text for this item",
  "foodName": "normalized food name",
  "quantity": number,
  "unit": "g" | "oz" | "cup" | "serving" | etc,
  "calories": number (kcal),
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams)
}

Use standard USDA nutritional values. Be accurate with portion sizes — "1 cup rice" means ~200g cooked white rice, "3 eggs" means 3 large eggs (~150g total, ~50g each). Round to 1 decimal place for macros, whole numbers for calories.`,
          },
        ],
      }),
    { label: "estimateMacros" }
  );

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

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
    }));
  } catch (e) {
    console.error("Failed to parse JSON from Claude:", e, text);
    return [];
  }
}
