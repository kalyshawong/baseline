import { prisma } from "@/lib/db";
import { totalDailyEnergyExpenditure, basalMetabolicRate } from "@/lib/tdee";
import type { CitationId } from "@/lib/citations";
import {
  buildGoalPlan,
  type FoodItem,
  type GoalPlan,
  type LoggedMeal,
  type PlanAdjustments,
  type PlanFood,
  type PlanInputs,
  type Sex,
} from "@/lib/goal-plan";
import { personalBurnFrom, SESSION_TYPES, type SessionType } from "@/lib/exercise-burn";
import { getFood } from "@/lib/fdc";

/**
 * Server side of the goal plan: gathers the current user's inputs and runs
 * the pure engine. Every query is tenant-scoped by lib/db.
 */

const DAY_MS = 86_400_000;

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Reads her intake JSON for sex when the profile row has none. */
function sexFromIntake(raw: string | null | undefined): Sex | null {
  if (!raw) return null;
  try {
    const v = (JSON.parse(raw) as { sex?: unknown }).sex;
    return v === "female" || v === "male" ? v : null;
  } catch {
    return null;
  }
}

export async function loadPlanInputs(
  goalId: string,
  today = new Date(),
  adjustments: PlanAdjustments | null = null,
): Promise<PlanInputs | null> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) return null;

  const [profile, user, weights, activity, workouts, entries, burnHistory] = await Promise.all([
    prisma.userProfile.findFirst(),
    prisma.user.findUnique({ where: { id: goal.userId }, select: { intake: true } }),
    prisma.weightLog.findMany({ orderBy: { day: "desc" }, take: 60, select: { day: true, weightKg: true, bodyFatPct: true, leanMassKg: true } }),
    prisma.dailyActivity.findMany({
      where: { day: { gte: new Date(today.getTime() - 90 * DAY_MS) }, totalCalories: { gt: 0 } },
      orderBy: { day: "desc" },
      take: 28,
      select: { day: true, totalCalories: true },
    }),
    prisma.healthKitWorkout.findMany({
      where: { startedAt: { gte: new Date(today.getTime() - 28 * DAY_MS) } },
      select: { startedAt: true, durationSeconds: true, activeCalories: true },
    }),
    prisma.nutritionEntry.findMany({
      where: { eatenAt: { gte: new Date(today.getTime() - 120 * DAY_MS) } },
      select: { nutritionLogId: true, mealType: true, foodName: true, canonical: true, calories: true, protein: true, carbs: true, fat: true },
    }),
    prisma.healthKitWorkout.findMany({
      where: { startedAt: { gte: new Date(today.getTime() - 180 * DAY_MS) } },
      select: { name: true, durationSeconds: true, activeCalories: true },
    }),
  ]);

  const sex: Sex | null =
    profile?.sex === "female" || profile?.sex === "male" ? profile.sex : sexFromIntake(user?.intake);

  const latestW = weights[0] ?? null;
  const latestBf = weights.find((w) => w.bodyFatPct != null && w.bodyFatPct > 0) ?? null;
  const weightKg = latestW?.weightKg ?? profile?.bodyWeightKg ?? null;
  const bodyFatPct = latestBf?.bodyFatPct ?? profile?.bodyFatPct ?? null;
  const leanMassKg = latestW?.leanMassKg ?? null;
  const ffm = leanMassKg ?? (weightKg != null && bodyFatPct != null ? weightKg * (1 - bodyFatPct / 100) : null);

  // ---- TDEE: her wearable's measured total burn first ----
  const measuredTdee =
    activity.length >= 7
      ? {
          kcal: activity.reduce((s, a) => s + (a.totalCalories ?? 0), 0) / activity.length,
          days: activity.length,
          lastDay: activity[0].day,
          source: "Oura",
        }
      : null;

  let formulaTdee: PlanInputs["formulaTdee"] = null;
  if (weightKg != null && profile) {
    let bmr: number | null = profile.bmrKcal ?? null;
    let label = "measured BMR × activity level";
    let cite: CitationId[] = [];
    if (!bmr && profile.heightCm && profile.age && profile.sex) {
      bmr = basalMetabolicRate(weightKg, profile.heightCm, profile.age, profile.sex);
      label = "Mifflin-St Jeor BMR × activity level";
      cite = ["mifflin1990"];
    } else if (!bmr && ffm != null) {
      bmr = 500 + 22 * ffm;
      label = "lean-mass BMR × activity level";
      cite = ["cunningham1980"];
    }
    const kcal = totalDailyEnergyExpenditure({
      weightKg,
      heightCm: profile.heightCm,
      age: profile.age,
      sex: profile.sex,
      activityLevel: profile.activityLevel,
      goal: profile.goal,
      targetWeightKg: profile.targetWeightKg,
      bmrKcal: bmr ? Math.round(bmr) : null,
    });
    if (kcal) formulaTdee = { kcal, label: bmr ? label : "rough weight-based estimate (add height, age and sex for better)", cite, bmr: bmr ? Math.round(bmr) : null };
  }

  // ---- Training, last 28 days of watch workouts ----
  const training = workouts.length
    ? {
        kcalPerDay: workouts.reduce((s, w) => s + (w.activeCalories ?? 0), 0) / 28,
        sessionsPerWeek: workouts.length / 4,
        avgSessionMin: workouts.reduce((s, w) => s + (w.durationSeconds ?? 0), 0) / 60 / workouts.length,
      }
    : null;

  // ---- Her meals: same items in the same meal on a day = one meal ----
  const byMeal = new Map<string, typeof entries>();
  for (const e of entries) {
    const k = `${e.nutritionLogId}|${e.mealType}`;
    const arr = byMeal.get(k) ?? [];
    arr.push(e);
    byMeal.set(k, arr);
  }
  const loggedDays = new Set(entries.map((e) => e.nutritionLogId));
  const mealsPerDayCounts = new Map<string, number>();
  type Agg = { label: string; mealType: string; n: number; days: Set<string>; items: Map<string, FoodItem & { n: number }>; kcal: number; protein: number; carbs: number; fat: number };
  const agg = new Map<string, Agg>();
  for (const [k, items] of byMeal) {
    const [logId, mealType] = k.split("|");
    if (mealType !== "snack") mealsPerDayCounts.set(logId, (mealsPerDayCounts.get(logId) ?? 0) + 1);
    const ids = items.map((i) => (i.canonical ?? i.foodName).toLowerCase().trim()).sort();
    const key = `${mealType}::${ids.join(" + ")}`;
    const a = agg.get(key) ?? {
      label: items.map((i) => i.foodName).join(" + "),
      mealType,
      n: 0,
      days: new Set<string>(),
      items: new Map(),
      kcal: 0, protein: 0, carbs: 0, fat: 0,
    };
    a.n += 1;
    a.days.add(logId);
    for (const i of items) {
      a.kcal += i.calories; a.protein += i.protein; a.carbs += i.carbs; a.fat += i.fat;
      const id = (i.canonical ?? i.foodName).toLowerCase().trim();
      const it = a.items.get(id) ?? { name: i.foodName, kcal: 0, protein: 0, carbs: 0, fat: 0, n: 0 };
      it.kcal += i.calories; it.protein += i.protein; it.carbs += i.carbs; it.fat += i.fat; it.n += 1;
      a.items.set(id, it);
    }
    agg.set(key, a);
  }
  const nDays = Math.max(1, loggedDays.size);
  const meals: LoggedMeal[] = [...agg.entries()].map(([key, a]) => ({
    key,
    label: titleCase(a.label),
    mealType: a.mealType,
    items: [...a.items.values()].map((i) => ({ name: i.name, kcal: i.kcal / i.n, protein: i.protein / i.n, carbs: i.carbs / i.n, fat: i.fat / i.n })),
    kcal: a.kcal / a.n,
    protein: a.protein / a.n,
    carbs: a.carbs / a.n,
    fat: a.fat / a.n,
    // Distinct days, so a meal logged twice on one day counts once.
    timesEaten: a.days.size,
    dayShare: a.days.size / nDays,
  }));

  // ---- Single items she logs often (≥2×) ----
  const itemAgg = new Map<string, FoodItem & { timesEaten: number }>();
  for (const e of entries) {
    const id = (e.canonical ?? e.foodName).toLowerCase().trim();
    const it = itemAgg.get(id) ?? { name: titleCase(e.foodName), kcal: 0, protein: 0, carbs: 0, fat: 0, timesEaten: 0 };
    it.kcal += e.calories; it.protein += e.protein; it.carbs += e.carbs; it.fat += e.fat; it.timesEaten += 1;
    itemAgg.set(id, it);
  }
  const staples = [...itemAgg.values()]
    .filter((i) => i.timesEaten >= 2)
    .map((i) => ({ ...i, kcal: i.kcal / i.timesEaten, protein: i.protein / i.timesEaten, carbs: i.carbs / i.timesEaten, fat: i.fat / i.timesEaten }));

  const counts = [...mealsPerDayCounts.values()].sort((a, b) => a - b);
  const mealsPerDay = counts.length ? counts[Math.floor(counts.length / 2)] : null;

  return {
    goal: { id: goal.id, title: goal.title, type: goal.type, subtype: goal.subtype, target: goal.target, deadline: goal.deadline },
    today,
    sex,
    weightKg,
    weightDay: latestW?.day ?? null,
    bodyFatPct,
    bodyFatDay: latestBf?.day ?? null,
    leanMassKg,
    heightCm: profile?.heightCm ?? null,
    measuredTdee,
    formulaTdee,
    training,
    meals,
    staples,
    mealsPerDay,
    loggedDays: loggedDays.size,
    personalBurn: personalBurnFrom(burnHistory),
    adjustments,
  };
}

