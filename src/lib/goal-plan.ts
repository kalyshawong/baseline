/**
 * Goal → daily nutrition plan (2026-10-18).
 *
 * Making a physique / weight goal ("visible abs by Nov 30", "100 lb goal
 * weight", "lose 10 lb") produces a plan: daily calories, protein, fat, carbs,
 * water, the date it realistically lands, and a day of eating built from
 * meals she has actually logged.
 *
 * Pure — no DB. The loader (goal-plan-data.ts) gathers the inputs.
 *
 * Rules that shape every number here:
 *  - Her data first. TDEE comes from her Oura total-burn when there are ≥7
 *    recent days; only then from a formula. The menu is built from meals she
 *    has logged; anything not from her log is marked `fromLog: false`.
 *  - Every science number has a source (lib/citations.ts). App defaults that
 *    are not study findings are labelled as defaults in `notes`.
 *  - A set date wins (Kalysha, 2026-10-18): the plan paces to it, and the
 *    1%/wk loss limit (Helms 2014b) and the energy-availability floor of
 *    30 kcal/kg FFM (Loucks 2011, Mountjoy 2023) show as warnings. Without a
 *    date they shape the plan. A date that can't be met even on protein-only
 *    intake falls back to 1%/wk. The body-fat floor near essential fat (ACSM)
 *    always applies.
 */
import type { CitationId } from "@/lib/citations";
import { proteinPerKg } from "@/lib/protein";

// ---------------------------------------------------------------------------
// Constants (each one either cited or called out as an app default)
// ---------------------------------------------------------------------------

/** ~7700 kcal per kg of body-weight change — an approximation (Hall 2008). */
export const KCAL_PER_KG = 7700;
/** Upper end of the 0.5–1%/wk loss range for keeping lean mass (Helms 2014b). */
export const MAX_LOSS_PCT_PER_WK = 1.0;
/** Default when there's no deadline: the slower arm in Garthe 2011 (~0.7%/wk). */
export const DEFAULT_LOSS_PCT_PER_WK = 0.7;
/** Lean-gain pace, ~0.25–0.5% of body weight per week (Iraki 2019). */
export const MAX_GAIN_PCT_PER_WK = 0.5;
export const DEFAULT_GAIN_PCT_PER_WK = 0.25;
/** Energy-availability floor, kcal per kg fat-free mass (Loucks 2011; Mountjoy 2023). */
export const EA_FLOOR_KCAL_PER_KG_FFM = 30;
/**
 * Lowest body fat the app will plan toward. Essential fat is ~10–13% for
 * women and ~2–5% for men (ACSM); these floors leave a margin. App default.
 */
export const BF_FLOOR = { female: 14, male: 6 } as const;
/**
 * "Visible abs" body fat. Rule of thumb, NOT a study finding — no trial
 * defines it. Women's abs commonly show around 16–19%, men's around 10–12%.
 * App default; a "% body fat" in the goal's target overrides it.
 */
export const ABS_BF_DEFAULT = { female: 17, male: 11 } as const;
/** Fat share of calories: middle of 15–30% (Helms 2014b). */
export const FAT_SHARE = 0.25;
/** Drinks: EFSA total-water AI (2.0 L women / 2.5 L men); 20–30% of water comes from food, so drinks ≈ 80% (EFSA 2010). */
export const DRINK_L_BASE = { female: 1.6, male: 2.0 } as const;
/**
 * Extra drink per hour of training. Sweat rates run 0.5–2 L/h (Sawka 2007);
 * 0.75 L/h is an app default — weigh before/after a session to personalize.
 */
export const DRINK_L_PER_TRAINING_HOUR = 0.75;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Sex = "female" | "male";
export type PlanDirection = "lose" | "gain" | "maintain";

export interface PlanGoal {
  id: string;
  title: string;
  type: string;
  subtype: string | null;
  target: string | null;
  deadline: Date | null;
}

