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
  /** What the estimator assumed for this item (shown on the confirm step). */
  note?: string;
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

/** Something the estimator wasn't sure about, with the answer it assumed. */
export interface MealQuestion {
  question: string;
  options: string[];
  /** The option the returned items already assume. */
  assumed: string;
}

export interface MealEstimate {
  items: MacroEstimate[];
  questions: MealQuestion[];
}

/** Items only — for callers that log without a confirm step (Expo import). */
export async function estimateMacros(
  rawInput: string,
  recipes: RecipeContext[] = [],
): Promise<MacroEstimate[]> {
  return (await estimateMeal(rawInput, recipes)).items;
}

/**
 * Tier 1 of food logging (2026-10-21): turn a free-text description — often
 * a home-cooked batch ("marinade for 6 fillets: 1/4 cup mirin… ate one") —
 * into items she eats, each with a plain note of what was assumed, plus at
 * most two questions where her answer would move the total a lot. Nothing is
 * saved here; tier 2 is her confirming (or answering) in the log UI.
 */
export async function estimateMeal(
  rawInput: string,
  recipes: RecipeContext[] = [],
  answers: { question: string; answer: string }[] = [],
): Promise<MealEstimate> {
  // Her saved recipes, so a variant ("coffee with 1 tbsp honey") starts from
  // her real ingredients rather than a generic guess.
  const recipeBlock = recipes.length
    ? `\n\nThe user has these saved recipes. If the food mentions one by name, expand it into its ingredients using these values, applying any changes the user states (e.g. a different amount of one ingredient):\n${recipes
        .map((r) => `- "${r.name}": ${JSON.stringify(r.items.map(({ description, quantity, unit, calories, protein, carbs, fat }) => ({ description, quantity, unit, calories, protein, carbs, fat })))}`)
        .join("\n")}`
    : "";
  const answerBlock = answers.length
    ? `\n\nThe user already answered these — use the answers, and do not ask them again:\n${answers
        .map((a) => `- ${a.question} → ${a.answer}`)
        .join("\n")}`
    : "";
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set — add it to .env");
  }
  const message = await withAnthropicRetry(
    () =>
      client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: `Work out what this person actually ATE from their description and estimate the macros. Return ONLY a JSON object, no other text.

Food: ${rawInput}${recipeBlock}${answerBlock}

Return:
{
  "items": [ ...one object per food eaten... ],
  "questions": [ ...0 to 2 questions... ]
}

Each item:
{
  "description": "short label for what was eaten, e.g. 'Miso cod (1 of 6 fillets)'",
  "foodName": "normalized food name",
  "quantity": number,
  "unit": "g" | "oz" | "cup" | "serving" | "fillet" | etc,
  "calories": number (kcal),
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "note": "what you assumed, under 20 words, e.g. 'Assumed a 6 oz raw fillet; about a third of the marinade stays on the fish.' Empty string if nothing was assumed.",
  "parts": OPTIONAL — include it whenever the item is a share of a batch or uses a marinade/sauce/oil. One entry per ingredient: { "name": "mirin", "amount": "1/4 cup", "calories": kcal for the FULL amount listed, "protein": g, "carbs": g, "fat": g, "share": fraction of that full amount this person ate (0–1) }. E.g. a whole 6 oz fillet they ate → share 1; marinade made for 6 fillets, a third clings → share 1/6 × 0.35 ≈ 0.058. Give USDA values for the full amount — do NOT multiply by share yourself; the item's own calories/protein/carbs/fat are then ignored and computed from parts.
  "canonicalName": "the generic food, lowercase and singular, no brand, no size/grade words, no amounts — e.g. 'egg', 'white bread toast', 'miso cod'. Use the SAME name every time for the same food however it is phrased",
  "canonicalCount": number (the amount in the canonicalUnit),
  "canonicalUnit": "" for things counted whole (eggs, bananas, fillets), else a simple unit: 'slice', 'can', 'cup', 'tbsp', 'g', 'ml', 'serving'
}

Each question:
{
  "question": "short question, e.g. 'How big was the fillet?'",
  "options": ["2 to 4 short answers", "..."],
  "assumed": "the option your items already use (must be one of options)"
}

Rules:
- Count only what THIS person ate. If they cooked a batch or a recipe for several portions and ate some of it ("made marinade for 6 fillets, ate one"), total the whole batch, then scale by their share. Return ONE item for the dish at their share — not the batch, and not separate ingredient items.
- Marinades, brines and cooking liquids are mostly not eaten. Count only what plausibly ends up on the food: a thick marinade like miso that the fish is cooked in ≈ 30–40% of that portion's share; a thin marinade or brine that is drained ≈ 10–20%; a sauce, glaze or dressing poured over and eaten ≈ 100%; deep-fry oil ≈ 10–15% of food weight absorbed; pan oil ≈ half of what was used. Alcohol in cooked sake, wine or mirin mostly cooks off; count its sugars, not its alcohol.
- If an amount isn't given, use a typical portion (cod fillet ≈ 6 oz / 170 g raw, chicken breast ≈ 6 oz raw, "a bowl of rice" ≈ 1.5 cups cooked) and say so in the note.
- Take foods at their word: "cod" is regular cod, not black cod. When a name could reasonably mean foods that differ a lot ("miso cod" is often black cod/sablefish, which is far fattier; "steak" cut; "milk" type), use the literal reading and ask which it was.
- Ask a question ONLY when the realistic range of answers would change the meal's total calories by about 15% or more (portion size of the main protein, how much sauce was eaten, whether oil was used). Never ask about things that barely matter. Never ask something answered above. If nothing is uncertain enough, return "questions": [].
- Return each food ONCE. If the text is a dish made of named ingredients that they ate all of ("egg white omelette with spinach and cheese"), return EITHER one item for the whole dish OR one item per ingredient — NEVER both. Use ingredients when the text gives their amounts and they ate the whole thing; one item for the dish when they ate a share of a batch.
- Use standard USDA values. "1 cup rice" means ~200 g cooked white rice, "3 eggs" means 3 large eggs (~150 g). Round macros to 1 decimal, calories to whole numbers.`,
          },
        ],
      }),
    { label: "estimateMeal" }
  );

  // BUG-C2 fix: aggregate all text blocks rather than assuming index 0 exists
  // and is text. Avoids crashing on empty content arrays or tool_use blocks.
  const text = message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");

  return parseMealResponse(text, rawInput);
}

