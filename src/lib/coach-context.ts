import { prisma } from "./db";
import { getLocalDay } from "./date-utils";
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
import { currentBlock } from "./hyrox-blocks";
import { computePaceBudget, formatKmPace, formatClockTime, paceDelta } from "./hyrox-pace";
import { maybeArchivePlan } from "./hyrox-archive";

// ---- 2A: Goal Lens Types ----

/**
 * Defines section ordering and annotation based on goal type.
 * Sections listed first appear first in the context window.
 * Claude attends more reliably to content near the beginning,
 * so ordering IS the weighting mechanism.
 */
interface GoalLens {
  type: string;
  sectionOrder: string[];
  coachingFrame: string;
}

// Priority table for all goal types (docs/goal-coach-redesign-spec.md §4.2):
// race/hyrox:  hyrox_plan → hyrox_pace_gap → readiness → recent_workouts → weekly_volume → cycle → nutrition
// race/other:  vo2max → running_metrics → zones → body_comp → sleep → nutrition → strength
// strength:    volume_e1rm → sleep_deep → protein → rpe_trends → body_comp → running
// cognitive:   sleep_deep_rem → stress_recovery → hrv → training_load → nutrition
// weight:      nutrition → body_comp → energy_availability → sleep → training_load
// health:      sleep → hrv → stress → nutrition → activity
// custom:      readiness → sleep → nutrition → training_load → body_comp