export interface FoodItem {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** A meal she has logged (same items, same meal), averaged across repeats. */
export interface LoggedMeal {
  key: string;
  label: string;
  mealType: string; // breakfast | lunch | dinner | snack
  items: FoodItem[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  timesEaten: number;
  /** Share of her logged days this meal shows up on (0–1). */
  dayShare: number;
}

export interface PlanInputs {
  goal: PlanGoal;
  today: Date;
  sex: Sex | null;
  weightKg: number | null;
  weightDay: Date | null;
  bodyFatPct: number | null;
  bodyFatDay: Date | null;
  leanMassKg: number | null;
  heightCm: number | null;
  /** Mean of her wearable's total daily burn. */
  measuredTdee: { kcal: number; days: number; lastDay: Date; source: string } | null;
  /** Formula fallback and what it was built from. */
  formulaTdee: { kcal: number; label: string; cite: CitationId[] } | null;
  /** Averages over the last 28 days of watch workouts. */
  training: { kcalPerDay: number; sessionsPerWeek: number; avgSessionMin: number } | null;
  meals: LoggedMeal[];
  /** Single items she logs often (for protein top-ups). */
  staples: (FoodItem & { timesEaten: number })[];
  /** Median number of non-snack meals on a logged day. */
  mealsPerDay: number | null;
  loggedDays: number;
}

export interface PlanNote {
  level: "info" | "warn";
  text: string;
  cite?: CitationId[];
}

export interface MenuLine {
  slot: string;
  label: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  timesEaten: number;
  fromLog: boolean;
  servings?: number;
}

export interface GoalPlan {
  goalId: string;
  kind: "visible_abs" | "body_fat" | "target_weight" | "lose_amount" | "gain" | "recomp";
  direction: PlanDirection;
  /** Inputs the plan needs but doesn't have; the page asks for these. */
  missing: ("sex" | "weight" | "heightCm")[];
  current: { weightKg: number | null; bodyFatPct: number | null; leanMassKg: number | null };
  target: {
    weightKg: number | null;
    bodyFatPct: number | null;
    changeKg: number | null; // + = lose, − = gain
    source: string;
  };
  pace: {
    neededPctPerWk: number | null;
    plannedPctPerWk: number | null;
    plannedKgPerWk: number | null;
    deadline: Date | null;
    projectedDate: Date | null;
    onTime: boolean | null;
  };
  tdee: { kcal: number; label: string; cite: CitationId[] } | null;
  daily: {
    kcal: number;
    kcalFloor: number | null;
    proteinG: number;
    proteinGPerKg: number;
    fatG: number;
    carbsG: number;
    waterRestL: number;
    waterTrainingL: number;
  } | null;
  menu: { lines: MenuLine[]; totals: FoodItem; fromLogShare: number } | null;
  notes: PlanNote[];
}

// ---------------------------------------------------------------------------
// Parsing the goal text
// ---------------------------------------------------------------------------

const LB_PER_KG = 2.20462;

export function goalText(g: Pick<PlanGoal, "title" | "target">): string {
  return `${g.title} ${g.target ?? ""}`.toLowerCase();
}

export function mentionsAbs(text: string): boolean {
  return /\babs\b|six[\s-]?pack|\bab definition|\bab lines/.test(text);
}

/** "17% body fat", "17 % bf", "bf 17%" → 17. */
export function parseBodyFat(text: string): number | null {
  const m =
    text.match(/(\d{1,2}(?:\.\d)?)\s*%\s*(?:body\s*fat|bf\b)/) ??
    text.match(/(?:body\s*fat|bf)\D{0,12}(\d{1,2}(?:\.\d)?)\s*%/);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 3 && v <= 50 ? v : null;
}

/** First weight in the text, in kg, plus whether it reads as an amount ("lose 10 lb"). */
export function parseWeight(text: string): { kg: number; isAmount: boolean; gain: boolean } | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kgs?|kilos?|kilograms?)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  const kg = /^k/.test(m[2]) ? n : n / LB_PER_KG;
  const before = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0);
  const gain = /\b(gain|add|put on|bulk)\b/.test(before);
  const isAmount = /\b(lose|drop|cut|shed|down|gain|add|put on)\b/.test(before);
  return { kg, isAmount, gain };
}

