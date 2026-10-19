/**
 * USDA FoodData Central (2026-10-19) — the only source the coach may use for
 * a food's nutrients in a plan. Values come straight from FDC: per 100 g
 * (or 100 ml for branded drinks), plus the label serving for branded foods.
 *
 * Key: FDC_API_KEY (free at api.data.gov). Falls back to DEMO_KEY, which is
 * limited to 30 requests/hour per IP — set a real key in Vercel.
 */

const BASE = "https://api.nal.usda.gov/fdc/v1";
const key = () => process.env.FDC_API_KEY || "DEMO_KEY";

export interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string; // Foundation | SR Legacy | Survey (FNDDS) | Branded
  brand: string | null;
  /** Nutrients per 100 g (or 100 ml). */
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  /** Label serving for branded foods, e.g. 414 ml "1 Bottle". */
  serving: { size: number; unit: string; text: string | null } | null;
  url: string;
}

const NUM = { kcal: "208", protein: "203", fat: "204", carbs: "205" } as const;

type RawNutrient = { nutrientNumber?: string; number?: string; value?: number; amount?: number; nutrient?: { number?: string } };
type RawFood = {
  fdcId: number; description: string; dataType: string; brandOwner?: string; brandName?: string;
  servingSize?: number; servingSizeUnit?: string; householdServingFullText?: string;
  foodNutrients?: RawNutrient[];
};

function nutrient(list: RawNutrient[] | undefined, num: string): number {
  const n = (list ?? []).find((x) => (x.nutrientNumber ?? x.number ?? x.nutrient?.number) === num);
  return Math.round(((n?.value ?? n?.amount ?? 0) as number) * 100) / 100;
}

function toFood(f: RawFood): FdcFood {
  return {
    fdcId: f.fdcId,
    description: f.description,
    dataType: f.dataType,
    brand: f.brandName ?? f.brandOwner ?? null,
    per100: {
      kcal: nutrient(f.foodNutrients, NUM.kcal),
      protein: nutrient(f.foodNutrients, NUM.protein),
      carbs: nutrient(f.foodNutrients, NUM.carbs),
      fat: nutrient(f.foodNutrients, NUM.fat),
    },
    serving: f.servingSize ? { size: f.servingSize, unit: ({ mlt: "ml", grm: "g" } as Record<string, string>)[(f.servingSizeUnit ?? "g").toLowerCase()] ?? (f.servingSizeUnit ?? "g").toLowerCase(), text: f.householdServingFullText ?? null } : null,
    url: `https://fdc.nal.usda.gov/food-details/${f.fdcId}/nutrients`,
  };
}

const cache = new Map<number, FdcFood>();

/** DEMO_KEY runs out after a handful of calls and then answers 400/429. */
function fdcError(res: Response): string {
  const out = res.headers.get("x-ratelimit-remaining") === "0" || res.status === 429;
  if (out || !process.env.FDC_API_KEY) {
    return "USDA food lookup is unavailable right now (rate limit" + (process.env.FDC_API_KEY ? "" : "; no FDC_API_KEY set, so it's using the shared DEMO_KEY") + "). Food nutrients can't be looked up until it resets.";
  }
  return `USDA FoodData Central request failed (${res.status}).`;
}

export async function searchFoods(query: string, opts?: { branded?: boolean }): Promise<FdcFood[]> {
  const dataType = opts?.branded ? "Branded" : "Foundation,SR Legacy,Survey (FNDDS)";
  const url = `${BASE}/foods/search?api_key=${key()}&query=${encodeURIComponent(query)}&pageSize=5&dataType=${encodeURIComponent(dataType)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(fdcError(res));
  const data = (await res.json()) as { foods?: RawFood[] };
  const foods = (data.foods ?? []).map(toFood).filter((f) => f.per100.kcal > 0 || f.per100.protein > 0);
  for (const f of foods) cache.set(f.fdcId, f);
  return foods;
}

export async function getFood(fdcId: number): Promise<FdcFood> {
  const hit = cache.get(fdcId);
  if (hit) return hit;
  const res = await fetch(`${BASE}/food/${fdcId}?api_key=${key()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 404 ? `USDA FoodData Central has no food ${fdcId}.` : fdcError(res));
  const f = toFood((await res.json()) as RawFood);
  cache.set(fdcId, f);
  return f;
}
