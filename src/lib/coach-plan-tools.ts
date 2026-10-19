import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { CITATIONS, type CitationId } from "@/lib/citations";
import { isNutritionGoal, type GoalPlan, type PlanAdjustments } from "@/lib/goal-plan";
import { getGoalPlan, getSavedPlan, resolveAdjustments, type RawAdjustments } from "@/lib/goal-plan-data";
import { searchFoods } from "@/lib/fdc";
import { SESSION_TYPES } from "@/lib/exercise-burn";

/**
 * Coach ↔ goal plan (2026-10-19). The coach never does plan math: it sends
 * adjustments (sessions, budget, target BF, date, foods by USDA FDC id) and
 * the plan engine returns every number with its source. propose_goal_plan
 * also hands the UI a card with a Save button.
 */

const adjustmentsSchema = {
  type: "object" as const,
  description: "Changes to the plan. Omit a field to keep the plan's default for it.",
  properties: {
    sessions: {
      type: "array",
      description: "Daily training the user plans to do. Replaces their recent average watch training in the burn.",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: SESSION_TYPES },
          minutes: { type: "number" },
          days_per_week: { type: "number", description: "Default 7." },
        },
        required: ["type", "minutes"],
      },
    },
    calorie_budget_kcal: { type: "number", description: "Fixed daily intake the user chose. The plan then shows where it lands by the date." },
    target_body_fat_pct: { type: "number" },
    deadline: { type: "string", description: "YYYY-MM-DD, only if the user changes the goal's date." },
    foods: {
      type: "array",
      description: "A fixed day of eating. Each food MUST come from lookup_food (fdc_id). Give exactly one amount: grams (or ml for drinks), servings (branded label servings), or kcal.",
      items: {
        type: "object",
        properties: {
          fdc_id: { type: "number" },
          grams: { type: "number" },
          servings: { type: "number" },
          kcal: { type: "number" },
        },
        required: ["fdc_id"],
      },
    },
    avoid: { type: "array", items: { type: "string" }, description: "Words to keep out of the menu built from their log, e.g. 'yogurt'." },
    at_floor: { type: "boolean", description: "Set intake exactly at the energy-availability floor, computed with these sessions. Use this — not a number of your own — for 'the most I can lose' questions." },
  },
};

export const PLAN_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_goal_plan",
    description:
      "The nutrition plan for a physique/weight goal: target, pace, date, daily calories, protein, fat, carbs, water, a day of eating, warnings, and the source for every number. With `adjustments`, returns a preview with those changes (nothing is saved). Without, returns the user's saved plan if they have one, else the calculated plan. Use this for ANY plan number.",
    input_schema: {
      type: "object" as const,
      properties: { goal_id: { type: "string" }, adjustments: adjustmentsSchema },
      required: ["goal_id"],
    },
  },
  {
    name: "lookup_food",
    description:
      "Search USDA FoodData Central. Returns up to 5 matches with fdc_id, nutrients per 100 g (or 100 ml) and, for branded products, the label serving. Use branded=true for a specific product (e.g. 'Core Power Elite 42g'). Pick the match that fits and tell the user which one; never state nutrients that aren't in this result.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" }, branded: { type: "boolean" } },
      required: ["query"],
    },
  },
  {
    name: "propose_goal_plan",
    description:
      "Show the user a plan card with these adjustments and a Save button. Call it whenever the user changes their plan (training, budget, foods, target, date). Same output as get_goal_plan with adjustments. Nothing is saved until the user taps Save.",
    input_schema: {
      type: "object" as const,
      properties: {
        goal_id: { type: "string" },
        adjustments: adjustmentsSchema,
        summary: { type: "string", description: "One short line describing the change, e.g. 'Run 30 + lift 90 + stairs 45 daily; 700 kcal protein + rice'." },
      },
      required: ["goal_id", "adjustments", "summary"],
    },
  },
];

