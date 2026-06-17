/**
 * Coarse food tagger — maps a food name / description to a small set of
 * categorical tags the meal->GI analyzer tests as factors (see
 * docs/meal-gi-analyzer-spec.md, "Two small input additions").
 *
 * Keyword table, v1. Deliberately coarse and recall-leaning: a tag only
 * makes a food eligible as a factor in the 2x2, and the Fisher's-exact test
 * downstream is what decides if it actually tracks with GI failures. False
 * positives here just add a candidate factor; they don't manufacture a result.
 *
 * `high_fat` is intentionally NOT keyword-based — it's derived from the item's
 * actual fat grams in pre-workout-fuel.ts, where the macros are known.
 */

export type FoodTag = "red_meat" | "dairy" | "fried" | "high_fiber" | "high_fat";

const KEYWORDS: Record<Exclude<FoodTag, "high_fat">, string[]> = {
  red_meat: [
    "steak", "beef", "ground beef", "burger", "hamburger", "ribeye",
    "sirloin", "filet", "lamb", "pork", "bacon", "sausage", "ham",
    "venison", "bison", "brisket", "meatball", "mince",
  ],
  dairy: [
    "milk", "cheese", "yogurt", "yoghurt", "cream", "butter", "ice cream",
    "latte", "cappuccino", "whey", "cottage cheese", "kefir", "custard",
  ],
  fried: [
    "fried", "fry", "fries", "tempura", "katsu", "schnitzel", "nugget",
    "wings", "crispy", "deep-fried", "deep fried", "chips", "fritter",
  ],
  high_fiber: [
    "bean", "beans", "lentil", "chickpea", "broccoli", "kale", "spinach",
    "oats", "oatmeal", "bran", "whole grain", "whole wheat", "brown rice",
    "quinoa", "berries", "apple", "pear", "avocado", "chia", "flax",
    "cabbage", "brussels", "popcorn",
  ],
};

/**
 * Returns the set of coarse tags for a food item. `description` and
 * `foodName` are both checked (description is the user's raw text, foodName
 * the normalized USDA match — either may carry the signal).
 */
export function tagFood(foodName: string | null, description: string | null): FoodTag[] {
  const hay = `${foodName ?? ""} ${description ?? ""}`.toLowerCase();
  const tags: FoodTag[] = [];
  for (const [tag, words] of Object.entries(KEYWORDS) as [
    Exclude<FoodTag, "high_fat">,
    string[],
  ][]) {
    if (words.some((w) => hay.includes(w))) tags.push(tag);
  }
  return tags;
}