// ---------------------------------------------------------------------------
// Saved plans + adjustments (coach, 2026-10-19)
// ---------------------------------------------------------------------------

export interface SavedPlanInfo {
  id: string;
  createdAt: Date;
  summary: string | null;
  adjustments: PlanAdjustments;
}

export async function getSavedPlan(goalId: string): Promise<SavedPlanInfo | null> {
  const row = await prisma.savedGoalPlan.findFirst({ where: { goalId }, orderBy: { createdAt: "desc" } });
  if (!row) return null;
  try {
    return { id: row.id, createdAt: row.createdAt, summary: row.summary, adjustments: JSON.parse(row.adjustments) as PlanAdjustments };
  } catch {
    return null;
  }
}

/**
 * The plan for a goal: the saved coach version when there is one (unless
 * `view: "calculated"`), or with ad-hoc `adjustments` (coach previews).
 */
export async function getGoalPlan(
  goalId: string,
  opts: { view?: "saved" | "calculated"; adjustments?: PlanAdjustments | null } = {},
): Promise<GoalPlan | null> {
  const saved = opts.adjustments === undefined && opts.view !== "calculated" ? await getSavedPlan(goalId) : null;
  const adj = opts.adjustments ?? saved?.adjustments ?? null;
  const inputs = await loadPlanInputs(goalId, new Date(), adj);
  return inputs ? buildGoalPlan(inputs) : null;
}