export const PLAN_SYSTEM_SECTION = `

## Goal nutrition plans — tools: get_goal_plan, lookup_food, propose_goal_plan
- Every plan number — calories, macros, water, calories burned, dates, weight or body fat on a date, any food's nutrients — must come from a tool result in this conversation. Never compute, estimate or recall one yourself. If no tool gives the number, say you don't have it.
- Foods: look each one up with lookup_food (USDA FoodData Central) and pass fdc_id plus one amount (grams, servings or kcal). Never state a food's nutrients from memory. Name the USDA entry you used.
- Training: pass sessions (type + minutes). The tool says whether each burn came from the user's own watch or the 2024 Compendium; tell them which.
- Cite with the short source names the tool returns (e.g. "Helms 2014b"). Repeat every warning the tool returns, in plain words; never drop or soften one.
- Whenever the user changes their plan, call propose_goal_plan so they get a plan card with a Save button. Keep your text to a few lines — the card shows the numbers.
- Never state a number from memory, even as an approximation: no "~40 kcal", no typical package or can sizes, no burn rates. If you need an amount you don't have (e.g. the weight of their can), ask the user for it.
- Cite a source only for the claim it's listed against in the tool's "sources" (each entry says what it supports). Never attach a source to a different claim.
- Limits: if asked for "the most I can lose", extreme effort or fasting, call propose_goal_plan with the training they describe and at_floor: true. The tool sets intake at the floor for that training. Say plainly that going further costs mostly water and muscle, not fat. Never write fasting protocols or suggest a budget below the floor yourself. If the user sets one, run it so they see the warnings, show the warnings, and suggest reviewing it with their own coach or clinician.`;

export interface PlanProposal {
  goalId: string;
  goalTitle: string;
  summary: string;
  /** Re-resolved on the server when saved. */
  raw: RawAdjustments;
  preview: {
    kcal: number | null;
    proteinG: number | null;
    fatG: number | null;
    carbsG: number | null;
    waterRestL: number | null;
    waterTrainingL: number | null;
    deadline: string | null;
    projectedDate: string | null;
    onTime: boolean | null;
    atDeadline: { weightKg: number; bodyFatPct: number | null } | null;
    exercisePerDayKcal: number | null;
    menu: { label: string; kcal: number; protein: number; source: string }[];
    warnings: string[];
  };
}

export interface PlanToolContext {
  proposals: PlanProposal[];
}

const r1 = (v: number | null | undefined) => (v == null ? null : Math.round(v * 10) / 10);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** What each source is used for — the coach may cite it only for this. */
const SUPPORTS: Partial<Record<CitationId, string>> = {
  helms2014b: "loss pace 0.5–1% body weight/week to keep lean mass; fat 15–30% of calories",
  garthe2011: "slower loss (~0.7%/wk vs ~1.4%/wk) kept more lean mass in athletes",
  hall2008: "~7700 kcal per kg of weight change is an approximation",
  loucks2011: "energy availability floor ~30 kcal per kg lean mass",
  mountjoy2023: "low energy availability harms hormones, bone, health and performance (REDs)",
  morton2018: "protein ~1.6 g/kg, upper range 2.2 g/kg for muscle with training",
  helms2014: "higher protein (2.3–3.1 g/kg lean mass) during a cut for lean trained people",
  efsa2010: "water reference intakes (2.0 L women / 2.5 L men total water)",
  sawka2007: "sweat rates ~0.5–2 L/h during exercise",
  herrmann2024: "MET values for activities without watch history",
  usdaFdc: "food nutrients",
  iraki2019: "lean gain pace ~0.25–0.5% body weight/week",
  cunningham1980: "resting energy from lean mass (500 + 22 × lean kg)",
  mifflin1990: "resting energy from weight, height, age, sex",
  acsm2021: "essential fat ~10–13% women, ~2–5% men",
};

function cites(plan: GoalPlan): Record<string, string> {
  const ids = new Set<CitationId>(["helms2014b", "garthe2011", "hall2008", "loucks2011", "mountjoy2023", "morton2018", "helms2014", "efsa2010", "sawka2007", "acsm2021"]);
  for (const n of plan.notes) for (const c of n.cite ?? []) ids.add(c);
  for (const c of plan.tdee?.cite ?? []) ids.add(c);
  if (plan.exercise?.sessions.some((s) => !s.fromWatch)) ids.add("herrmann2024");
  if (plan.adjustments?.foods?.length) ids.add("usdaFdc");
  if (plan.direction === "gain") ids.add("iraki2019");
  return Object.fromEntries([...ids].map((id) => [CITATIONS[id].short, SUPPORTS[id] ?? CITATIONS[id].full]));
}

