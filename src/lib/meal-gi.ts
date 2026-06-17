/**
 * meal-gi.ts — pre-workout meal -> GI-outcome BACKWARD analyzer.
 * See docs/meal-gi-analyzer-spec.md.
 *
 * Hypothesis-generating, not causal: finds which pre-workout meal factors
 * cluster with GI failures (moderate/vomited), so Coach can warn and Mind
 * can convict one with an experiment. It surfaces the *cluster* and tags
 * co-moving factors as confounders — it never claims a clean cause.
 *
 * Stats: GI outcome is a binary rate, so this uses Fisher's exact test on
 * the 2x2 (factor present/absent x failed/clean) — correct at the small n
 * we have — NOT the Welch t-test used for continuous metrics in insights.ts.
 *
 * Honesty contract (no-invented-data): if there are fewer than MIN_EVENTS
 * GI failures, we return zero patterns and report the count, so Coach says
 * "not enough to call a pattern" instead of inventing one.
 */

import { prisma } from "./db";
import { getPreWorkoutFuel, type PreWorkoutFuel } from "./pre-workout-fuel";
import { getCurrentUserId } from "./current-user";
import { fisherExactTwoTailed } from "./fisher";

export interface GiPattern {
  factor: string; // "red meat within 4h"
  withRate: number; // GI-failure rate WITH the factor (0..1)
  withoutRate: number; // ...WITHOUT
  withN: number;
  withoutN: number;
  withFailures: number; // raw 2x2 counts, for honesty
  withoutFailures: number;
  pValue: number; // Fisher's exact, two-tailed
  significance: "significant" | "suggestive" | "watching";
  controlLabel: string;
  confounders: string[]; // factors that co-move on this factor's days
  recommendation: string;
  /** Query params to deep-link Mind's experiment/new, pre-filling this factor. */
  experimentPrefill: Record<string, string>;
}

export interface MealGiResult {
  patterns: GiPattern[];
  /** GI failures (moderate|vomited) among analyzable sessions. */
  positiveEvents: number;
  /** Labeled sessions we could actually assess (had logged pre-workout food). */
  analyzedSessions: number;
  /** True once we have enough events to call patterns. */
  sufficient: boolean;
}

// Below this many GI failures, don't analyze — say "n too small" instead.
const MIN_EVENTS = 6;

// A GI "failure" = impaired/expelled. "mild" (trained-through) is NOT a failure.
const FAILURE_OUTCOMES = new Set(["moderate", "vomited"]);

// ── Factor definitions ─────────────────────────────────────────────────────
interface FactorDef {
  key: string;
  factor: string; // display label
  controlLabel: string;
  test: (f: PreWorkoutFuel) => boolean;
  /** Independent-variable label pre-filled into a Mind experiment. */
  iv: string;
}

const FACTORS: FactorDef[] = [
  {
    key: "low_carb",
    factor: "low carbs pre-workout (<15g in 4h)",
    controlLabel: "sessions with more pre-workout carbs",
    test: (f) => f.items.length > 0 && f.totals.carbs < 15,
    iv: "Eat <15g carbs in the 4h before training",
  },
  {
    key: "short_gap",
    factor: "short last-meal gap (<2h)",
    controlLabel: "sessions with a >=2h gap",
    test: (f) => f.lastMealGapHours != null && f.lastMealGapHours < 2,
    iv: "Eat within 2h before training",
  },
  {
    key: "red_meat",
    factor: "red meat within 4h",
    controlLabel: "sessions without red meat in the 4h band",
    test: (f) => f.items.some((i) => i.tags.includes("red_meat")),
    iv: "Eat red meat in the 4h before training",
  },
  {
    key: "high_fat",
    factor: "high fat (>=25g in 4h)",
    controlLabel: "sessions with <25g fat in the band",
    test: (f) => f.totals.fat >= 25,
    iv: "Eat >=25g fat in the 4h before training",
  },
  {
    key: "eating_out",
    factor: "restaurant/takeout meal",
    controlLabel: "home-cooked sessions",
    test: (f) => f.items.some((i) => i.source === "restaurant" || i.source === "takeout"),
    iv: "Eat restaurant/takeout food before training",
  },
];

function classify(
  pValue: number,
  cells: number[],
): "significant" | "suggestive" | "watching" {
  // Any cell < 5 => underpowered; never promote above "watching".
  if (cells.some((x) => x < 5)) return "watching";
  if (pValue < 0.05) return "significant";
  if (pValue < 0.1) return "suggestive";
  return "watching";
}

