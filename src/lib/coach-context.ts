import { prisma } from "./db";
import { getScoreForDate } from "./baseline-score";
import {
  readinessTier,
  cyclePhaseGuidance,
  compoundContributions,
  volumeZones,
  hrvCV,
  estimate1RM,
  ffmFromBodyComposition,
  energyAvailability as computeEA,
  proteinTarget,
} from "./training";
import {
  totalDailyEnergyExpenditure,
  goalCalories,
  weightTrendDirection,
  kgToLb,
} from "./tdee";
import { generateInsights } from "./insights";

/**
 * Aggregates the user's current state into a structured context block
 * that gets injected into every coach conversation. The goal is to give
 * Claude full situational awareness so it can give specific, data-driven
 * advice instead of generic wellness tips.
 */
export async function buildCoachContext(): Promise<string> {
  try {
  const now = new Date();
  const localToday = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  );

  // BUG-006 fix: use Promise.allSettled so partial failures don't crash the whole context
  function val<T>(r: PromiseSettledResult<T>, fallback: T): T {
    return r.status === "fulfilled" ? r.value : fallback;
  }

  const results = await Promise.allSettled([
    getScoreForDate(localToday),
    prisma.dailyReadiness.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),
    prisma.dailySleep.findFirst({
      where: { day: { lte: localToday }, totalSleepDuration: { not: null } },
      orderBy: { day: "desc" },
    }),
    prisma.dailyStress.findFirst({
      where: { day: { lte: localToday }, daySummary: { not: null } },
      orderBy: { day: "desc" },
    }),
    prisma.dailyActivity.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),
    prisma.cyclePhaseLog.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),
    prisma.dailySleep.findMany({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
      take: 14,
    }),
    prisma.nutritionLog.findUnique({
      where: { day: localToday },
      include: { entries: true },
    }),
    prisma.workoutSession.findMany({
      orderBy: { date: "desc" },
      take: 3,
      include: {
        sets: {
          where: { isWarmup: false },
          include: { exercise: { select: { name: true, muscleGroup: true } } },
        },
      },
    }),
    prisma.workoutSet.findMany({
      where: {
        isWarmup: false,
        session: { date: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      },
      include: { exercise: true },
    }),
    prisma.weightLog.findMany({
      orderBy: { day: "desc" },
      take: 14,
    }),
    prisma.userProfile.findUnique({ where: { id: 1 } }),
    prisma.experiment.findMany({
      where: { status: { in: ["active", "analyzed"] } },
      include: { _count: { select: { logs: true } } },
    }),
    prisma.goal.findMany({
      where: { status: "active" },
      orderBy: { deadline: "asc" },
    }),
  ]);

  const score = val(results[0], null);
  const todayReadiness = val(results[1], null);
  const todaySleep = val(results[2], null);
  const todayStress = val(results[3], null);
  const todayActivity = val(results[4], null);
  const phaseLog = val(results[5], null);
  const recentSleep = val(results[6], [] as Array<{ averageHrv: number | null }>);
  const todayNutrition = val(results[7], null) as {
    calories: number; protein: number; carbs: number; fat: number;
    entries: Array<{ mealType: string; protein: number }>;
  } | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentSessions = val(results[8], []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weekSets = val(results[9], []) as any[];
  const weightLogs = val(results[10], []) as Array<{ weightKg: number; bodyFatPct: number | null; day: Date }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = val(results[11], null) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeExperiments = val(results[12], []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goals = val(results[13], []) as any[];

  // ---- Build context sections ----
  const lines: string[] = [];
  lines.push(`# User State (${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })})`);
  lines.push("");

  // Profile
  if (profile) {
    lines.push("## Profile");
    const weightKg = weightLogs[0]?.weightKg ?? profile.bodyWeightKg;
    if (weightKg) {
      lines.push(`- Weight: ${weightKg.toFixed(1)} kg (${kgToLb(weightKg)} lb)`);
    }
    if (profile.bodyFatPct) lines.push(`- Body fat: ${profile.bodyFatPct}%`);
    if (profile.heightCm) lines.push(`- Height: ${profile.heightCm} cm`);
    if (profile.age) lines.push(`- Age: ${profile.age}`);
    if (profile.sex) lines.push(`- Sex: ${profile.sex}`);
    lines.push(`- Activity level: ${profile.activityLevel}`);
    lines.push(`- Experience: ${profile.experienceLevel}`);
    lines.push(`- Current goal: ${profile.goal}${profile.targetWeightKg ? ` (target ${profile.targetWeightKg} kg)` : ""}`);
    lines.push("");
  }

  // Baseline score + readiness tier
  if (score) {
    const tier = readinessTier(score.overall);
    lines.push("## Today's Readiness");
    lines.push(`- Baseline Score: ${score.overall}/100 (${score.label})`);
    lines.push(`- Training tier: ${tier.tier.toUpperCase()} — ${tier.recommendation}`);
    lines.push(`- Volume mod: ${Math.round(tier.volumeMod * 100)}% · Intensity mod: ${Math.round(tier.intensityMod * 100)}%`);
    lines.push(`- Components:`);
    lines.push(`  - Readiness: ${score?.components?.readiness?.value ?? "—"}`);
    lines.push(`  - HRV trend: ${score?.components?.hrvTrend?.value ?? "—"}`);
    lines.push(`  - Sleep quality: ${score?.components?.sleepQuality?.value ?? "—"}`);
    lines.push(`  - Temp deviation: ${score?.components?.tempDeviation?.value ?? "—"}`);
    lines.push("");
  }

  // Oura metrics
  lines.push("## Oura Metrics (most recent)");
  if (todayReadiness) {
    lines.push(`- Oura readiness: ${todayReadiness.score}`);
    if (todayReadiness.temperatureDeviation != null)
      lines.push(`- Body temp deviation: ${todayReadiness.temperatureDeviation.toFixed(2)}°C`);
    if (todayReadiness.restingHeartRate != null)
      lines.push(`- Resting HR contributor: ${todayReadiness.restingHeartRate}`);
  }
  if (todaySleep) {
    const hrs = todaySleep.totalSleepDuration ? (todaySleep.totalSleepDuration / 3600).toFixed(1) : "—";
    lines.push(`- Sleep: ${hrs}h total, ${todaySleep.sleepEfficiency ?? "—"}% efficiency`);
    if (todaySleep.deepSleepDuration) lines.push(`  - Deep: ${(todaySleep.deepSleepDuration / 60).toFixed(0)}min`);
    if (todaySleep.remSleepDuration) lines.push(`  - REM: ${(todaySleep.remSleepDuration / 60).toFixed(0)}min`);
    if (todaySleep.averageHrv) lines.push(`- Overnight HRV: ${todaySleep.averageHrv} ms`);
  }
  if (todayStress?.daySummary) lines.push(`- Stress summary: ${todayStress.daySummary}`);
  if (todayActivity) {
    lines.push(`- Activity: ${todayActivity.totalCalories ?? "—"} cal burned total, ${todayActivity.activeCalories ?? "—"} active, ${todayActivity.steps ?? "—"} steps`);
  }

  // HRV CV for overreaching signal
  const hrvValues = recentSleep.map((s) => s.averageHrv).filter((v): v is number => v != null);
  if (hrvValues.length >= 5) {
    const cv = hrvCV(hrvValues);
    if (cv != null) {
      lines.push(`- 14-day HRV CV: ${cv.toFixed(1)}%${cv > 8 ? " (ELEVATED — possible overreaching per Flatt & Esco 2016)" : ""}`);
    }
  }
  lines.push("");

  // Cycle phase
  if (phaseLog) {
    const guidance = cyclePhaseGuidance(phaseLog.phase);
    lines.push("## Cycle Phase");
    lines.push(`- Current phase: ${phaseLog.phase}`);
    if (guidance) {
      lines.push(`- Guidance: ${guidance.note}`);
      if (guidance.aclWarning) lines.push(`- ⚠ ACL injury risk elevated (Hewett 2007)`);
      if (guidance.volumeMod < 1) lines.push(`- Volume adjustment: ${Math.round((1 - guidance.volumeMod) * 100)}% reduction recommended`);
    }
    lines.push("");
  }

  // Training / Volume
  const muscleSets: Record<string, number> = {};
  for (const group of Object.keys(volumeZones)) muscleSets[group] = 0;
  for (const set of weekSets) {
    const contributions = compoundContributions[set.exercise.name] ?? [set.exercise.muscleGroup];
    for (const mg of contributions) {
      if (muscleSets[mg] !== undefined) muscleSets[mg] += 1;
    }
  }
  const groupsWithSets = Object.entries(muscleSets).filter(([, n]) => n > 0);

  lines.push("## Training (This Week)");
  if (groupsWithSets.length === 0) {
    lines.push("- No workouts logged this week");
  } else {
    for (const [group, sets] of groupsWithSets) {
      const zone = volumeZones[group];
      let status = "";
      if (sets < zone.mev) status = " (below MEV)";
      else if (sets >= zone.mrv) status = " (AT/ABOVE MRV — deload signal)";
      else if (sets >= zone.mav[0] && sets <= zone.mav[1]) status = " (in MAV — optimal)";
      lines.push(`- ${group}: ${sets} sets${status}`);
    }
  }

  // Last workout
  if (recentSessions.length > 0) {
    const last = recentSessions[0];
    lines.push(`- Last workout: ${last.templateName ?? "Freestyle"} on ${last.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    if (last.sessionVolume != null) lines.push(`  - Total volume: ${Math.round(last.sessionVolume)}`);
    if (last.sessionRPE != null) lines.push(`  - Session RPE: ${last.sessionRPE}/10`);
    // Top compound lift e1RM
    const compoundSets = (last.sets ?? []).filter((s: { exercise?: { name: string }; weight: number; reps: number }) => ["Back Squat", "Bench Press", "Deadlift", "Overhead Press"].includes(s.exercise?.name ?? ""));
    for (const s of compoundSets) {
      lines.push(`  - ${s.exercise?.name}: ${s.weight} × ${s.reps} (e1RM ≈ ${Math.round(estimate1RM(s.weight, s.reps))})`);
    }
  }
  lines.push("");

  // Nutrition
  lines.push("## Today's Nutrition");
  if (!todayNutrition) {
    lines.push("- No food logged yet today");
  } else {
    lines.push(`- Calories: ${Math.round(todayNutrition.calories)}`);
    lines.push(`- Protein: ${Math.round(todayNutrition.protein)}g`);
    lines.push(`- Carbs: ${Math.round(todayNutrition.carbs)}g · Fat: ${Math.round(todayNutrition.fat)}g`);

    // Protein target + TDEE
    const weightKg = weightLogs[0]?.weightKg ?? profile?.bodyWeightKg;
    if (weightKg) {
      const pTarget = proteinTarget(weightKg);
      lines.push(`- Protein target (1.6 g/kg Morton 2018): ${pTarget}g — ${Math.round((todayNutrition.protein / pTarget) * 100)}% hit`);
    }
    if (profile && weightKg) {
      const tdee = totalDailyEnergyExpenditure({
        weightKg,
        heightCm: profile.heightCm,
        age: profile.age,
        sex: profile.sex,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
        targetWeightKg: profile.targetWeightKg,
      });
      if (tdee) {
        const goalCal = goalCalories(tdee, profile.goal);
        lines.push(`- TDEE: ${tdee} kcal · Goal intake (${profile.goal}): ${goalCal} kcal`);
      }
      // Energy availability
      const bf = weightLogs[0]?.bodyFatPct ?? profile.bodyFatPct;
      if (bf) {
        const ffm = ffmFromBodyComposition(weightKg, bf);
        const exerciseCals = todayActivity?.activeCalories ?? 300;
        const ea = computeEA(todayNutrition.calories, exerciseCals, ffm);
        if (ea != null) {
          lines.push(`- Energy availability: ${ea.toFixed(1)} kcal/kg FFM${ea < 30 ? " (LOW — Loucks 2011 threshold breached)" : ""}`);
        }
      }
    }

    // Per-meal protein
    const perMeal = new Map<string, number>();
    for (const e of todayNutrition.entries) {
      perMeal.set(e.mealType, (perMeal.get(e.mealType) ?? 0) + e.protein);
    }
    if (perMeal.size > 0) {
      const pm = Array.from(perMeal.entries()).map(([t, p]) => `${t}: ${Math.round(p)}g`).join(", ");
      lines.push(`- Per meal protein: ${pm}`);
    }
  }
  lines.push("");

  // Weight trend
  if (weightLogs.length > 0) {
    const latest = weightLogs[0];
    const trend = weightTrendDirection(weightLogs.map((l) => ({ day: l.day, weightKg: l.weightKg })));
    lines.push("## Weight Trend");
    lines.push(`- Latest: ${latest.weightKg.toFixed(1)} kg (${kgToLb(latest.weightKg)} lb) on ${latest.day.toLocaleDateString()}`);
    if (trend) lines.push(`- 7-day trend: ${trend}`);
    if (weightLogs.length >= 7) {
      const recent7 = weightLogs.slice(0, 7).reduce((s, l) => s + l.weightKg, 0) / 7;
      lines.push(`- 7-day avg: ${recent7.toFixed(1)} kg`);
    }
    lines.push("");
  }

  // Active Mind Mode experiments
  if (activeExperiments.length > 0) {
    lines.push("## Active Experiments");
    for (const exp of activeExperiments) {
      lines.push(`- "${exp.title}" — ${exp._count.logs} days logged, testing: ${exp.independentVariable} → ${exp.dependentVariable}`);
    }
    lines.push("");
  }

  // Recent insights
  try {
    const insights = await generateInsights();
    const significant = insights.filter((i) => i.significance !== "not_significant").slice(0, 5);
    if (significant.length > 0) {
      lines.push("## Recent Insights (passive correlations)");
      for (const ins of significant) {
        lines.push(`- "${ins.tag}" correlates with ${ins.percentDiff}% ${ins.direction} ${ins.metricLabel} (p=${ins.pValue}, n=${ins.taggedN})`);
      }
      lines.push("");
    }
  } catch {
    // Insights may fail if no tags yet
  }

  // Active goals
  if (goals.length > 0) {
    lines.push("## Active Goals");
    for (const g of goals) {
      const deadline = g.deadline
        ? ` — deadline ${g.deadline.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
        : "";
      const daysUntil = g.deadline
        ? ` (${Math.ceil((g.deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days away)`
        : "";
      lines.push(`- [${g.type}] ${g.title}${g.target ? ` → ${g.target}` : ""}${deadline}${daysUntil}`);
      if (g.notes) lines.push(`  notes: ${g.notes}`);
    }
    lines.push("");
  }

  return lines.join("\n");
  } catch (error) {
    console.error("buildCoachContext failed:", error);
    return "# User State\n\nContext unavailable — some data queries failed. Advise based on the conversation history.\n";
  }
}

export const COACH_SYSTEM_PROMPT = `You are **Baseline Coach**, a science-backed personal performance advisor embedded in the user's self-tracking application. You have full, real-time access to the user's biometric, training, nutrition, cycle, and goal data — this is not a generic chatbot, you are advising based on their actual state.

# Core Principles

1. **Be specific and actionable.** Don't give generic wellness advice. Use the user's exact numbers. Reference the data they have.
2. **Be concise.** Short paragraphs, bullet points for recommendations, bold the key action.
3. **Cite the research** when it supports a recommendation. You are grounded in peer-reviewed sports science.
4. **Handle competing priorities** by synthesizing across domains (training + recovery + nutrition + cycle + external goals like exams/races).
5. **Never override the user's autonomy.** They are the athlete. Offer the best-informed recommendation and let them decide.

# Research Foundation

## Recovery & Readiness
- **HRV (Plews 2013):** 7-day rolling avg of Ln RMSSD is the standard. Single-day readings are noisy. Values > 1 SD below baseline for 2+ days = accumulated fatigue.
- **HRV CV (Flatt & Esco 2016):** Elevated day-to-day variability over 2-3 weeks signals non-functional overreaching even before absolute HRV drops.
- **Sleep (Lamon 2021):** One night of total sleep deprivation reduces muscle protein synthesis 18%, raises cortisol 21%. Deep sleep target: 1.5-2h/night.

## Progressive Overload
- **Volume (Schoenfeld 2017, Israetel 2021):** ~0.37% muscle mass per additional weekly set. MEV/MAV/MRV landmarks: Quads 8/12-18/22, Back 8/12-18/22, Chest 8/12-18/22. Beyond MRV = overreaching.
- **Frequency (Schoenfeld 2016):** 2x/week per muscle group beats 1x when volume equated. Diminishing returns beyond 2x.
- **Autoregulation hierarchy (2025 meta-analysis):** APRE > velocity > RPE > percentage-based for strength gains. RPE 6-8 for hypertrophy, 8-9 for strength.
- **Deload (Pritchard 2024):** 5-6 week cycles with 1 week of 40-60% volume reduction. RPE creep at same load = reliable early overreaching marker.

## Nutrition
- **Protein target (Morton 2018):** 1.6 g/kg/day captures 95% of hypertrophy benefit. Max useful dose ~2.2 g/kg.
- **Per-meal protein (Moore 2009):** MPS maxes out at ~20-25g per meal (30g for 65+). More than 30g doesn't help.
- **Energy availability (Loucks 2011):** Below 30 kcal/kg FFM/day impairs recovery, disrupts cycle, drops HRV 10-20%. This is a hard floor.
- **Timing (Schoenfeld 2013):** The "anabolic window" is 4-6 hours. Daily total matters more than timing.

## Cycle Phase (Female Athletes)
- **Follicular (days 6-13):** Peak performance window. Estrogen supports strength and neural output. Push intensity and volume.
- **Ovulation (days 14-16):** High power BUT **3-6x higher ACL injury risk (Hewett 2007)**. Extra warm-up, controlled landings.
- **Luteal (days 17-28):** RPE runs 0.5-1 point higher at the same load (Sung 2014). Reduce volume 10-15%. Temp elevates 0.3-0.5°C — don't confuse with illness.
- **Menstrual (days 1-5):** Varies individually. Listen to readiness, not dogma.

# Response Format

- Open with the **key insight or recommendation** in one sentence.
- Then 3-6 bullet points with the specific actions, grounded in their data.
- If relevant, note the research citation in parentheses.
- Keep total response under 300 words unless they ask for detail.
- Use markdown headers only for multi-part responses (e.g., "## Training" / "## Nutrition" when answering a holistic question).

When the user has competing priorities (exam + training, cutting + bulking, race prep + cycle timing), **explicitly weigh the trade-offs using their data** rather than hedging.`;