/** Compact plan for the model: numbers + where each comes from. */
function planForModel(plan: GoalPlan, savedAt: Date | null) {
  return {
    status: plan.adjustments ? (savedAt ? `saved plan (saved ${day(savedAt)})` : "preview with adjustments (not saved)") : "calculated plan (no coach changes)",
    kind: plan.kind,
    direction: plan.direction,
    missing_inputs: plan.missing,
    current: { weight_kg: r1(plan.current.weightKg), body_fat_pct: r1(plan.current.bodyFatPct), lean_mass_kg: r1(plan.current.leanMassKg) },
    target: { weight_kg: r1(plan.target.weightKg), body_fat_pct: r1(plan.target.bodyFatPct), change_kg: r1(plan.target.changeKg), basis: plan.target.source },
    pace: {
      needed_pct_body_weight_per_week: r1(plan.pace.neededPctPerWk),
      planned_pct_per_week: r1(plan.pace.plannedPctPerWk),
      planned_kg_per_week: r1(plan.pace.plannedKgPerWk),
      goal_date: day(plan.pace.deadline),
      projected_date: day(plan.pace.projectedDate),
      on_time: plan.pace.onTime,
      on_goal_date_if_loss_is_all_fat: plan.pace.atDeadline ? { weight_kg: r1(plan.pace.atDeadline.weightKg), body_fat_pct: r1(plan.pace.atDeadline.bodyFatPct) } : null,
      basis: "~7700 kcal per kg of body weight (Hall 2008, an approximation); real loss is usually slower",
    },
    burn: plan.tdee ? { kcal_per_day: plan.tdee.kcal, basis: plan.tdee.label } : null,
    planned_training: plan.exercise
      ? { kcal_per_day: plan.exercise.perDayKcal, replaces_recent_workouts_kcal_per_day: plan.exercise.replacedKcal, sessions: plan.exercise.sessions.map((s) => ({ type: s.type, minutes: s.minutes, days_per_week: s.daysPerWeek, kcal: s.kcal, source: s.source })) }
      : null,
    daily: plan.daily
      ? {
          kcal: plan.daily.kcal,
          kcal_floor: plan.daily.kcalFloor,
          kcal_floor_basis: "30 kcal per kg lean mass + training (Loucks 2011, Mountjoy 2023)",
          protein_g: plan.daily.proteinG,
          protein_basis: `${plan.daily.proteinGPerKg} g/kg (Morton 2018, Helms 2014)`,
          fat_g: plan.daily.fatG,
          fat_basis: "25% of calories, within 15–30% (Helms 2014b)",
          carbs_g: plan.daily.carbsG,
          water_rest_day_l: plan.daily.waterRestL,
          water_training_day_l: plan.daily.waterTrainingL,
          water_basis: "EFSA 2010 drinks reference + 0.75 L per training hour (app default; sweat rates 0.5–2 L/h, Sawka 2007)",
        }
      : null,
    day_of_eating: plan.menu
      ? {
          items: plan.menu.lines.map((l) => ({ slot: l.slot, food: l.label, kcal: l.kcal, protein_g: l.protein, carbs_g: l.carbs, fat_g: l.fat, source: l.source ?? (l.fromLog ? `user's own log (eaten ${l.timesEaten}×; macros estimated when logged)` : "suggestion, not from user's log") })),
          totals: { kcal: plan.menu.totals.kcal, protein_g: plan.menu.totals.protein, carbs_g: plan.menu.totals.carbs, fat_g: plan.menu.totals.fat },
        }
      : null,
    warnings: plan.notes.filter((n) => n.level === "warn").map((n) => n.text),
    info: plan.notes.filter((n) => n.level === "info").map((n) => n.text),
    sources: cites(plan),
    labelled_app_defaults: [
      "visible abs ~17% body fat (women) / 11% (men) is a rule of thumb, not a study number",
      "body-fat floor 14% women / 6% men (ACSM essential fat 10–13% / 2–5%)",
      "0.75 L extra water per training hour",
    ],
  };
}

function toRaw(adj: PlanAdjustments): RawAdjustments {
  return {
    sessions: adj.sessions?.map((s) => ({ type: s.type, minutes: s.minutes, days_per_week: s.daysPerWeek })),
    calorie_budget_kcal: adj.calorieBudgetKcal ?? undefined,
    target_body_fat_pct: adj.targetBodyFatPct ?? undefined,
    deadline: adj.deadline ?? undefined,
    foods: adj.foods?.map((f) => ({ fdc_id: f.fdcId, grams: Math.round(f.grams * 10) / 10 })),
    avoid: adj.avoid,
    at_floor: adj.atFloor || undefined,
  };
}