function recommend(p: GiPattern): string {
  const withStr = `${p.withFailures} of ${p.withN}`;
  const withoutStr = `${p.withoutFailures} of ${p.withoutN}`;
  if (p.confounders.length > 0) {
    return `Pattern I'm watching: ${p.factor} and ${p.confounders.join(", ")} both show up on your GI days (${withStr} vs ${withoutStr}) — they overlap, so I can't separate them yet. Test ${p.factor} alone in Mind to isolate it.`;
  }
  if (p.significance === "significant") {
    return `${cap(p.factor)} tracks hard with your GI failures (${withStr} vs ${withoutStr}). Worth avoiding before a hard session — and worth proving in Mind.`;
  }
  if (p.significance === "suggestive") {
    return `${cap(p.factor)} is a suggestive lead for your GI failures (${withStr} vs ${withoutStr}). Keep logging, and test it in Mind to confirm.`;
  }
  return `Early signal: ${p.factor} (${withStr} vs ${withoutStr}). Not enough to call yet — keep logging the outcome.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Resolve each labeled note's actual workout start time (for the fuel window). */
async function resolveStarts(
  notes: { workoutSource: string; workoutId: string }[],
  userId: string,
): Promise<Map<string, Date>> {
  const hkIds = notes.filter((n) => n.workoutSource === "healthkit").map((n) => n.workoutId);
  const ouraIds = notes.filter((n) => n.workoutSource === "oura").map((n) => n.workoutId);
  const [hks, ouras] = await Promise.all([
    hkIds.length
      ? prisma.healthKitWorkout.findMany({
          where: { userId, id: { in: hkIds } },
          select: { id: true, startedAt: true },
        })
      : Promise.resolve([]),
    ouraIds.length
      ? prisma.ouraSession.findMany({
          where: { userId, id: { in: ouraIds } },
          select: { id: true, startedAt: true },
        })
      : Promise.resolve([]),
  ]);
  const m = new Map<string, Date>();
  for (const h of hks) m.set(`healthkit:${h.id}`, h.startedAt);
  for (const o of ouras) m.set(`oura:${o.id}`, o.startedAt);
  return m;
}

export async function analyzeMealGi(): Promise<MealGiResult> {
  const userId = getCurrentUserId();

  // Labeled, confidently — skip needsReview rows (unconfirmed positives).
  const notes = await prisma.workoutNote.findMany({
    where: { userId, giOutcome: { not: null }, giNeedsReview: false },
    select: { workoutSource: true, workoutId: true, giOutcome: true },
  });

  const startMap = await resolveStarts(notes, userId);

  // Build the analyzable session list: those with a resolvable start AND
  // logged pre-workout food (can't assess meal factors on unlogged days —
  // a missing log is not the same as a fasted session).
  interface Session {
    failed: boolean;
    present: Record<string, boolean>;
  }
  const sessions: Session[] = [];

  for (const n of notes) {
    const start = startMap.get(`${n.workoutSource}:${n.workoutId}`);
    if (!start) continue;
    const fuel = await getPreWorkoutFuel(start, 4);
    if (fuel.items.length === 0) continue; // nothing logged -> can't assess

    const present: Record<string, boolean> = {};
    for (const f of FACTORS) present[f.key] = f.test(fuel);
    sessions.push({ failed: FAILURE_OUTCOMES.has(n.giOutcome as string), present });
  }

  const positiveEvents = sessions.filter((s) => s.failed).length;
  const analyzedSessions = sessions.length;

  if (positiveEvents < MIN_EVENTS) {
    return { patterns: [], positiveEvents, analyzedSessions, sufficient: false };
  }

  const patterns: GiPattern[] = [];
  for (const f of FACTORS) {
    let a = 0, b = 0, c = 0, d = 0; // present-failed, present-clean, absent-failed, absent-clean
    for (const s of sessions) {
      const p = s.present[f.key];
      if (p && s.failed) a++;
      else if (p && !s.failed) b++;
      else if (!p && s.failed) c++;
      else d++;
    }
    const withN = a + b;
    const withoutN = c + d;
    if (withN < 2 || withoutN < 2) continue; // factor (or its absence) too rare to compare

    const withRate = a / withN;
    const withoutRate = c / withoutN;
    if (withRate <= withoutRate) continue; // only surface factors that RAISE failure rate

    const pValue = fisherExactTwoTailed(a, b, c, d);

    // Confounders: other factors present on >=60% of THIS factor's failure days.
    const failureDays = sessions.filter((s) => s.present[f.key] && s.failed);
    const confounders: string[] = [];
    if (failureDays.length > 0) {
      for (const other of FACTORS) {
        if (other.key === f.key) continue;
        const overlap = failureDays.filter((s) => s.present[other.key]).length / failureDays.length;
        if (overlap >= 0.6) confounders.push(other.factor);
      }
    }

    const pattern: GiPattern = {
      factor: f.factor,
      withRate: Math.round(withRate * 100) / 100,
      withoutRate: Math.round(withoutRate * 100) / 100,
      withN,
      withoutN,
      withFailures: a,
      withoutFailures: c,
      pValue: Math.round(pValue * 1000) / 1000,
      significance: classify(pValue, [a, b, c, d]),
      controlLabel: f.controlLabel,
      confounders,
      recommendation: "",
      experimentPrefill: {
        title: `Does ${f.factor} cause my GI failures?`,
        hypothesis: `${cap(f.iv)} increases the chance of a GI failure (nausea/vomiting) during training.`,
        independentVariable: f.iv,
        dependentVariable: "GI failure during the session (nausea/vomiting)",
        dependentMetric: "giOutcome",
        metricSource: "WorkoutNote",
      },
    };
    pattern.recommendation = recommend(pattern);
    patterns.push(pattern);
  }

  // Strongest first: significance tier, then largest rate gap.
  const tier = { significant: 0, suggestive: 1, watching: 2 } as const;
  patterns.sort((x, y) => {
    if (tier[x.significance] !== tier[y.significance]) return tier[x.significance] - tier[y.significance];
    return y.withRate - y.withoutRate - (x.withRate - x.withoutRate);
  });

  return { patterns, positiveEvents, analyzedSessions, sufficient: true };
}