export function isNutritionGoal(g: Pick<PlanGoal, "type" | "subtype" | "title" | "target">): boolean {
  if (g.type === "physique" || g.type === "weight") return true;
  return mentionsAbs(goalText(g));
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

const round = (v: number, step = 1) => Math.round(v / step) * step;

export function buildGoalPlan(inp: PlanInputs): GoalPlan | null {
  const g = inp.goal;
  if (!isNutritionGoal(g)) return null;

  const notes: PlanNote[] = [];
  const missing: GoalPlan["missing"] = [];
  const text = goalText(g);
  const sex = inp.sex;
  if (!sex) missing.push("sex");
  const w = inp.weightKg;
  if (w == null) missing.push("weight");

  const bf = inp.bodyFatPct;
  const lean = inp.leanMassKg ?? (w != null && bf != null ? w * (1 - bf / 100) : null);

  // ---- What the goal is asking for ----
  const abs = g.subtype === "visible_abs" || mentionsAbs(text);
  const bfExplicit = parseBodyFat(text);
  const wt = parseWeight(text);
  const gainGoal = g.subtype === "bulk" || /\b(bulk|gain|build)\b/.test(text) || (wt?.gain ?? false);

  let kind: GoalPlan["kind"];
  let targetWeight: number | null = null;
  let targetBf: number | null = null;
  let targetSource = "";

  if (bfExplicit != null || abs) {
    kind = abs ? "visible_abs" : "body_fat";
    targetBf = bfExplicit ?? (sex ? ABS_BF_DEFAULT[sex] : null);
    targetSource = bfExplicit != null
      ? `${bfExplicit}% body fat (from your goal)`
      : sex
        ? `${ABS_BF_DEFAULT[sex]}% body fat — where ${sex === "female" ? "women's" : "men's"} abs usually start to show (rule of thumb, not a study number)`
        : "visible-abs body fat (needs your sex)";
    if (targetBf != null && lean != null) targetWeight = lean / (1 - targetBf / 100);
    if (bf == null) {
      notes.push({ level: "warn", text: "No body-fat reading yet, so the plan can't size an abs target. A smart-scale weigh-in (or typing body fat into your profile) fixes this." });
    }
  } else if (wt && !wt.isAmount) {
    kind = "target_weight";
    targetWeight = wt.kg;
    targetSource = `${round(wt.kg * LB_PER_KG)} lb / ${wt.kg.toFixed(1)} kg (from your goal)`;
  } else if (wt && wt.isAmount && w != null) {
    kind = wt.gain || gainGoal ? "gain" : "lose_amount";
    targetWeight = kind === "gain" ? w + wt.kg : w - wt.kg;
    targetSource = `${kind === "gain" ? "gain" : "lose"} ${round(wt.kg * LB_PER_KG)} lb (from your goal)`;
  } else if (gainGoal) {
    kind = "gain";
    targetSource = "lean gain, no number set";
  } else {
    kind = "recomp";
    targetSource = "recomp — hold weight, keep protein high";
  }

  // A second number in the goal that disagrees with the abs target.
  if ((kind === "visible_abs" || kind === "body_fat") && wt && w != null && lean != null && targetWeight != null) {
    const otherTarget = wt.isAmount ? (wt.gain ? w + wt.kg : w - wt.kg) : wt.kg;
    const impliedBf = (1 - lean / otherTarget) * 100;
    if (Math.abs(otherTarget - targetWeight) > 1) {
      notes.push({
        level: "info",
        text: `Your goal has two targets that disagree. "${wt.isAmount ? `${wt.gain ? "gain" : "lose"} ${round(wt.kg * LB_PER_KG)} lb` : `${round(wt.kg * LB_PER_KG)} lb`}" lands at ${round(otherTarget * LB_PER_KG)} lb, which is about ${impliedBf.toFixed(1)}% body fat if every pound is fat. The abs target needs ${round(targetWeight * LB_PER_KG)} lb. The plan follows the abs target.`,
      });
    }
  }

  // ---- Safety floor on the target ----
  if (targetWeight != null && sex && lean != null) {
    const impliedBf = (1 - lean / targetWeight) * 100;
    if (impliedBf < BF_FLOOR[sex]) {
      const floorWeight = lean / (1 - BF_FLOOR[sex] / 100);
      notes.push({
        level: "warn",
        text: `${round(targetWeight * LB_PER_KG)} lb ${impliedBf <= 0 ? "is less than your lean mass alone (muscle, bone, organs)" : `would put you near ${impliedBf.toFixed(1)}% body fat even if you kept every bit of muscle`} — below the ${BF_FLOOR[sex]}% floor the app plans to (essential fat is ~${sex === "female" ? "10–13" : "2–5"}%). The plan stops at ${round(floorWeight * LB_PER_KG)} lb.`,
        cite: ["acsm2021"],
      });
      targetWeight = floorWeight;
      targetBf = BF_FLOOR[sex];
    } else if (targetBf == null) {
      targetBf = impliedBf;
    }
  } else if (targetWeight != null && lean == null && inp.heightCm) {
    const bmi = targetWeight / (inp.heightCm / 100) ** 2;
    if (bmi < 18.5) {
      notes.push({ level: "warn", text: `That target is a BMI of ${round(bmi, 0.1)}, under 18.5. Without a body-fat reading the plan can't check it further.` });
    }
  }

  const changeKg = w != null && targetWeight != null ? w - targetWeight : null;
  const direction: PlanDirection =
    kind === "gain" ? "gain" : kind === "recomp" ? "maintain" : changeKg != null && changeKg > 0.2 ? "lose" : "maintain";
  if (direction === "maintain" && changeKg != null && changeKg <= 0.2 && kind !== "recomp" && kind !== "gain") {
    notes.push({ level: "info", text: "Your latest reading is already at the target. The plan holds you there at maintenance with high protein." });
  }

  // ---- Energy ----
  const tdee = inp.measuredTdee
    ? { kcal: round(inp.measuredTdee.kcal, 10), label: `your ${inp.measuredTdee.source} total burn, ${inp.measuredTdee.days}-day average`, cite: [] as CitationId[] }
    : inp.formulaTdee
      ? { kcal: round(inp.formulaTdee.kcal, 10), label: inp.formulaTdee.label, cite: inp.formulaTdee.cite }
      : null;
  if (inp.measuredTdee) {
    const stale = Math.floor((inp.today.getTime() - inp.measuredTdee.lastDay.getTime()) / DAY_MS);
    if (stale > 7) {
      notes.push({ level: "warn", text: `Your ${inp.measuredTdee.source} burn data stops ${stale} days ago (${inp.measuredTdee.lastDay.toISOString().slice(0, 10)}). The plan uses the last stretch it has; resync to keep it current.` });
    }
  }

  const weeksLeft = g.deadline ? (g.deadline.getTime() - inp.today.getTime()) / (7 * DAY_MS) : null;
  let neededPct: number | null = null;
  let plannedPct: number | null = null;
  let plannedKgWk: number | null = null;
  let projectedDate: Date | null = null;
  let onTime: boolean | null = null;
  let kcal: number | null = null;
  let kcalFloor: number | null = null;

  if (weeksLeft != null && weeksLeft <= 0) {
    notes.push({ level: "warn", text: "This goal's date has passed. Set a new date to get a pace." });
  }

  if (tdee && w != null) {
    if (direction === "lose" && changeKg != null) {
      // A set date wins (2026-10-18, Kalysha): the plan hits the date and the
      // safety limits become warnings for her / her coach to weigh. With no
      // date, the safe default pace and the energy floor still shape it.
      neededPct = weeksLeft != null && weeksLeft > 0 ? (changeKg / weeksLeft / w) * 100 : null;
      const followDate = neededPct != null;
      plannedPct = followDate ? (neededPct as number) : DEFAULT_LOSS_PCT_PER_WK;
      plannedKgWk = (plannedPct / 100) * w;
      kcal = tdee.kcal - (plannedKgWk * KCAL_PER_KG) / 7;

      // The date can't be met if what's left wouldn't even cover protein
      // (or goes negative). Say so and show the 1%/week plan instead of an
      // impossible number.
      let unreachable = false;
      const proteinKcal = w * proteinPerKg({ bodybuilding: true, phase: "lose" }) * 4;
      if (followDate && kcal < proteinKcal) {
        unreachable = true;
        notes.push({
          level: "warn",
          text: `Not reachable by your date. It needs a deficit of about ${round(tdee.kcal - kcal, 10)} kcal a day, and you burn about ${tdee.kcal}, so even eating only your protein wouldn't get there. Showing the 1%/week plan instead.`,
          cite: ["hall2008"],
        });
        plannedPct = MAX_LOSS_PCT_PER_WK;
        plannedKgWk = (plannedPct / 100) * w;
        kcal = tdee.kcal - (plannedKgWk * KCAL_PER_KG) / 7;
      }

      const exKcal = inp.training?.kcalPerDay ?? 0;
      kcalFloor = lean != null ? EA_FLOOR_KCAL_PER_KG_FFM * lean + exKcal : null;
      if (kcalFloor != null && kcal < kcalFloor) {
        if (followDate) {
          const ea = lean != null ? (kcal - exKcal) / lean : null;
          notes.push({
            level: "warn",
            text: `${unreachable ? "At 1%/week" : "To make your date"}, calories sit at ${round(kcal, 10)}, under the ${round(kcalFloor, 10)} kcal floor${ea != null ? ` (about ${Math.round(ea)} kcal per kg of lean mass left after training, vs ${EA_FLOOR_KCAL_PER_KG_FFM})` : ""}. Below that floor, low energy availability starts to affect hormones, bone and training. Shown because you set the date.`,
            cite: ["loucks2011", "mountjoy2023"],
          });
        } else {
          kcal = kcalFloor;
          plannedKgWk = Math.max(0, ((tdee.kcal - kcal) * 7) / KCAL_PER_KG);
          plannedPct = (plannedKgWk / w) * 100;
          notes.push({
            level: "warn",
            text: `Calories are held at ${round(kcalFloor, 10)} so energy left after training stays at ${EA_FLOOR_KCAL_PER_KG_FFM} kcal per kg of lean mass. Going lower raises the risk of low energy availability (hormones, bone, performance), so the pace slows instead.`,
            cite: ["loucks2011", "mountjoy2023"],
          });
        }
      }
      if (!unreachable && neededPct != null && neededPct > MAX_LOSS_PCT_PER_WK) {
        const safeDate = new Date(inp.today.getTime() + (changeKg / ((MAX_LOSS_PCT_PER_WK / 100) * w)) * 7 * DAY_MS);
        notes.push({
          level: "warn",
          text: `Your date needs ${neededPct.toFixed(1)}% of body weight a week. Above ~1%/week more of the loss comes from muscle. At 1%/week you'd land around ${safeDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.`,
          cite: ["helms2014b", "garthe2011"],
        });
      }
      if (followDate && !unreachable) {
        projectedDate = g.deadline;
        onTime = true;
      } else if (unreachable) {
        projectedDate = new Date(inp.today.getTime() + (changeKg / (plannedKgWk as number)) * 7 * DAY_MS);
        onTime = false;
      } else if (plannedKgWk > 0) {
        projectedDate = new Date(inp.today.getTime() + (changeKg / plannedKgWk) * 7 * DAY_MS);
      } else {
        notes.push({ level: "warn", text: "Your burn is already at the energy floor, so there's no room for a deficit. The plan holds maintenance; more training volume or a set date opens room." });
      }
    } else if (direction === "gain") {
      const gainKg = changeKg != null ? -changeKg : null;
      neededPct = gainKg != null && weeksLeft != null && weeksLeft > 0 ? (gainKg / weeksLeft / w) * 100 : null;
      plannedPct = neededPct != null ? Math.min(Math.max(neededPct, 0), MAX_GAIN_PCT_PER_WK) : DEFAULT_GAIN_PCT_PER_WK;
      plannedKgWk = (plannedPct / 100) * w;
      kcal = tdee.kcal + (plannedKgWk * KCAL_PER_KG) / 7;
      if (gainKg != null && plannedKgWk > 0) {
        projectedDate = new Date(inp.today.getTime() + (gainKg / plannedKgWk) * 7 * DAY_MS);
        onTime = g.deadline ? projectedDate.getTime() <= g.deadline.getTime() + DAY_MS : null;
      }
      if (neededPct != null && neededPct > MAX_GAIN_PCT_PER_WK) {
        notes.push({ level: "warn", text: `The date needs ${neededPct.toFixed(1)}%/week. Lean gain is usually aimed at about 0.25–0.5%/week; faster mostly adds fat, so the plan caps it.`, cite: ["iraki2019"] });
      }
    } else {
      kcal = tdee.kcal;
    }
  }

  let daily: GoalPlan["daily"] = null;
  if (kcal != null && w != null) {
    const phase = direction === "lose" ? "lose" : direction === "gain" ? "gain" : "maintain";
    const gPerKg = proteinPerKg({ bodybuilding: true, phase });
    const proteinG = round(w * gPerKg);
    const kcalR = round(kcal, 10);
    const fatG = round((kcalR * FAT_SHARE) / 9);
    const carbsG = Math.max(0, round((kcalR - proteinG * 4 - fatG * 9) / 4));
    const base = DRINK_L_BASE[sex ?? "female"];
    const sessionH = (inp.training?.avgSessionMin ?? 60) / 60;
    daily = {
      kcal: kcalR,
      kcalFloor: kcalFloor != null ? round(kcalFloor, 10) : null,
      proteinG,
      proteinGPerKg: gPerKg,
      fatG,
      carbsG,
      waterRestL: Math.round(base * 10) / 10,
      waterTrainingL: Math.round((base + DRINK_L_PER_TRAINING_HOUR * sessionH) * 10) / 10,
    };
    if (!sex) notes.push({ level: "info", text: "Water uses the women's reference until your sex is set." });
  }

  const menu = daily ? buildMenu(inp, daily.kcal, daily.proteinG) : null;
  if (daily && menu && inp.loggedDays < 5) {
    notes.push({ level: "info", text: `Only ${inp.loggedDays} logged food day${inp.loggedDays === 1 ? "" : "s"} so far, so the menu has little of your own food to draw on. It fills in as you log.` });
  }

  return {
    goalId: g.id,
    kind,
    direction,
    missing,
    current: { weightKg: w, bodyFatPct: bf, leanMassKg: lean },
    target: { weightKg: targetWeight, bodyFatPct: targetBf, changeKg, source: targetSource },
    pace: { neededPctPerWk: neededPct, plannedPctPerWk: plannedPct, plannedKgPerWk: plannedKgWk, deadline: g.deadline, projectedDate, onTime },
    tdee,
    daily,
    menu,
    notes,
  };
}

// ---------------------------------------------------------------------------
// A day of eating from her own log
// ---------------------------------------------------------------------------

/** Not from her log — shown only when her own foods can't reach protein. USDA FDC values. */
const GENERIC_PROTEIN: FoodItem = { name: "Plain nonfat Greek yogurt, 1 cup (170 g)", kcal: 100, protein: 17, carbs: 6, fat: 1 };

const SLOT_ORDER = ["breakfast", "lunch", "dinner"];

function sum(lines: { kcal: number; protein: number; carbs: number; fat: number }[]): FoodItem {
  return lines.reduce(
    (t, l) => ({ name: "total", kcal: t.kcal + l.kcal, protein: t.protein + l.protein, carbs: t.carbs + l.carbs, fat: t.fat + l.fat }),
    { name: "total", kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function buildMenu(inp: PlanInputs, kcalTarget: number, proteinTarget: number): GoalPlan["menu"] {
  const meals = inp.meals.filter((m) => m.kcal >= 1);
  const lines: MenuLine[] = [];

  // 1) Daily habits: small things she has on most days (coffee). Kept as-is.
  const habits = meals
    .filter((m) => m.mealType === "snack" && m.dayShare >= 0.25 && m.timesEaten >= 3 && m.kcal < 250)
    .sort((a, b) => b.dayShare - a.dayShare)
    .slice(0, 2);
  for (const h of habits) {
    lines.push({ slot: "Every day", label: h.label, kcal: h.kcal, protein: h.protein, carbs: h.carbs, fat: h.fat, timesEaten: h.timesEaten, fromLog: true });
  }

  // 2) Meal slots, in the shape she actually eats (often 1–2 meals a day).
  // Everyday meals only: no one-off feasts (a 6-dish restaurant dinner) and
  // nothing that alone eats most of the day's budget.
  const mains = meals.filter(
    (m) => m.mealType !== "snack" && m.kcal >= 150 && m.kcal <= kcalTarget * 0.6 && m.items.length <= 4,
  );
  const typeCounts = new Map<string, number>();
  for (const m of mains) typeCounts.set(m.mealType, (typeCounts.get(m.mealType) ?? 0) + m.timesEaten);
  const nSlots = Math.min(3, Math.max(1, Math.round(inp.mealsPerDay ?? 2)));
  const slots = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, nSlots)
    .map(([t]) => t)
    .sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));

  const candidatesFor = (slot: string) =>
    mains
      .filter((m) => m.mealType === slot)
      .sort((a, b) => b.timesEaten - a.timesEaten || b.protein - a.protein)
      .slice(0, 6);

  const habitTotals = sum(lines);
  const staples = inp.staples
    .filter((s) => s.kcal > 0 && s.protein / s.kcal >= 0.08)
    .sort((a, b) => b.protein / b.kcal - a.protein / a.kcal)
    .slice(0, 5);

  type Combo = { picks: LoggedMeal[]; tops: MenuLine[]; totals: FoodItem; score: number };
  let best: Combo | null = null;

  const evaluate = (picks: LoggedMeal[]) => {
    const tops: MenuLine[] = [];
    let totals = sum([habitTotals, ...picks]);
    // Protein top-ups from her own high-protein staples, ≤2 servings each.
    for (const s of staples) {
      for (let k = 0; k < 2; k++) {
        if (totals.protein >= proteinTarget * 0.95) break;
        if (totals.kcal + s.kcal > kcalTarget * 1.05) break;
        const existing = tops.find((t) => t.label === s.name);
        if (existing) {
          existing.servings = (existing.servings ?? 1) + 1;
          existing.kcal += s.kcal; existing.protein += s.protein; existing.carbs += s.carbs; existing.fat += s.fat;
        } else {
          tops.push({ slot: "Add", label: s.name, kcal: s.kcal, protein: s.protein, carbs: s.carbs, fat: s.fat, timesEaten: s.timesEaten, fromLog: true, servings: 1 });
        }
        totals = sum([totals, s]);
      }
    }
    const kcalErr = Math.abs(totals.kcal - kcalTarget) / kcalTarget;
    const over = Math.max(0, totals.kcal - kcalTarget * 1.05) / kcalTarget;
    const protShort = Math.max(0, proteinTarget - totals.protein) / proteinTarget;
    const fatOver = Math.max(0, totals.fat * 9 - kcalTarget * 0.35) / kcalTarget;
    const familiar = picks.reduce((s, p) => s + Math.log1p(p.timesEaten), 0);
    const score = kcalErr + 2 * over + 1.5 * protShort + fatOver - 0.03 * familiar;
    if (!best || score < best.score) best = { picks, tops, totals, score };
  };

  const recurse = (i: number, acc: LoggedMeal[]) => {
    if (i === slots.length) return evaluate(acc);
    const cands = candidatesFor(slots[i]).filter((c) => !acc.some((a) => a.key === c.key));
    if (cands.length === 0) return recurse(i + 1, acc);
    for (const c of cands) recurse(i + 1, [...acc, c]);
  };
  recurse(0, []);

  if (!best && lines.length === 0) {
    // Nothing logged at all.
    return null;
  }
  const chosen = best as Combo | null;
  if (chosen) {
    for (const p of chosen.picks) {
      lines.push({ slot: p.mealType[0].toUpperCase() + p.mealType.slice(1), label: p.label, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, timesEaten: p.timesEaten, fromLog: true });
    }
    lines.push(...chosen.tops);
  }

  let totals = sum(lines);
  if (totals.protein < proteinTarget * 0.85 && totals.kcal + GENERIC_PROTEIN.kcal <= kcalTarget * 1.1) {
    lines.push({ slot: "Add", label: GENERIC_PROTEIN.name, kcal: GENERIC_PROTEIN.kcal, protein: GENERIC_PROTEIN.protein, carbs: GENERIC_PROTEIN.carbs, fat: GENERIC_PROTEIN.fat, timesEaten: 0, fromLog: false });
    totals = sum(lines);
  }

  const fromLogKcal = lines.filter((l) => l.fromLog).reduce((s, l) => s + l.kcal, 0);
  return {
    lines: lines.map((l) => ({ ...l, kcal: round(l.kcal), protein: round(l.protein), carbs: round(l.carbs), fat: round(l.fat) })),
    totals: { name: "total", kcal: round(totals.kcal), protein: round(totals.protein), carbs: round(totals.carbs), fat: round(totals.fat) },
    fromLogShare: totals.kcal > 0 ? fromLogKcal / totals.kcal : 0,
  };
}