async function nutritionGoal(goalId: unknown) {
  if (typeof goalId !== "string") throw new Error("goal_id is required");
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) throw new Error("No goal with that id (use get_goals).");
  if (!isNutritionGoal(goal)) throw new Error("That goal has no nutrition plan (only physique / weight / abs goals do).");
  return goal;
}

export async function runPlanTool(name: string, args: Record<string, unknown>, ctx?: PlanToolContext): Promise<unknown | undefined> {
  switch (name) {
    case "lookup_food": {
      const q = typeof args.query === "string" ? args.query.trim() : "";
      if (!q) return { error: "query is required" };
      const foods = await searchFoods(q, { branded: args.branded === true });
      if (!foods.length) return { matches: [], note: "No USDA FoodData Central match. Try a simpler or different name." };
      return {
        source: "USDA FoodData Central",
        matches: foods.map((f) => ({
          fdc_id: f.fdcId,
          description: f.description,
          brand: f.brand,
          data_type: f.dataType,
          per_100: { kcal: f.per100.kcal, protein_g: f.per100.protein, carbs_g: f.per100.carbs, fat_g: f.per100.fat, unit: f.serving?.unit === "ml" ? "ml" : "g" },
          label_serving: f.serving ? { size: f.serving.size, unit: f.serving.unit, text: f.serving.text } : null,
          url: f.url,
        })),
      };
    }
    case "get_goal_plan":
    case "propose_goal_plan": {
      const goal = await nutritionGoal(args.goal_id);
      let errors: string[] = [];
      let adjustments: PlanAdjustments | null | undefined = undefined;
      if (args.adjustments && typeof args.adjustments === "object") {
        const res = await resolveAdjustments(args.adjustments as RawAdjustments);
        adjustments = res.adjustments;
        errors = res.errors;
      }
      const saved = adjustments === undefined ? await getSavedPlan(goal.id) : null;
      const plan = await getGoalPlan(goal.id, adjustments === undefined ? {} : { adjustments });
      if (!plan) return { error: "Plan unavailable for this goal." };
      const out = { goal: { id: goal.id, title: goal.title }, ...planForModel(plan, saved?.createdAt ?? null), dropped_inputs: errors.length ? errors : undefined };
      if (name === "propose_goal_plan" && ctx) {
        ctx.proposals.push({
          goalId: goal.id,
          goalTitle: goal.title,
          summary: typeof args.summary === "string" ? args.summary.slice(0, 200) : "Adjusted plan",
          raw: toRaw(plan.adjustments ?? {}),
          preview: {
            kcal: plan.daily?.kcal ?? null,
            proteinG: plan.daily?.proteinG ?? null,
            fatG: plan.daily?.fatG ?? null,
            carbsG: plan.daily?.carbsG ?? null,
            waterRestL: plan.daily?.waterRestL ?? null,
            waterTrainingL: plan.daily?.waterTrainingL ?? null,
            deadline: day(plan.pace.deadline),
            projectedDate: day(plan.pace.projectedDate),
            onTime: plan.pace.onTime,
            atDeadline: plan.pace.atDeadline ?? null,
            exercisePerDayKcal: plan.exercise?.perDayKcal ?? null,
            menu: (plan.menu?.lines ?? []).map((l) => ({ label: l.label, kcal: l.kcal, protein: l.protein, source: l.source ?? (l.fromLog ? "your log" : "suggestion") })),
            warnings: plan.notes.filter((n) => n.level === "warn").map((n) => n.text),
          },
        });
        return { ...out, card_shown_to_user: true };
      }
      return out;
    }
    default:
      return undefined;
  }
}

// ---- Marker that carries a proposal inside the stored assistant message ----

const MARK = /\n*<!--baseline-plan:([A-Za-z0-9+/=]+)-->/g;

export function encodeProposals(proposals: PlanProposal[]): string {
  return proposals.map((p) => `\n\n<!--baseline-plan:${Buffer.from(JSON.stringify(p)).toString("base64")}-->`).join("");
}

/** For the model's history: replace cards with a short note. */
export function stripProposalsForModel(content: string): string {
  return content.replace(MARK, "\n\n[Plan card shown to the user with a Save button.]");
}