/** Raw adjustments as the coach sends them — foods by FDC id + amount only. */
export interface RawAdjustments {
  sessions?: { type?: unknown; minutes?: unknown; days_per_week?: unknown }[];
  calorie_budget_kcal?: unknown;
  target_body_fat_pct?: unknown;
  deadline?: unknown;
  foods?: { fdc_id?: unknown; grams?: unknown; servings?: unknown; kcal?: unknown }[];
  avoid?: unknown;
  at_floor?: unknown;
}

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;

/**
 * Validates the coach's adjustments and fetches every food's nutrients from
 * USDA FoodData Central on the server, so no nutrient number in a plan ever
 * comes from the model. Returns errors for anything it had to drop.
 */
export async function resolveAdjustments(raw: RawAdjustments): Promise<{ adjustments: PlanAdjustments; errors: string[] }> {
  const errors: string[] = [];
  const adj: PlanAdjustments = {};

  if (Array.isArray(raw.sessions)) {
    adj.sessions = [];
    for (const s of raw.sessions) {
      const type = typeof s?.type === "string" && (SESSION_TYPES as string[]).includes(s.type) ? (s.type as SessionType) : null;
      const minutes = num(s?.minutes, 5, 300);
      if (!type || minutes == null) { errors.push(`Dropped session ${JSON.stringify(s)}: type must be one of ${SESSION_TYPES.join(", ")} and minutes 5–300.`); continue; }
      adj.sessions.push({ type, minutes, daysPerWeek: num(s?.days_per_week, 1, 7) ?? 7 });
    }
  }
  const budget = num(raw.calorie_budget_kcal, 0, 6000);
  if (raw.calorie_budget_kcal != null && budget == null) errors.push("calorie_budget_kcal must be 0–6000.");
  if (budget != null) adj.calorieBudgetKcal = Math.round(budget);
  const bf = num(raw.target_body_fat_pct, 3, 50);
  if (bf != null) adj.targetBodyFatPct = bf;
  if (typeof raw.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline)) adj.deadline = raw.deadline;
  if (raw.at_floor === true) adj.atFloor = true;
  if (Array.isArray(raw.avoid)) adj.avoid = raw.avoid.filter((a): a is string => typeof a === "string" && a.trim().length > 0).slice(0, 20);

  if (Array.isArray(raw.foods) && raw.foods.length) {
    const foods: PlanFood[] = [];
    for (const f of raw.foods.slice(0, 20)) {
      const id = num(f?.fdc_id, 1, 1e9);
      if (id == null) { errors.push(`Dropped food ${JSON.stringify(f)}: needs fdc_id from lookup_food.`); continue; }
      try {
        const food = await getFood(id);
        const unit = food.serving?.unit ?? "g";
        let grams: number | null = null;
        let amountLabel = "";
        const g = num(f.grams, 1, 3000);
        const sv = num(f.servings, 0.1, 20);
        const kc = num(f.kcal, 1, 4000);
        if (g != null) { grams = g; amountLabel = `${Math.round(g)} ${unit === "ml" ? "ml" : "g"}`; }
        else if (sv != null && food.serving) { grams = sv * food.serving.size; amountLabel = `${sv} × ${food.serving.text ?? "serving"} (${Math.round(food.serving.size)} ${unit})`; }
        else if (kc != null && food.per100.kcal > 0) { grams = (kc / food.per100.kcal) * 100; amountLabel = `${Math.round(grams)} ${unit === "ml" ? "ml" : "g"} (~${Math.round(kc)} kcal)`; }
        if (grams == null) { errors.push(`Dropped ${food.description}: give grams, servings (branded only) or kcal.`); continue; }
        foods.push({ fdcId: food.fdcId, description: food.description, dataType: food.dataType, per100: food.per100, grams, amountLabel, url: food.url });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    adj.foods = foods;
  }
  return { adjustments: adj, errors };
}