/** Parses the estimator's reply; tolerant of fencing and of a bare array. */
export function parseMealResponse(text: string, rawInput: string): MealEstimate {
  const obj = text.match(/\{[\s\S]*\}/);
  const arr = text.match(/\[[\s\S]*\]/);
  let rawItems: unknown[] = [];
  let rawQuestions: unknown[] = [];
  try {
    const parsed = JSON.parse((obj && (!arr || obj.index! <= arr.index!) ? obj[0] : arr?.[0]) ?? "");
    if (Array.isArray(parsed)) rawItems = parsed;
    else if (parsed && typeof parsed === "object") {
      rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
    }
  } catch {
    console.error("Failed to parse Claude macro response:", text.slice(0, 200));
    return { items: [], questions: [] };
  }

  const items = dedupeEstimates(
    rawItems.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const item = raw as Record<string, unknown>;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      const description = str(item.description) || rawInput;
      const note = str(item.note);
      // Batch/marinade math done here, not by the model — its own
      // multiplication was off by ~4x on the miso-cod test (2026-10-21).
      let m = { calories: num(item.calories), protein: num(item.protein), carbs: num(item.carbs), fat: num(item.fat) };
      const parts = Array.isArray(item.parts) ? (item.parts as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : [];
      if (parts.length) {
        m = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        for (const part of parts) {
          const share = Math.min(1, num(part.share));
          m.calories += num(part.calories) * share;
          m.protein += num(part.protein) * share;
          m.carbs += num(part.carbs) * share;
          m.fat += num(part.fat) * share;
        }
      }
      return [{
        description,
        foodName: str(item.foodName) || description,
        quantity: num(item.quantity) || 1,
        unit: str(item.unit) || "serving",
        calories: Math.round(m.calories),
        protein: Math.round(m.protein * 10) / 10,
        carbs: Math.round(m.carbs * 10) / 10,
        fat: Math.round(m.fat * 10) / 10,
        canonical: canonicalKey(item.canonicalName, item.canonicalCount, item.canonicalUnit),
        ...(note ? { note } : {}),
      }];
    }),
  );

  const questions = rawQuestions
    .flatMap((raw): MealQuestion[] => {
      if (!raw || typeof raw !== "object") return [];
      const q = raw as Record<string, unknown>;
      const question = typeof q.question === "string" ? q.question.trim() : "";
      const options = Array.isArray(q.options)
        ? q.options.filter((o): o is string => typeof o === "string" && !!o.trim()).map((o) => o.trim()).slice(0, 4)
        : [];
      if (!question || options.length < 2) return [];
      const assumed = typeof q.assumed === "string" && options.includes(q.assumed.trim()) ? q.assumed.trim() : options[0];
      return [{ question, options, assumed }];
    })
    .slice(0, 2);

  return { items, questions };
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