const goalLenses: Record<string, GoalLens> = {
  race: {
    type: "race",
    sectionOrder: [
      "primary_focus",
      "readiness",
      "running_cardio",
      "vo2max",
      "hr_zones",
      "apple_watch_workouts",
      "nutrition",
      "sleep",
      "oura_metrics",
      "weight_trend",
      "cycle_phase",
      "training",
      "resilience",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for race performance. Running volume, aerobic fitness, and fueling strategy are the priority. Consider strength only as it supports race readiness.",
  },
  race_hyrox: {
    type: "race",
    sectionOrder: [
      "primary_focus",
      "hyrox_plan",
      "hyrox_pace_gap",
      "readiness",
      "training",
      "apple_watch_workouts",
      "cycle_phase",
      "nutrition",
      "sleep",
      "oura_metrics",
      "weight_trend",
      "running_cardio",
      "vo2max",
      "resilience",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for Hyrox race performance. Running is ~60% of race time (Brandt 2025); station efficiency and transitions determine finish position. Use the Hyrox plan block, pace budget, and recent session data for specific guidance.",
  },
  strength: {
    type: "strength",
    sectionOrder: [
      "primary_focus",
      "readiness",
      "training",
      "oura_metrics",
      "nutrition",
      "sleep",
      "weight_trend",
      "cycle_phase",
      "resilience",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for strength and hypertrophy. Volume load progression, recovery capacity, and protein intake are the priority.",
  },
  physique: {
    type: "physique",
    sectionOrder: [
      "primary_focus",
      "readiness",
      "training",
      "nutrition",
      "weight_trend",
      "sleep",
      "oura_metrics",
      "cycle_phase",
      "resilience",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for body composition. Volume balance across muscle groups, protein distribution, and body composition trends are the priority.",
  },
  cognitive: {
    type: "cognitive",
    sectionOrder: [
      "primary_focus",
      "sleep",
      "readiness",
      "resilience",
      "oura_metrics",
      "experiments",
      "nutrition",
      "goals",
      "training",
      "weight_trend",
      "cycle_phase",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "spo2",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for cognitive performance. Sleep quality, stress recovery, and mental freshness are the priority. Physical training should support — not compete with — cognitive goals. Marcora (2009): mental fatigue reduces endurance by ~15%; the reverse also applies.",
  },
  weight: {
    type: "weight",
    sectionOrder: [
      "primary_focus",
      "nutrition",
      "weight_trend",
      "readiness",
      "oura_metrics",
      "sleep",
      "training",
      "cycle_phase",
      "resilience",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for body weight management. Energy balance, protein intake, and weight trend are the priority. HRV depression during caloric deficit is normal (Altini 2022) — distinguish from overtraining.",
  },
  health: {
    type: "health",
    sectionOrder: [
      "primary_focus",
      "oura_metrics",
      "sleep",
      "readiness",
      "resilience",
      "spo2",
      "experiments",
      "sessions",
      "nutrition",
      "training",
      "weight_trend",
      "cycle_phase",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "goals",
      "bedtime",
    ],
    coachingFrame: "Optimize for the user's health target. Biometric trends, lifestyle experiments, and recovery metrics are the priority.",
  },
};

const defaultSectionOrder = [
  "primary_focus", "readiness", "oura_metrics", "cycle_phase", "training",
  "nutrition", "weight_trend", "running_cardio", "vo2max", "apple_watch_workouts",
  "sleep", "resilience", "spo2", "experiments", "goals", "sessions", "bedtime",
];

// ---- 2D: Tradeoff Detection ----

interface Tradeoff {
  severity: "info" | "warning" | "critical";
  message: string;
}

export function detectTradeoffs(
  goals: Array<{ id: string; type: string; subtype: string | null; title: string; deadline: Date | null }>,
  context: {
    energyAvailability: number | null;
    readinessScore: number | null;
    cyclePhase: string | null;
    hrvCv: number | null;
    weeklyRunningKm: number | null;
    calorieBalance: number | null;
  }
): Tradeoff[] {
  const tradeoffs: Tradeoff[] = [];
  const activeGoals = goals.filter((g) => g.type !== "custom");

  // 1. DEFICIT + HIGH TRAINING VOLUME
  const weightCut = activeGoals.find((g) => g.subtype === "cut");
  const raceGoal = activeGoals.find((g) => g.type === "race");
  if (weightCut && raceGoal && context.energyAvailability != null && context.energyAvailability < 35) {
    tradeoffs.push({
      severity: context.energyAvailability < 30 ? "critical" : "warning",
      message: `Cutting weight while training for ${raceGoal.title}. EA is ${context.energyAvailability.toFixed(0)} kcal/kg FFM${context.energyAvailability < 30 ? " — BELOW the 30 threshold (Loucks 2011)" : " — approaching the 30 threshold"}. Suggest reducing deficit or adding rest.`,
    });
  }

  // 2. EXAM + HEAVY TRAINING on low readiness
  const cogGoal = activeGoals.find((g) => g.type === "cognitive");
  if (cogGoal?.deadline) {
    const daysToExam = Math.ceil((cogGoal.deadline.getTime() - Date.now()) / 86400000);
    if (daysToExam > 0 && daysToExam <= 5 && context.readinessScore != null && context.readinessScore < 70) {
      tradeoffs.push({
        severity: "critical",
        message: `${cogGoal.title} is ${daysToExam} days away and readiness is ${context.readinessScore} (yellow). Heavy training competes for the same recovery resources the brain needs. Suggest light movement only until the exam.`,
      });
    }
  }

  // 3. CONCURRENT STRENGTH + ENDURANCE (interference effect)
  const strengthGoal = activeGoals.find((g) => g.type === "strength" || g.type === "physique");
  if (raceGoal && strengthGoal) {
    tradeoffs.push({
      severity: "info",
      message: `Training for ${raceGoal.title} and ${strengthGoal.title} simultaneously. Concurrent training interference (Hickson 1980) may limit strength gains after ~8 weeks. Prioritize one domain and maintain the other.`,
    });
  }

  // 4. OVERREACHING SIGNALS
  if (context.hrvCv != null && context.hrvCv > 10) {
    tradeoffs.push({
      severity: "warning",
      message: `HRV CV is ${context.hrvCv.toFixed(1)}% (elevated). Flatt & Esco (2016): sustained high HRV variability over 2-3 weeks signals non-functional overreaching. Consider deloading regardless of current program week.`,
    });
  }

  // 5. LUTEAL PHASE + UPCOMING RACE
  if (context.cyclePhase === "luteal" && raceGoal?.deadline) {
    const daysToRace = Math.ceil((raceGoal.deadline.getTime() - Date.now()) / 86400000);
    if (daysToRace > 0 && daysToRace <= 14) {
      tradeoffs.push({
        severity: "info",
        message: `Race in ${daysToRace} days during luteal phase. RPE +0.5-1 at same intensity (Sung 2014). Core temp +0.3-0.5°C impairs thermoregulation. Practice hydration and pacing strategy.`,
      });
    }
  }

  return tradeoffs;
}

// ---- 2C: Dynamic System Prompt Section ----

export function goalSystemPromptSection(goal: {
  type: string;
  subtype: string | null;
  title: string;
  target: string | null;
  deadline: Date | string | null;
} | null): string {
  if (!goal) return "";

  const deadlineStr = goal.deadline
    ? new Date(goal.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "not set";

  const lensMap: Record<string, string> = {
    race: `\n# Active Coaching Focus: Race Preparation
You are coaching the user through race preparation for their ${goal.subtype ?? "race"}.
Target: ${goal.target ?? "finish strong"}. Deadline: ${deadlineStr}.

Prioritize: aerobic fitness progression (VO2max trend, running volume), running economy (GCT, vertical oscillation), race-specific preparation, fueling strategy (carbs 6-10 g/kg on hard days), taper timing.
Always consider: recovery status, injury risk, sleep quality, cycle phase effects on endurance and thermoregulation.
When other goals conflict with race prep, frame the tradeoff explicitly and recommend what protects race performance.
${goal.subtype === "hyrox" ? "\nHyrox-specific: Running = ~60% of race time (Brandt 2025). Functional strength for stations (sled push/pull, wall balls, lunges) is secondary but determines finish position. Monitor concurrent training interference (Hickson 1980). Cardio recovery between stations is a key differentiator.\nYou have access to the full Hyrox plan including current block, pace budget, and recent session types. When asked about race readiness, quote numbers from '## Hyrox Race Plan' and '## Hyrox Pace Gap' directly rather than hedging." : ""}`,

    strength: `\n# Active Coaching Focus: Strength Training
You are coaching the user through a strength training block.
Target: ${goal.target ?? "get stronger"}. Deadline: ${deadlineStr}.

Prioritize: progressive overload (volume load per muscle vs MEV/MAV/MRV), estimated 1RM trends on primary lifts, RPE trend analysis (creep = overreaching), protein intake vs 1.6 g/kg target (Morton 2018), deload timing (every 5-6 weeks per Pritchard 2024).
Always consider: sleep quality (deep sleep → GH → MPS), cycle phase (follicular = PR window, ovulation = ACL caution per Hewett 2007), energy availability.
When other goals conflict, protect training stimulus and recovery first.`,

    physique: `\n# Active Coaching Focus: Physique / Body Composition
You are coaching the user toward a physique goal.
Target: ${goal.target ?? "optimize body composition"}. Deadline: ${deadlineStr}.

Prioritize: per-muscle-group volume balance against MEV/MAV/MRV landmarks, protein distribution across meals (20-25g per meal minimum per Moore 2009), body composition trend, training split adherence.
Always consider: energy availability (EA > 30 kcal/kg FFM), cycle phase effects on water retention and perceived progress.`,

    cognitive: `\n# Active Coaching Focus: Cognitive Performance
You are coaching the user through a cognitive performance period (studying/exams).
Target: ${goal.target ?? "peak mental performance"}. Deadline: ${deadlineStr}.

Prioritize: sleep quality — especially deep sleep for declarative memory consolidation and REM for procedural learning (Walker 2017). Monitor stress/recovery balance. Use HRV as a cognitive readiness proxy. Reference active Mind Mode experiments related to focus and learning. Flag caffeine timing (no caffeine after 2pm for sleep protection).
Always consider: training load competing for recovery resources. Marcora (2009): mental fatigue reduces endurance by ~15% — the reverse also applies. Physical exhaustion impairs studying. Lieberman (2005): cognitive performance degrades before physical performance under sleep deprivation.
Physical training recommendations should SUPPORT cognitive performance, not compete with it. On days before exams, prefer light movement over intense training.`,

    weight: `\n# Active Coaching Focus: Weight Management
You are coaching the user through a body composition change (${goal.subtype ?? "weight goal"}).
Target: ${goal.target ?? "optimize body weight"}. Deadline: ${deadlineStr}.

Prioritize: daily energy balance (intake vs expenditure), protein intake (maintain 1.6 g/kg even in deficit), weight trend (use 7-day rolling average, ignore daily fluctuations), energy availability calculation.
CRITICAL: HRV depression during caloric deficit is a NORMAL physiological response (Altini 2022), NOT a sign of overtraining. Distinguish diet-induced HRV dips from genuine training overload by checking whether the user is in a deficit.
${goal.subtype === "cut" ? "Cut-specific: EA must stay above 30 kcal/kg FFM (Loucks 2011). Rate of loss should be 0.5-1% BW/week max to preserve muscle. Flag if faster than that." : ""}
${goal.subtype === "bulk" ? "Bulk-specific: Target surplus of 300-500 kcal/day. Track whether weight gain accompanies strength increases (muscle) or just scale movement." : ""}
Protect training volume to maintain/build muscle during the weight change.`,

    health: `\n# Active Coaching Focus: Health Optimization
You are coaching the user toward a health baseline goal.
Target: ${goal.target ?? "improve baseline health metrics"}. Deadline: ${deadlineStr}.

Prioritize: the specific metric being targeted (HRV trend, sleep architecture, stress/recovery ratio), environment sensor data (bedroom temp, PM2.5, noise, light), Mind Mode experiments, recovery sessions (meditation, breathing).
Frame all training and nutrition advice through the lens of whether it supports or undermines the health target.`,
  };

  return lensMap[goal.type] ?? "";
}

// ---- Hyrox Section Builders ----

function buildHyroxPlanSection(
  plan: {
    raceDate: Date;
    targetTime: number;
    startDate: Date;
    accumulationDays: number;
    transmutationDays: number;
    realizationDays: number;
    taperDays: number;
    weeklyRunHours: number;
    weeklyStrengthHours: number;
    weeklyCompromisedHours: number;
  },
  today: Date,
  phaseLog: { day: Date; phase: string } | null,
  cycleStartDay: Date | null,
): string[] {
  const lines: string[] = [];
  lines.push("## Hyrox Race Plan");

  const blk = currentBlock(plan, today);

  lines.push(`- Race date: ${plan.raceDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`);
  lines.push(`- Days to race: ${blk.daysToRace}`);
  lines.push(`- Target time: ${formatClockTime(plan.targetTime)}`);
  lines.push(`- Current block: ${blk.block} (week ${blk.weekInBlock})`);
  lines.push(`- Block multipliers: volume ${blk.volumeMultiplier}×, intensity ${blk.intensityMultiplier}×`);
  lines.push(`- Weekly hours: run ${plan.weeklyRunHours}h, strength ${plan.weeklyStrengthHours}h, compromised ${plan.weeklyCompromisedHours}h`);

  // Cycle phase — only if a log exists within 35 days
  if (phaseLog) {
    const phaseAgeDays = Math.round(
      (today.getTime() - new Date(phaseLog.day).getTime()) / 86400000,
    );
    if (phaseAgeDays <= 35) {
      let cycleDayStr = "";
      if (cycleStartDay) {
        const dayNum =
          Math.round(
            (today.getTime() - new Date(cycleStartDay).getTime()) / 86400000,
          ) + 1;
        cycleDayStr = ` (day ${dayNum})`;
      }

      const phase = phaseLog.phase;
      let guidance = "";
      if (phase === "luteal") {
        guidance = " — RPE may read +1 higher than true effort";
      } else if (phase === "follicular") {
        guidance = " — peak performance window";
      } else if (phase === "ovulation") {
        guidance = " — high power but ACL caution (Hewett 2007)";
      } else if (phase === "menstrual") {
        guidance = " — listen to readiness";
      }

      lines.push(`- Cycle phase: ${phase}${cycleDayStr}${guidance}`);
    }
  }

  return lines;
}

function buildHyroxPaceGapSection(
  plan: { targetTime: number },
  recentSessions: Array<{
    day: Date;
    intervalsJson: string | null;
    sessionType: string;
  }>,
): string[] {
  const lines: string[] = [];
  const budget = computePaceBudget(plan.targetTime);

  lines.push("## Hyrox Pace Gap");
  lines.push(
    `- Target km pace: ${formatKmPace(budget.kmPaceSeconds)}/km (${budget.kmPaceSeconds}s)`,
  );
  lines.push(
    `- Run budget: ${formatClockTime(budget.runSeconds)} | Station budget: ${formatClockTime(budget.stationSeconds)} | Transitions: ${formatClockTime(budget.transitionSeconds)}`,
  );

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const withIntervals = recentSessions.filter(
    (s) => s.intervalsJson && new Date(s.day) >= fourteenDaysAgo,
  );

  if (withIntervals.length > 0) {
    lines.push("- Recent interval sessions:");
    for (const session of withIntervals) {
      try {
        const intervals = JSON.parse(session.intervalsJson!) as Array<{
          runMeters?: number;
          runSeconds?: number;
        }>;
        const runIntervals = intervals.filter(
          (i) => i.runMeters && i.runSeconds && i.runMeters > 0,
        );
        if (runIntervals.length === 0) continue;

        const totalMeters = runIntervals.reduce(
          (s, i) => s + (i.runMeters ?? 0),
          0,
        );
        const totalSeconds = runIntervals.reduce(
          (s, i) => s + (i.runSeconds ?? 0),
          0,
        );
        const avgKmPace =
          totalMeters > 0 ? (totalSeconds / totalMeters) * 1000 : 0;

        const delta = paceDelta(avgKmPace, budget.kmPaceSeconds);
        const sign = delta.deltaSeconds >= 0 ? "+" : "";
        const dateStr = new Date(session.day).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        lines.push(
          `  - ${dateStr} (${session.sessionType}): avg ${formatKmPace(avgKmPace)}/km vs budget ${formatKmPace(budget.kmPaceSeconds)}/km (${sign}${delta.deltaSeconds}s, ${delta.onPace ? "on pace" : `${sign}${(delta.pctOff * 100).toFixed(0)}%`})`,
        );
      } catch {
        // Skip malformed intervalsJson
      }
    }
  }

  return lines;
}

// ---- 2B: Refactored buildCoachContext ----

/**
 * Aggregates the user's current state into a structured context block
 * that gets injected into every coach conversation. The goal is to give
 * Claude full situational awareness so it can give specific, data-driven
 * advice instead of generic wellness tips.
 *
 * When a focusGoalId is provided, sections are reordered based on the
 * goal's lens so the most relevant data appears first in context.
 */
export async function buildCoachContext(focusGoalId?: string | null): Promise<string> {
  try {
  const now = new Date();
  const localToday = getLocalDay();

  // BUG-006 fix: use Promise.allSettled so partial failures don't crash the whole context
  function val<T>(r: PromiseSettledResult<T>, fallback: T): T {
    return r.status === "fulfilled" ? r.value : fallback;
  }

  const results = await Promise.allSettled([
    getScoreForDate(localToday),                                    // 0
    prisma.dailyReadiness.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),                                                              // 1
    prisma.dailySleep.findFirst({
      where: { day: { lte: localToday }, totalSleepDuration: { not: null } },
      orderBy: { day: "desc" },
    }),                                                              // 2
    prisma.dailyStress.findFirst({
      where: { day: { lte: localToday }, daySummary: { not: null } },
      orderBy: { day: "desc" },
    }),                                                              // 3
    prisma.dailyActivity.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),                                                              // 4
    prisma.cyclePhaseLog.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),                                                              // 5
    prisma.dailySleep.findMany({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
      take: 14,
    }),                                                              // 6
    prisma.nutritionLog.findUnique({
      where: { day: localToday },
      include: { entries: true },
    }),                                                              // 7
    prisma.workoutSession.findMany({
      orderBy: { date: "desc" },
      take: 3,
      include: {
        sets: {
          where: { isWarmup: false },
          include: { exercise: { select: { name: true, muscleGroup: true } } },
        },
      },
    }),                                                              // 8
    prisma.workoutSet.findMany({
      where: {
        isWarmup: false,
        session: { date: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      },
      include: { exercise: true },
    }),                                                              // 9
    prisma.weightLog.findMany({
      orderBy: { day: "desc" },
      take: 14,
    }),                                                              // 10
    prisma.userProfile.findUnique({ where: { id: 1 } }),            // 11
    prisma.experiment.findMany({
      where: { status: { in: ["active", "analyzed"] } },
      include: { _count: { select: { logs: true } } },
    }),                                                              // 12
    prisma.goal.findMany({
      where: { status: "active" },
      orderBy: { deadline: "asc" },
    }),                                                              // 13
    // HealthKit / Apple Watch
    prisma.healthKitWorkout.findMany({
      where: { startedAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      orderBy: { startedAt: "desc" },
    }),                                                              // 14
    // Oura Expansion
    prisma.dailySpO2.findMany({
      where: { day: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      orderBy: { day: "desc" },
    }),                                                              // 15
    prisma.dailyResilience.findMany({
      where: { day: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      orderBy: { day: "desc" },
    }),                                                              // 16
    prisma.dailyVO2Max.findMany({
      where: { day: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) } },
      orderBy: { day: "desc" },
      take: 10,
    }),                                                              // 17
    prisma.ouraSession.findMany({
      where: { day: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
      orderBy: { startedAt: "desc" },
    }),                                                              // 18
    prisma.sleepTimeRecommendation.findFirst({
      orderBy: { day: "desc" },
    }),                                                              // 19
    // Apple Watch running metrics
    prisma.dailyRunningMetrics.findFirst({
      where: { day: { lte: localToday } },
      orderBy: { day: "desc" },
    }),                                                              // 20
    // 2F: Archived goals for pattern recall
    prisma.goal.findMany({
      where: { status: "archived" },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),                                                              // 21
  ]);

  const score = val(results[0], null);
  const todayReadiness = val(results[1], null);
  const todaySleep = val(results[2], null);
  const todayStress = val(results[3], null);
  const todayActivity = val(results[4], null);
  const phaseLog = val(results[5], null);
  const recentSleep = val(results[6], [] as Array<{ averageHrv: number | null; totalSleepDuration?: number | null }>);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appleWatchWorkouts = val(results[14], []) as any[];
  // Oura Expansion
  const spo2Data = val(results[15], []) as Array<{ day: Date; avgSpO2: number | null }>;
  const resilienceData = val(results[16], []) as Array<{ day: Date; level: string; sleepRecovery: number | null; daytimeRecovery: number | null; stress: number | null }>;
  const vo2MaxData = val(results[17], []) as Array<{ day: Date; vo2Max: number | null }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionsData = val(results[18], []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bedtimeRec = val(results[19], null) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestRunning = val(results[20], null) as any;
  // 2F: archived goals
  const archivedGoals = val(results[21], []) as Array<{ id: string; type: string; subtype: string | null; title: string; target: string | null; notes: string | null; updatedAt: Date }>;

  // ---- Build named sections ----
  const sections = new Map<string, string[]>();

  function addSection(key: string, lines: string[]) {
    if (lines.length > 0) {
      sections.set(key, lines);
    }
  }

  // Store computed values for tradeoff detection
  let computedEA: number | null = null;
  let computedHrvCv: number | null = null;

  // --- Profile (always first, outside ordering) ---
  const profileLines: string[] = [];
  if (profile) {
    profileLines.push("## Profile");
    const weightKg = weightLogs[0]?.weightKg ?? profile.bodyWeightKg;
    if (weightKg) {
      profileLines.push(`- Weight: ${weightKg.toFixed(1)} kg (${kgToLb(weightKg)} lb)`);
    }
    if (profile.bodyFatPct) profileLines.push(`- Body fat: ${profile.bodyFatPct}%`);
    if (profile.heightCm) profileLines.push(`- Height: ${profile.heightCm} cm`);
    if (profile.age) profileLines.push(`- Age: ${profile.age}`);
    if (profile.sex) profileLines.push(`- Sex: ${profile.sex}`);
    profileLines.push(`- Activity level: ${profile.activityLevel}`);
    profileLines.push(`- Experience: ${profile.experienceLevel}`);
    profileLines.push(`- Current goal: ${profile.goal}${profile.targetWeightKg ? ` (target ${profile.targetWeightKg} kg)` : ""}`);
  }
  addSection("profile", profileLines);

  // --- Readiness ---
  const readinessLines: string[] = [];
  if (score) {
    const tier = readinessTier(score.overall);
    readinessLines.push("## Today's Readiness");
    readinessLines.push(`- Baseline Score: ${score.overall}/100 (${score.label})`);
    readinessLines.push(`- Training tier: ${tier.tier.toUpperCase()} — ${tier.recommendation}`);
    readinessLines.push(`- Volume mod: ${Math.round(tier.volumeMod * 100)}% · Intensity mod: ${Math.round(tier.intensityMod * 100)}%`);
    readinessLines.push(`- Components:`);
    readinessLines.push(`  - Readiness: ${score?.components?.readiness?.value ?? "—"}`);
    readinessLines.push(`  - HRV trend: ${score?.components?.hrvTrend?.value ?? "—"}`);
    readinessLines.push(`  - Sleep quality: ${score?.components?.sleepQuality?.value ?? "—"}`);
    readinessLines.push(`  - Temp deviation: ${score?.components?.tempDeviation?.value ?? "—"}`);
  }
  addSection("readiness", readinessLines);

  // --- Oura Metrics (brief sleep summary only — detail in sleep section) ---
  const ouraLines: string[] = [];
  ouraLines.push("## Oura Metrics (most recent)");
  if (todayReadiness) {
    ouraLines.push(`- Oura readiness: ${todayReadiness.score}`);
    if (todayReadiness.temperatureDeviation != null)
      ouraLines.push(`- Body temp deviation: ${todayReadiness.temperatureDeviation.toFixed(2)}°C`);
    if (todayReadiness.restingHeartRate != null)
      ouraLines.push(`- Resting HR contributor: ${todayReadiness.restingHeartRate}`);
  }
  if (todaySleep) {
    const hrs = todaySleep.totalSleepDuration ? (todaySleep.totalSleepDuration / 3600).toFixed(1) : "—";
    ouraLines.push(`- Sleep: ${hrs}h total, ${todaySleep.sleepEfficiency ?? "—"}% efficiency`);
  }
  if (todayStress?.daySummary) ouraLines.push(`- Stress summary: ${todayStress.daySummary}`);
  if (todayActivity) {
    ouraLines.push(`- Activity: ${todayActivity.totalCalories ?? "—"} cal burned total, ${todayActivity.activeCalories ?? "—"} active, ${todayActivity.steps ?? "—"} steps`);
  }

  // HRV CV for overreaching signal
  const hrvValues = recentSleep.map((s) => s.averageHrv).filter((v): v is number => v != null);
  if (hrvValues.length >= 5) {
    const cv = hrvCV(hrvValues);
    if (cv != null) {
      computedHrvCv = cv;
      ouraLines.push(`- 14-day HRV CV: ${cv.toFixed(1)}%${cv > 8 ? " (ELEVATED — possible overreaching per Flatt & Esco 2016)" : ""}`);
    }
  }
  // Only add if we have any data beyond the header
  if (ouraLines.length > 1) {
    addSection("oura_metrics", ouraLines);
  }

  // --- Sleep Detail (extracted for cognitive lens) ---
  const sleepLines: string[] = [];
  if (todaySleep) {
    sleepLines.push("## Sleep Detail");
    const hrs = todaySleep.totalSleepDuration ? (todaySleep.totalSleepDuration / 3600).toFixed(1) : "—";
    sleepLines.push(`- Total sleep: ${hrs}h`);
    sleepLines.push(`- Efficiency: ${todaySleep.sleepEfficiency ?? "—"}%`);
    if (todaySleep.deepSleepDuration) {
      const deepMin = (todaySleep.deepSleepDuration / 60).toFixed(0);
      const deepPct = todaySleep.totalSleepDuration
        ? ((todaySleep.deepSleepDuration / todaySleep.totalSleepDuration) * 100).toFixed(0)
        : "—";
      sleepLines.push(`- Deep sleep: ${deepMin}min (${deepPct}%) — target 90-120min for GH secretion (Sassin 1969)`);
    }
    if (todaySleep.remSleepDuration) {
      const remMin = (todaySleep.remSleepDuration / 60).toFixed(0);
      sleepLines.push(`- REM sleep: ${remMin}min — critical for memory consolidation (Walker 2017)`);
    }
    if (todaySleep.latency != null) {
      sleepLines.push(`- Sleep latency: ${todaySleep.latency}min${todaySleep.latency > 30 ? " (elevated — possible hyperarousal)" : ""}`);
    }
    if (todaySleep.averageHrv) sleepLines.push(`- Overnight HRV: ${todaySleep.averageHrv} ms`);
    if (todaySleep.lowestHeartRate) sleepLines.push(`- Lowest HR: ${todaySleep.lowestHeartRate} bpm`);

    // Sleep debt (7-day rolling)
    if (recentSleep.length >= 7) {
      const target = 7 * 3600; // 7 hours in seconds
      const debt = recentSleep.slice(0, 7).reduce((sum, s) => {
        const dur = (s as { totalSleepDuration?: number }).totalSleepDuration ?? 0;
        return sum + Math.max(0, target - dur);
      }, 0);
      const debtHours = (debt / 3600).toFixed(1);
      if (Number(debtHours) > 3) {
        sleepLines.push(`- 7-day sleep debt: ${debtHours}h below 7h target${Number(debtHours) > 5 ? " — SIGNIFICANT, recommend deload" : ""}`);
      }
    }
  }
  addSection("sleep", sleepLines);

  // --- Cycle Phase ---
  const cycleLines: string[] = [];
  if (phaseLog) {
    const guidance = cyclePhaseGuidance(phaseLog.phase);
    cycleLines.push("## Cycle Phase");
    cycleLines.push(`- Current phase: ${phaseLog.phase}`);
    if (guidance) {
      cycleLines.push(`- Guidance: ${guidance.note}`);
      if (guidance.aclWarning) cycleLines.push(`- ⚠ ACL injury risk elevated (Hewett 2007)`);
      if (guidance.volumeMod < 1) cycleLines.push(`- Volume adjustment: ${Math.round((1 - guidance.volumeMod) * 100)}% reduction recommended`);
    }
    const src = phaseLog.source === "healthkit" ? "auto-synced from Apple Health" : "manually logged";
    cycleLines.push(`- Source: ${src}`);
  }
  addSection("cycle_phase", cycleLines);

  // --- Training / Volume ---
  const trainingLines: string[] = [];
  const muscleSets: Record<string, number> = {};
  for (const group of Object.keys(volumeZones)) muscleSets[group] = 0;
  for (const set of weekSets) {
    const contributions = compoundContributions[set.exercise.name] ?? [set.exercise.muscleGroup];
    for (const mg of contributions) {
      if (muscleSets[mg] !== undefined) muscleSets[mg] += 1;
    }
  }
  const groupsWithSets = Object.entries(muscleSets).filter(([, n]) => n > 0);

  trainingLines.push("## Training (This Week)");
  if (groupsWithSets.length === 0) {
    trainingLines.push("- No workouts logged this week");
  } else {
    for (const [group, sets] of groupsWithSets) {
      const zone = volumeZones[group];
      let status = "";
      if (sets < zone.mev) status = " (below MEV)";
      else if (sets >= zone.mrv) status = " (AT/ABOVE MRV — deload signal)";
      else if (sets >= zone.mav[0] && sets <= zone.mav[1]) status = " (in MAV — optimal)";
      trainingLines.push(`- ${group}: ${sets} sets${status}`);
    }
  }

  // Last workout
  if (recentSessions.length > 0) {
    const last = recentSessions[0];
    trainingLines.push(`- Last workout: ${last.templateName ?? "Freestyle"} on ${last.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    if (last.sessionVolume != null) trainingLines.push(`  - Total volume: ${Math.round(last.sessionVolume)}`);
    if (last.sessionRPE != null) trainingLines.push(`  - Session RPE: ${last.sessionRPE}/10`);
    // Top compound lift e1RM
    const compoundSets = (last.sets ?? []).filter((s: { exercise?: { name: string }; weight: number; reps: number }) => ["Back Squat", "Bench Press", "Deadlift", "Overhead Press"].includes(s.exercise?.name ?? ""));
    for (const s of compoundSets) {
      trainingLines.push(`  - ${s.exercise?.name}: ${s.weight} × ${s.reps} (e1RM ≈ ${Math.round(estimate1RM(s.weight, s.reps))})`);
    }
  }
  addSection("training", trainingLines);

  // --- Nutrition ---
  const nutritionLines: string[] = [];
  nutritionLines.push("## Today's Nutrition");
  if (!todayNutrition) {
    nutritionLines.push("- No food logged yet today");
  } else {
    nutritionLines.push(`- Calories: ${Math.round(todayNutrition.calories)}`);
    nutritionLines.push(`- Protein: ${Math.round(todayNutrition.protein)}g`);
    nutritionLines.push(`- Carbs: ${Math.round(todayNutrition.carbs)}g · Fat: ${Math.round(todayNutrition.fat)}g`);

    // Protein target + TDEE
    const weightKg = weightLogs[0]?.weightKg ?? profile?.bodyWeightKg;
    if (weightKg) {
      const pTarget = proteinTarget(weightKg);
      nutritionLines.push(`- Protein target (1.6 g/kg Morton 2018): ${pTarget}g — ${Math.round((todayNutrition.protein / pTarget) * 100)}% hit`);
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
        nutritionLines.push(`- TDEE: ${tdee} kcal · Goal intake (${profile.goal}): ${goalCal} kcal`);
      }
      // Energy availability
      const bf = weightLogs[0]?.bodyFatPct ?? profile.bodyFatPct;
      if (bf) {
        const ffm = ffmFromBodyComposition(weightKg, bf);
        const exerciseCals = todayActivity?.activeCalories ?? 300;
        const ea = computeEA(todayNutrition.calories, exerciseCals, ffm);
        if (ea != null) {
          computedEA = ea;
          nutritionLines.push(`- Energy availability: ${ea.toFixed(1)} kcal/kg FFM${ea < 30 ? " (LOW — Loucks 2011 threshold breached)" : ""}`);
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
      nutritionLines.push(`- Per meal protein: ${pm}`);
    }
  }
  addSection("nutrition", nutritionLines);

  // --- Weight Trend ---
  const weightLines: string[] = [];
  if (weightLogs.length > 0) {
    const latest = weightLogs[0];
    const trend = weightTrendDirection(weightLogs.map((l) => ({ day: l.day, weightKg: l.weightKg })));
    weightLines.push("## Weight Trend");
    weightLines.push(`- Latest: ${latest.weightKg.toFixed(1)} kg (${kgToLb(latest.weightKg)} lb) on ${latest.day.toLocaleDateString()}`);
    if (trend) weightLines.push(`- 7-day trend: ${trend}`);
    if (weightLogs.length >= 7) {
      const recent7 = weightLogs.slice(0, 7).reduce((s, l) => s + l.weightKg, 0) / 7;
      weightLines.push(`- 7-day avg: ${recent7.toFixed(1)} kg`);
    }
  }
  addSection("weight_trend", weightLines);

  // --- Active Experiments ---
  const experimentLines: string[] = [];
  if (activeExperiments.length > 0) {
    experimentLines.push("## Active Experiments");
    for (const exp of activeExperiments) {
      experimentLines.push(`- "${exp.title}" — ${exp._count.logs} days logged, testing: ${exp.independentVariable} → ${exp.dependentVariable}`);
    }
  }
  addSection("experiments", experimentLines);

  // --- Recent Insights ---
  try {
    const insights = await generateInsights();
    const top = insights.slice(0, 5);
    if (top.length > 0) {
      const insightLines: string[] = [];
      insightLines.push("## Recent Insights (passive correlations)");
      for (const ins of top) {
        const metricsSummary = ins.metrics.map((m) => `${m.percentDiff}% ${ins.direction} ${m.metricLabel} (p=${m.pValue})`).join(", ");
        insightLines.push(`- "${ins.tag}": ${metricsSummary} (n=${ins.taggedN})`);
      }
      addSection("insights", insightLines);
    }
  } catch {
    // Insights may fail if no tags yet
  }

  // --- Goals + Tradeoffs + Archived Pattern Recall ---
  // Determine focus goal
  const focusGoal = focusGoalId
    ? goals.find((g: { id: string }) => g.id === focusGoalId)
    : goals.find((g: { isPrimary: boolean }) => g.isPrimary) ?? null;

  const goalLines: string[] = [];
  if (goals.length > 0) {
    goalLines.push("## Active Goals");
    for (const g of goals) {
      const primary = g.isPrimary ? " ★ PRIMARY" : "";
      const deadline = g.deadline ? ` — ${new Date(g.deadline).toLocaleDateString()}` : "";
      const daysUntil = g.deadline
        ? ` (${Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)} days)`
        : "";
      goalLines.push(`- [${g.type}${g.subtype ? `/${g.subtype}` : ""}] ${g.title}${g.target ? ` → ${g.target}` : ""}${deadline}${daysUntil}${primary}`);
    }

    // 2D: Tradeoff detection
    const tradeoffs = detectTradeoffs(goals, {
      energyAvailability: computedEA,
      readinessScore: score?.overall ?? null,
      cyclePhase: phaseLog?.phase ?? null,
      hrvCv: computedHrvCv,
      weeklyRunningKm: latestRunning?.walkingRunningDistance ? latestRunning.walkingRunningDistance / 1000 : null,
      calorieBalance: null,
    });

    if (tradeoffs.length > 0) {
      goalLines.push("");
      goalLines.push("### Goal Conflicts Detected");
      for (const t of tradeoffs) {
        goalLines.push(`- [${t.severity.toUpperCase()}] ${t.message}`);
      }
    }

    // 2F: Archived goal pattern recall
    if (focusGoal) {
      const archivedSameType = archivedGoals.filter(
        (a) => a.type === focusGoal.type && (focusGoal.subtype ? a.subtype === focusGoal.subtype : true)
      );
      if (archivedSameType.length > 0) {
        goalLines.push("");
        goalLines.push("### Past Goals (same type — for pattern reference)");
        for (const a of archivedSameType) {
          const completedDate = a.updatedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
          goalLines.push(`- "${a.title}" — archived ${completedDate}${a.target ? ` (target: ${a.target})` : ""}${a.notes ? ` | notes: ${a.notes}` : ""}`);
        }
      }
    }
  }
  addSection("goals", goalLines);

  // --- Apple Watch Workouts ---
  const watchLines: string[] = [];
  if (appleWatchWorkouts.length > 0) {
    watchLines.push("## Apple Watch Workouts (7 days)");
    for (const w of appleWatchWorkouts.slice(0, 7)) {
      const dur = Math.round((w.durationSeconds ?? 0) / 60);
      const hr = w.avgHeartRate ? ` avg ${w.avgHeartRate} bpm` : "";
      const cal = w.activeCalories ? ` ${Math.round(w.activeCalories)} cal` : "";
      const dist = w.distance ? ` ${w.distance.toFixed(1)} ${w.distanceUnit ?? "km"}` : "";
      watchLines.push(`- ${w.name}: ${dur}min${cal}${hr}${dist}`);
    }
    watchLines.push(`- Total: ${appleWatchWorkouts.length} workouts this week`);
  }
  addSection("apple_watch_workouts", watchLines);

  // --- SpO2 ---
  const spo2Lines: string[] = [];
  if (spo2Data.length > 0) {
    spo2Lines.push("## SpO2 (Last 7 Days)");
    for (const s of spo2Data) {
      const flag = s.avgSpO2 != null && s.avgSpO2 < 95 ? " ⚠ LOW" : "";
      spo2Lines.push(`- ${s.day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${s.avgSpO2 ?? "—"}%${flag}`);
    }
  }
  addSection("spo2", spo2Lines);

  // --- Resilience ---
  const resilienceLines: string[] = [];
  if (resilienceData.length > 0) {
    resilienceLines.push("## Resilience (Last 7 Days)");
    for (const r of resilienceData) {
      resilienceLines.push(`- ${r.day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${r.level} (sleep_recovery: ${r.sleepRecovery ?? "—"}, daytime_recovery: ${r.daytimeRecovery ?? "—"}, stress: ${r.stress ?? "—"})`);
    }
  }
  addSection("resilience", resilienceLines);

  // --- VO2 Max ---
  const vo2Lines: string[] = [];
  if (vo2MaxData.length > 0) {
    const latest = vo2MaxData[0];
    const oldest = vo2MaxData[vo2MaxData.length - 1];
    const delta = latest.vo2Max != null && oldest.vo2Max != null
      ? (latest.vo2Max - oldest.vo2Max).toFixed(1)
      : null;
    vo2Lines.push("## VO2 Max Trend (Last 30 Days)");
    vo2Lines.push(`- Latest: ${latest.vo2Max ?? "—"} mL/kg/min${delta ? ` | 30-day change: ${Number(delta) >= 0 ? "+" : ""}${delta}` : ""}`);
  }
  addSection("vo2max", vo2Lines);

  // --- Sessions (meditation, breathing, naps) ---
  const sessionLines: string[] = [];
  if (sessionsData.length > 0) {
    sessionLines.push("## Recent Sessions");
    for (const s of sessionsData.slice(0, 5)) {
      const dur = Math.round((s.durationSeconds ?? 0) / 60);
      const hr = s.avgHeartRate ? ` avg HR ${Math.round(s.avgHeartRate)}` : "";
      const hrv = s.avgHrv ? ` avg HRV ${Math.round(s.avgHrv)}ms` : "";
      sessionLines.push(`- ${s.day.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${s.type}: ${dur}min${hr}${hrv}`);
    }
  }
  addSection("sessions", sessionLines);

  // --- Bedtime ---
  const bedtimeLines: string[] = [];
  if (bedtimeRec) {
    const formatOffset = (offset: number) => {
      const totalMin = Math.round(offset / 60);
      const absMins = Math.abs(totalMin);
      const h = Math.floor(absMins / 60);
      const m = absMins % 60;
      if (totalMin < 0) {
        return `${12 - h - (m > 0 ? 1 : 0)}:${m > 0 ? (60 - m).toString().padStart(2, "0") : "00"} PM`;
      }
      return `${12 + h}:${m.toString().padStart(2, "0")} AM`;
    };
    bedtimeLines.push("## Bedtime Recommendation");
    if (bedtimeRec.optimalBedtimeStart != null && bedtimeRec.optimalBedtimeEnd != null) {
      bedtimeLines.push(`- Oura recommends: ${formatOffset(bedtimeRec.optimalBedtimeStart)}–${formatOffset(bedtimeRec.optimalBedtimeEnd)}`);
    }
    if (bedtimeRec.recommendation) bedtimeLines.push(`- Status: ${bedtimeRec.recommendation}`);
  }
  addSection("bedtime", bedtimeLines);

  // --- Running & Cardio ---
  const runningLines: string[] = [];
  if (latestRunning) {
    runningLines.push("## Running & Cardio (Apple Watch)");
    if (latestRunning.runningSpeed)
      runningLines.push(`- Speed: ${latestRunning.runningSpeed.toFixed(1)} km/h`);
    if (latestRunning.runningPower)
      runningLines.push(`- Power: ${Math.round(latestRunning.runningPower)} W`);
    if (latestRunning.groundContactTime)
      runningLines.push(`- Ground contact: ${Math.round(latestRunning.groundContactTime)} ms`);
    if (latestRunning.verticalOscillation)
      runningLines.push(`- Vertical oscillation: ${latestRunning.verticalOscillation.toFixed(1)} cm`);
    if (latestRunning.strideLength)
      runningLines.push(`- Stride: ${latestRunning.strideLength.toFixed(2)} m`);
    if (latestRunning.cardioRecovery)
      runningLines.push(`- Cardio recovery: ${Math.round(latestRunning.cardioRecovery)} BPM drop`);
    if (latestRunning.physicalEffort)
      runningLines.push(`- Physical effort: ${latestRunning.physicalEffort.toFixed(1)}/10`);
    if (latestRunning.walkingRunningDistance)
      runningLines.push(`- Walk+run distance: ${(latestRunning.walkingRunningDistance / 1000).toFixed(1)} km`);
    if (latestRunning.respiratoryRate)
      runningLines.push(`- Respiratory rate: ${latestRunning.respiratoryRate.toFixed(1)} breaths/min`);
  }
  addSection("running_cardio", runningLines);

  // ---- Hyrox plan integration ----
  // Fetch the active hyrox plan (if any) and build sections
  let hyroxPlan: Awaited<ReturnType<typeof prisma.hyroxPlan.findFirst>> | null = null;
  try {
    hyroxPlan = await prisma.hyroxPlan.findFirst({
      where: {
        goal: { isPrimary: true, subtype: "hyrox", status: "active" },
      },
      include: {
        sessions: { take: 10, orderBy: { day: "desc" } },
      },
    });
  } catch {
    // Non-fatal — skip hyrox sections
  }

  if (hyroxPlan) {
    hyroxPlan = await maybeArchivePlan(hyroxPlan);

    if (hyroxPlan.status === "active") {
      // Determine cycle start day (most recent menstrual log) for cycle-day calc
      let cycleStartDay: Date | null = null;
      try {
        const menstrualLog = await prisma.cyclePhaseLog.findFirst({
          where: { phase: "menstrual", day: { lte: localToday } },
          orderBy: { day: "desc" },
        });
        if (menstrualLog) cycleStartDay = menstrualLog.day;
      } catch {
        // Non-fatal
      }

      const hyroxPlanLines = buildHyroxPlanSection(
        hyroxPlan,
        now,
        phaseLog,
        cycleStartDay,
      );
      addSection("hyrox_plan", hyroxPlanLines);

      const hyroxPaceLines = buildHyroxPaceGapSection(
        hyroxPlan,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (hyroxPlan as any).sessions ?? [],
      );
      addSection("hyrox_pace_gap", hyroxPaceLines);
    }
  }

  // ---- Build primary focus section ----
  const lensKey = focusGoal
    ? (focusGoal.subtype && goalLenses[`${focusGoal.type}_${focusGoal.subtype}`]
        ? `${focusGoal.type}_${focusGoal.subtype}`
        : focusGoal.type)
    : null;
  const lens = lensKey ? goalLenses[lensKey] : null;
  const order = lens?.sectionOrder ?? defaultSectionOrder;

  if (focusGoal) {
    const focusLines: string[] = [];
    focusLines.push(`## PRIMARY FOCUS: ${focusGoal.title}`);
    focusLines.push(`Type: ${focusGoal.type}${focusGoal.subtype ? `/${focusGoal.subtype}` : ""}`);
    if (focusGoal.deadline) {
      const daysOut = Math.ceil((new Date(focusGoal.deadline).getTime() - Date.now()) / 86400000);
      focusLines.push(`Deadline: ${new Date(focusGoal.deadline).toLocaleDateString()} (${daysOut} days out)`);
    }
    if (focusGoal.target) focusLines.push(`Target: ${focusGoal.target}`);
    if (lens) focusLines.push(`\nCoaching frame: ${lens.coachingFrame}`);
    focusLines.push("");
    addSection("primary_focus", focusLines);
  }

  // ---- Assemble final output ----
  const finalLines: string[] = [];
  finalLines.push(`# User State (${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })})`);
  finalLines.push("");

  // Profile always first
  const profileSection = sections.get("profile");
  if (profileSection) finalLines.push(...profileSection, "");

  // Then goal-ordered sections
  for (const key of order) {
    const section = sections.get(key);
    if (section && section.length > 0) {
      finalLines.push(...section, "");
    }
  }

  // Any remaining sections not in the order list (safety net)
  for (const [key, section] of sections) {
    if (key !== "profile" && !order.includes(key) && section.length > 0) {
      finalLines.push(...section, "");
    }
  }

  return finalLines.join("\n");
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
