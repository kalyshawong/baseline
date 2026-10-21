/**
 * Client-safe helpers so the Quick Tag chips show what /api/tags will log
 * (see findTagRecipe in recipes.ts — keep the two in step).
 */
export type RecipeChip = { name: string; kcal: number };

/** kcal a tag will log: its own recipe, else "coffee" for a plain "caffeine" tag. */
export function tagKcal(recipes: RecipeChip[], tag: string, _category?: string): number | undefined {
  const t = tag.trim().toLowerCase();
  const own = recipes.find((r) => r.name === t)?.kcal;
  if (own != null) return own;
  if (t === "caffeine") return recipes.find((r) => r.name === "coffee")?.kcal;
  return undefined;
}

/** Caffeine chips also offer her saved coffee variants ("coffee + 130ml oat milk"). */
export function presetTags(category: string, base: string[], recipes: RecipeChip[]): string[] {
  if (category !== "caffeine") return base;
  const extra = recipes.map((r) => r.name).filter((n) => n.startsWith("coffee") && !base.includes(n));
  const i = base.indexOf("coffee");
  return i < 0 ? [...extra, ...base] : [...base.slice(0, i + 1), ...extra, ...base.slice(i + 1)];
}
