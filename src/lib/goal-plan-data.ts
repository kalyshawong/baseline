import { prisma } from "@/lib/db";
import { totalDailyEnergyExpenditure, basalMetabolicRate } from "@/lib/tdee";
import type { CitationId } from "@/lib/citations";
import {
  buildGoalPlan,
  type FoodItem,
  type GoalPlan,
  type LoggedMeal,
  type PlanInputs,
  type Sex,
} from "@/lib/goal-plan";

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

export async function loadPlanInputs(goalId: string, today = new Date()): Promise<PlanInputs | null> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) return null;

  const [profile, user, weights, activity, workouts, entries] = await Promise.all([
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
    if (kcal) formulaTdee = { kcal, label: bmr ? label : "rough weight-based estimate (add height, age and sex for better)", cite };
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
  };
}

export async function getGoalPlan(goalId: string): Promise<GoalPlan | null> {
  const inputs = await loadPlanInputs(goalId);
  return inputs ? buildGoalPlan(inputs) : null;
}
