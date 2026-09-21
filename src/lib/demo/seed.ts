import { PrismaClient, type Prisma } from "@prisma/client";
import { SOLO_USER_ID } from "@/lib/current-user";
import { DEMO_USER_ID, DEMO_EMAIL } from "@/lib/demo/constants";
import { mdeForPairs, permutationP, pEffectGtSWC, type Assignment } from "@/lib/diagnose/runs";

/**
 * Demo tenant seed (2026-09-21).
 *
 * Rebuilds `usr_demo` from the solo tenant: delete everything the demo owns,
 * then re-copy with three transforms —
 *
 *   1. DATE SHIFT. Every timestamp moves forward by the same whole number of
 *      days so the source's last night of sleep lands on (UTC today + 1).
 *      "Today" is therefore populated for a visitor in any timezone until the
 *      next daily reseed. Internal spacing (sleep → workout → meal) is kept.
 *   2. REMOVAL. Cycle logs, chat history, sync/device records, intimate and
 *      alcohol tags, alcohol food entries, sleep-context life tags, GPS
 *      routes and EVERY free-text field are dropped or nulled.
 *   3. SYNTHESIS. Profile, workout-note narratives + GI labels, two
 *      experiments and one coach conversation are written fresh and say so.
 *      Body weight is scaled. Nothing synthetic is derived from removed data.
 *
 * What is NOT altered: daily vitals (sleep, HRV, readiness, activity, SpO2),
 * workouts, heart rate during workouts, and non-alcohol meals are the source
 * tenant's real values, shifted in time.
 *
 * Uses its OWN un-extended PrismaClient: the app client (db.ts) scopes reads
 * to the current user and refuses all demo writes, and this job must read one
 * tenant and write another. Every query here carries an explicit userId.
 */

const DAY = 86_400_000;
const WEIGHT_SCALE = 1.08;
const HR_WORKOUT_LOOKBACK = 60; // copy workout HR for the most recent N workouts

const SENSITIVE_TAG = /\b(sex|intimacy|hook ?up|period|cramps?|pms|pill|plan b|condom)\b/i;
const ALCOHOL =
  /\b(wine|beer|cocktail|vodka|whisk(e)?y|tequila|sake|soju|champagne|prosecco|margarita|spritz|gin|rum|negroni|martini|shots?|mezcal|bourbon|cider|sangria|liquor|baijiu|highball|mimosa|bellini|aperol|alcohol)\b/i;
const DROP_LIFE_CONTEXT = /\b(sex|went out|partner|shared bed|slept alone)\b/i;

let rawClient: PrismaClient | undefined;
function raw(): PrismaClient {
  rawClient ??= new PrismaClient();
  return rawClient;
}

/** Deterministic PRNG so synthetic arms/ratings are stable across reseeds. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const did = (id: string) => `demo_${id}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcMidnight = (d: Date) => new Date(iso(d) + "T00:00:00.000Z");

export interface SeedReport {
  anchorDay: string;
  sourceLastDay: string;
  shiftDays: number;
  counts: Record<string, number>;
  ms: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export async function seedDemoTenant(now: Date = new Date()): Promise<SeedReport> {
  const t0 = Date.now();
  const db = raw();
  const SRC = { userId: SOLO_USER_ID };

  // ---- anchor + shift ------------------------------------------------------
  const lastSleep = await db.dailySleep.aggregate({ where: SRC, _max: { day: true } });
  const sourceLast = lastSleep._max.day;
  if (!sourceLast) throw new Error("Source tenant has no sleep data — nothing to seed from");
  const anchor = new Date(utcMidnight(now).getTime() + DAY);
  const shiftMs = anchor.getTime() - sourceLast.getTime();
  const srcCutoff = new Date(sourceLast.getTime() + DAY); // exclusive, for instants
  const sh = (d: Date) => new Date(d.getTime() + shiftMs);

  /** Generic row transform: shift every Date, retarget the tenant, prefix the
   *  id and the named foreign keys, then apply per-model overrides. */
  const tx = (row: Row, fks: string[] = [], overrides: Row = {}): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? sh(v) : v;
    out.userId = DEMO_USER_ID;
    if (typeof out.id === "string") out.id = did(out.id);
    else delete out.id; // autoincrement
    for (const fk of fks) if (typeof out[fk] === "string") out[fk] = did(out[fk]);
    return { ...out, ...overrides };
  };

  // ---- read the source (all before the write transaction) -------------------
  const dayWhere = { ...SRC, day: { lte: sourceLast } };
  const [
    baselines, readiness, sleep, activity, stress, spo2, resilience, running, vo2,
    sleepRecs, tags, nutLogs, exercises, sessions, sets, templates, profile, goals,
    hyroxPlans, hyroxSessions, hyroxBench, goalTags, weights, hkWorkouts, zones,
    ouraWorkouts, ouraSessions, env, lcDefs, lcLogs, notes, soreness, srcUser,
  ] = await Promise.all([
    db.userBaseline.findMany({ where: SRC }),
    db.dailyReadiness.findMany({ where: dayWhere }),
    db.dailySleep.findMany({ where: dayWhere }),
    db.dailyActivity.findMany({ where: dayWhere }),
    db.dailyStress.findMany({ where: dayWhere }),
    db.dailySpO2.findMany({ where: dayWhere }),
    db.dailyResilience.findMany({ where: dayWhere }),
    db.dailyRunningMetrics.findMany({ where: dayWhere }),
    db.dailyVO2Max.findMany({ where: dayWhere }),
    db.sleepTimeRecommendation.findMany({ where: dayWhere }),
    db.activityTag.findMany({ where: { ...SRC, timestamp: { lt: srcCutoff } } }),
    db.nutritionLog.findMany({ where: dayWhere, include: { entries: true } }),
    db.exercise.findMany({ where: SRC }),
    db.workoutSession.findMany({ where: { ...SRC, date: { lt: srcCutoff } } }),
    db.workoutSet.findMany({ where: SRC }),
    db.workoutTemplate.findMany({ where: SRC }),
    db.userProfile.findUnique({ where: { userId: SOLO_USER_ID } }),
    db.goal.findMany({ where: SRC }),
    db.hyroxPlan.findMany({ where: SRC }),
    db.hyroxSession.findMany({ where: SRC }),
    db.hyroxStationBenchmark.findMany({ where: SRC }),
    db.goalWorkoutTag.findMany({ where: SRC }),
    db.weightLog.findMany({ where: dayWhere }),
    db.healthKitWorkout.findMany({ where: { ...SRC, startedAt: { lt: srcCutoff } }, orderBy: { startedAt: "desc" } }),
    db.heartRateZoneSummary.findMany({ where: { ...SRC, date: { lt: srcCutoff } } }),
    db.ouraWorkout.findMany({ where: dayWhere }),
    db.ouraSession.findMany({ where: dayWhere }),
    db.envReading.findMany({ where: { ...SRC, timestamp: { lt: srcCutoff } } }),
    db.lifeContextDef.findMany({ where: SRC }),
    db.lifeContextLog.findMany({ where: dayWhere }),
    db.workoutNote.findMany({ where: { ...SRC, workoutDate: { lt: srcCutoff } }, orderBy: { workoutDate: "asc" } }),
    db.sorenessLog.findMany({ where: dayWhere }),
    db.user.findUnique({ where: { id: SOLO_USER_ID } }),
  ]);

  // Heart rate: only samples inside recent workout windows (the dashboard's
  // workout HR chart). The full 1.2M-row stream is not copied.
  const hrRows: Row[] = [];
  for (const w of hkWorkouts.slice(0, HR_WORKOUT_LOOKBACK)) {
    const samples = await db.heartRateSample.findMany({
      where: { ...SRC, timestamp: { gte: w.startedAt, lte: w.endedAt } },
      select: { bpm: true, source: true, timestamp: true },
    });
    for (const s of samples) {
      hrRows.push({ userId: DEMO_USER_ID, bpm: s.bpm, source: s.source, timestamp: sh(s.timestamp) });
    }
  }

  // ---- transforms -----------------------------------------------------------
  const keptSessionIds = new Set(sessions.map((s) => s.id));
  const customExerciseIds = new Set(exercises.map((e) => e.id));

  const tagRows = tags
    .filter((t) => t.category !== "alcohol" && !SENSITIVE_TAG.test(t.tag) && !ALCOHOL.test(t.tag))
    .map((t) => tx(t, [], { metadata: null, experimentId: null, ouraTagId: null }));

  const nutLogRows: Row[] = [];
  const nutEntryRows: Row[] = [];
  for (const { entries, ...log } of nutLogs) {
    const kept = entries.filter((e) => !ALCOHOL.test(e.foodName) && !ALCOHOL.test(e.description));
    if (kept.length === 0 && entries.length > 0) continue; // an alcohol-only day: drop the log
    const sum = (k: "calories" | "protein" | "carbs" | "fat") => kept.reduce((a, e) => a + e[k], 0);
    const totals =
      kept.length === entries.length
        ? {}
        : { calories: sum("calories"), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat") };
    nutLogRows.push(tx(log, [], totals));
    for (const e of kept) nutEntryRows.push(tx(e, ["nutritionLogId"]));
  }

  const keptDefs = lcDefs.filter((d) => d.groupKey !== "sleep-context" && !DROP_LIFE_CONTEXT.test(d.label));
  const keptDefIds = new Set(keptDefs.map((d) => d.id));

  const goalRows = goals.map((g) =>
    tx(g, [], {
      notes: null,
      ...(g.type === "weight" ? { title: "Race-weight cut", target: "Lose 8 lb" } : {}),
    }),
  );

  // Workout notes: keep the link to the workout and the (cycle-stripped)
  // signal snapshot; narrative, analysis and GI labels are synthetic.
  const SYNTH_NOTES: { narrative: string; gi: string }[] = [
    { narrative: "Sample note. Legs felt fresh, held pace through the last third. No stomach issues.", gi: "none" },
    { narrative: "Sample note. Ate close to the start and felt heavy for the first 15 minutes, settled after.", gi: "mild" },
    { narrative: "Sample note. Easy effort, nasal breathing the whole way. Nothing to report.", gi: "none" },
    { narrative: "Sample note. Cramping from the midpoint, had to walk twice. Large lunch two hours before.", gi: "moderate" },
    { narrative: "Sample note. Strong session, negative split. Light snack 90 minutes out.", gi: "none" },
  ];
  const stripCycle = (s: string | null): string | null => {
    if (!s) return null;
    try {
      const o = JSON.parse(s) as Row;
      for (const k of Object.keys(o)) if (/cycle|period|phase/i.test(k)) o[k] = null;
      return JSON.stringify(o);
    } catch {
      return null;
    }
  };
  const noteRows = notes.map((n, i) => {
    const synth = SYNTH_NOTES[i % SYNTH_NOTES.length];
    return tx(n, ["workoutId"], {
      narrative: synth.narrative,
      analysis: null,
      preRunBowel: null,
      giOutcome: synth.gi,
      giConfidence: 1,
      giEvidence: null,
      giNeedsReview: false,
      signalSnapshot: stripCycle(n.signalSnapshot),
    });
  });

  const profileRow: Row | null = profile
    ? tx(profile, [], {
        bodyWeightKg: profile.bodyWeightKg != null ? round1(profile.bodyWeightKg * WEIGHT_SCALE) : null,
        targetWeightKg: profile.targetWeightKg != null ? round1(profile.targetWeightKg * WEIGHT_SCALE) : null,
        bodyFatPct: null,
        heightCm: 168,
        age: 27,
      })
    : null;

  // ---- synthetic experiments (values pulled from the demo's real dailies) ---
  const byDay = <T extends { day: Date }>(rows: T[], pick: (r: T) => number | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = pick(r);
      if (typeof v === "number") m.set(iso(sh(r.day)), v);
    }
    return m;
  };
  const experiments = [
    buildExperiment({
      id: "demo_exp_caffeine",
      title: "No caffeine after 2 PM",
      hypothesis:
        "Cutting caffeine after 2 PM increases deep sleep. (Sample experiment: arms were assigned at random for this demo, so the verdict reflects noise, not a real intervention.)",
      independentVariable: "No caffeine after 2 PM",
      dependentVariable: "Deep sleep",
      metricSource: "DailySleep",
      dependentMetric: "deepSleepDuration",
      lagDays: 0,
      values: byDay(sleep, (r) => r.deepSleepDuration),
      anchor,
      blocks: 8,
      endOffsetDays: -9, // last leg 9 days before "today"
      complete: true,
      seed: 20260921,
    }),
    buildExperiment({
      id: "demo_exp_shower",
      title: "Cold shower on waking",
      hypothesis:
        "A 2-minute cold shower on waking raises daytime recovery minutes. (Sample experiment: arms were assigned at random for this demo.)",
      independentVariable: "Cold shower on waking",
      dependentVariable: "Daytime recovery",
      metricSource: "DailyStress",
      dependentMetric: "recoveryHigh",
      lagDays: 0,
      values: byDay(stress, (r) => r.recoveryHigh),
      anchor,
      blocks: 6,
      endOffsetDays: 6, // runs through next week → renders as in progress
      complete: false,
      seed: 20260922,
    }),
  ].filter((e): e is NonNullable<typeof e> => e !== null);

  // ---- synthetic coach conversation (numbers from the demo's latest night) --
  const lastNight = sleep.find((s) => s.day.getTime() === sourceLast.getTime());
  const recentHrv = sleep
    .filter((s) => s.averageHrv != null && s.day.getTime() > sourceLast.getTime() - 14 * DAY)
    .map((s) => s.averageHrv as number);
  const hrvAvg = recentHrv.length ? Math.round(recentHrv.reduce((a, b) => a + b, 0) / recentHrv.length) : null;
  const lastReadiness = readiness.find((r) => r.day.getTime() === sourceLast.getTime());
  const chatAt = new Date(anchor.getTime() - DAY + 13 * 3_600_000);
  const coachAnswer = [
    "Sample conversation, written for this demo from the profile's latest numbers.",
    lastNight?.score != null && lastNight.totalSleepDuration != null
      ? `Sleep: score ${lastNight.score}, ${fmtDur(lastNight.totalSleepDuration)} total${lastNight.deepSleepDuration != null ? `, ${fmtDur(lastNight.deepSleepDuration)} deep` : ""}.`
      : null,
    lastNight?.averageHrv != null && hrvAvg != null
      ? `HRV: ${lastNight.averageHrv} ms overnight against a 14-day average of ${hrvAvg} ms. I compare against your own range, not a population norm.`
      : null,
    lastReadiness?.score != null ? `Readiness: ${lastReadiness.score}.` : null,
    "In the live app this is where I'd make the call — push, hold, or back off — and name the two signals that decided it.",
  ]
    .filter(Boolean)
    .join("\n\n");

  // ---- write: wipe + insert in one transaction ------------------------------
  const counts: Record<string, number> = {};
  const D = { userId: DEMO_USER_ID };
  await db.$transaction(
    async (t) => {
      await t.user.upsert({
        where: { id: DEMO_USER_ID },
        create: {
          id: DEMO_USER_ID,
          email: DEMO_EMAIL,
          passwordHash: null,
          timezone: "America/New_York",
          baselineStartedAt: srcUser?.baselineStartedAt ? sh(srcUser.baselineStartedAt) : null,
        },
        update: {
          baselineStartedAt: srcUser?.baselineStartedAt ? sh(srcUser.baselineStartedAt) : null,
        },
      });

      // Wipe, children before parents (WorkoutSet → Exercise is RESTRICT).
      await t.chatMessage.deleteMany({ where: D });
      await t.chatSession.deleteMany({ where: D });
      await t.activityTag.deleteMany({ where: D });
      await t.experimentLog.deleteMany({ where: D });
      await t.experiment.deleteMany({ where: D });
      await t.goalWorkoutTag.deleteMany({ where: D });
      await t.hyroxStationBenchmark.deleteMany({ where: D });
      await t.hyroxSession.deleteMany({ where: D });
      await t.hyroxPlan.deleteMany({ where: D });
      await t.goal.deleteMany({ where: D });
      await t.workoutSet.deleteMany({ where: D });
      await t.workoutSession.deleteMany({ where: D });
      await t.workoutTemplate.deleteMany({ where: D });
      await t.exercise.deleteMany({ where: D });
      await t.nutritionEntry.deleteMany({ where: D });
      await t.nutritionLog.deleteMany({ where: D });
      await t.lifeContextLog.deleteMany({ where: D });
      await t.lifeContextDef.deleteMany({ where: D });
      await t.diagnoseRun.deleteMany({ where: D });
      await t.diagnoseFlow.deleteMany({ where: D });
      await t.diagnoseCandidateState.deleteMany({ where: D });
      for (const m of [
        t.userBaseline, t.ouraToken, t.dailyReadiness, t.dailySleep, t.dailyActivity,
        t.dailyStress, t.heartRateSample, t.cyclePhaseLog, t.syncLog, t.userProfile,
        t.weightLog, t.healthKitSync, t.healthKitWorkout, t.heartRateZoneSummary,
        t.dailySpO2, t.ouraWorkout, t.ouraSession, t.sleepTimeRecommendation,
        t.dailyResilience, t.dailyRunningMetrics, t.dailyVO2Max, t.envReading,
        t.workoutNote, t.sorenessLog,
      ]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (m as any).deleteMany({ where: D });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const put = async (name: string, model: any, rows: Row[]) => {
        counts[name] = rows.length;
        for (let i = 0; i < rows.length; i += 5000) {
          await model.createMany({ data: rows.slice(i, i + 5000) });
        }
      };

      await put("UserBaseline", t.userBaseline, baselines.map((r) => tx(r)));
      await put("DailyReadiness", t.dailyReadiness, readiness.map((r) => tx(r)));
      await put("DailySleep", t.dailySleep, sleep.map((r) => tx(r)));
      await put("DailyActivity", t.dailyActivity, activity.map((r) => tx(r)));
      await put("DailyStress", t.dailyStress, stress.map((r) => tx(r)));
      await put("DailySpO2", t.dailySpO2, spo2.map((r) => tx(r)));
      await put("DailyResilience", t.dailyResilience, resilience.map((r) => tx(r)));
      await put("DailyRunningMetrics", t.dailyRunningMetrics, running.map((r) => tx(r)));
      await put("DailyVO2Max", t.dailyVO2Max, vo2.map((r) => tx(r)));
      await put("SleepTimeRecommendation", t.sleepTimeRecommendation, sleepRecs.map((r) => tx(r)));
      await put("HeartRateSample", t.heartRateSample, hrRows);
      await put("ActivityTag", t.activityTag, tagRows);
      await put("NutritionLog", t.nutritionLog, nutLogRows);
      await put("NutritionEntry", t.nutritionEntry, nutEntryRows);
      await put("Exercise", t.exercise, exercises.map((r) => tx(r, [], { notes: null })));
      await put("WorkoutSession", t.workoutSession, sessions.map((r) => tx(r, [], { notes: null, cyclePhase: null })));
      await put(
        "WorkoutSet",
        t.workoutSet,
        sets
          .filter((s) => keptSessionIds.has(s.sessionId))
          .map((s) =>
            tx(s, ["sessionId"], {
              notes: null,
              // shared catalog exercises (userId null) keep their id
              exerciseId: customExerciseIds.has(s.exerciseId) ? did(s.exerciseId) : s.exerciseId,
            }),
          ),
      );
      await put("WorkoutTemplate", t.workoutTemplate, templates.map((r) => tx(r)));
      if (profileRow) await put("UserProfile", t.userProfile, [profileRow]);
      await put("Goal", t.goal, goalRows);
      await put("HyroxPlan", t.hyroxPlan, hyroxPlans.map((r) => tx(r, ["goalId"])));
      await put(
        "HyroxSession",
        t.hyroxSession,
        hyroxSessions.map((r) =>
          tx(r, ["planId"], {
            workoutSessionId:
              r.workoutSessionId && keptSessionIds.has(r.workoutSessionId) ? did(r.workoutSessionId) : null,
          }),
        ),
      );
      await put("HyroxStationBenchmark", t.hyroxStationBenchmark, hyroxBench.map((r) => tx(r, ["planId"], { notes: null })));
      await put(
        "GoalWorkoutTag",
        t.goalWorkoutTag,
        goalTags.filter((g) => keptSessionIds.has(g.sessionId)).map((r) => tx(r, ["goalId", "sessionId"])),
      );
      await put(
        "WeightLog",
        t.weightLog,
        weights.map((r) =>
          tx(r, [], {
            notes: null,
            weightKg: round1(r.weightKg * WEIGHT_SCALE),
            muscleMassKg: r.muscleMassKg != null ? round1(r.muscleMassKg * WEIGHT_SCALE) : null,
          }),
        ),
      );
      await put(
        "HealthKitWorkout",
        t.healthKitWorkout,
        hkWorkouts.map((r) => tx(r, [], { routeJson: null, externalId: did(r.externalId) })),
      );
      await put("HeartRateZoneSummary", t.heartRateZoneSummary, zones.map((r) => tx(r, ["workoutId"])));
      await put("OuraWorkout", t.ouraWorkout, ouraWorkouts.map((r) => tx(r, [], { label: null })));
      await put("OuraSession", t.ouraSession, ouraSessions.map((r) => tx(r, [], { mood: null })));
      await put("EnvReading", t.envReading, env.map((r) => tx(r)));
      await put("LifeContextDef", t.lifeContextDef, keptDefs.map((r) => tx(r)));
      await put(
        "LifeContextLog",
        t.lifeContextLog,
        lcLogs.filter((l) => keptDefIds.has(l.defId)).map((r) => tx(r, ["defId"], { notes: null })),
      );
      await put("WorkoutNote", t.workoutNote, noteRows);
      await put("SorenessLog", t.sorenessLog, soreness.map((r) => tx(r, [], { note: null })));
      await put("Experiment", t.experiment, experiments);

      // Device/sync stand-ins so the UI renders its connected state. The
      // token is inert: sync and OAuth are refused for demo sessions.
      await t.ouraToken.create({
        data: {
          userId: DEMO_USER_ID,
          accessToken: "demo-inert",
          refreshToken: "demo-inert",
          expiresAt: new Date("2099-01-01T00:00:00.000Z"),
          scope: "demo",
        },
      });
      await t.syncLog.create({
        data: { userId: DEMO_USER_ID, status: "success", details: "Demo reseed", syncDate: now },
      });

      await t.chatSession.create({
        data: {
          id: "demo_chat_sample",
          userId: DEMO_USER_ID,
          title: "Sample: should I train hard today?",
          createdAt: chatAt,
          messages: {
            create: [
              { userId: DEMO_USER_ID, role: "user", content: "Should I train hard today?", createdAt: chatAt },
              {
                userId: DEMO_USER_ID,
                role: "assistant",
                content: coachAnswer,
                createdAt: new Date(chatAt.getTime() + 20_000),
              },
            ],
          },
        },
      });
    },
    { maxWait: 15_000, timeout: 120_000 },
  );

  return {
    anchorDay: iso(anchor),
    sourceLastDay: iso(sourceLast),
    shiftDays: Math.round(shiftMs / DAY),
    counts,
    ms: Date.now() - t0,
  };
}

/** When the demo tenant was last reseeded (null = never). */
export async function lastDemoSeedAt(): Promise<Date | null> {
  const row = await raw().syncLog.findFirst({
    where: { userId: DEMO_USER_ID },
    orderBy: { syncDate: "desc" },
    select: { syncDate: true },
  });
  return row?.syncDate ?? null;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function fmtDur(sec: number): string {
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function buildExperiment(o: {
  id: string;
  title: string;
  hypothesis: string;
  independentVariable: string;
  dependentVariable: string;
  metricSource: string;
  dependentMetric: string;
  lagDays: number;
  values: Map<string, number>;
  anchor: Date;
  blocks: number;
  endOffsetDays: number;
  complete: boolean;
  seed: number;
}): Prisma.ExperimentCreateManyInput | null {
  const rand = mulberry32(o.seed);
  const today = new Date(o.anchor.getTime() - DAY);
  const legs = o.blocks * 2;
  const start = new Date(today.getTime() + (o.endOffsetDays - (legs - 1)) * DAY);

  // Baseline from the 80 days before the run, mirroring metricBaseline().
  const base: number[] = [];
  for (let i = 1; i <= 80; i++) {
    const v = o.values.get(iso(new Date(start.getTime() - i * DAY)));
    if (v != null) base.push(v);
  }
  if (base.length < 8) return null;
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / (base.length - 1));
  if (sd === 0) return null;
  const swc = 0.8 * sd;
  const mde = mdeForPairs(Math.SQRT2 * sd, o.blocks);

  const assignments: Assignment[] = [];
  for (let pair = 0; pair < o.blocks; pair++) {
    const flip = rand() < 0.5;
    for (let leg = 0; leg < 2; leg++) {
      const d = new Date(start.getTime() + (pair * 2 + leg) * DAY);
      const past = d.getTime() < today.getTime();
      const value = past ? (o.values.get(iso(d)) ?? null) : null;
      assignments.push({
        idx: pair * 2 + leg,
        pairIdx: pair,
        date: iso(d),
        arm: (leg === 0) === flip ? "A" : "B",
        done: past,
        value,
        excluded: value != null && Math.abs(value - mean) > 3 * sd ? ">3 SD from baseline (pre-set rule)" : null,
      });
    }
  }

  const donePairs = new Set(assignments.filter((a) => a.done).map((a) => a.pairIdx));
  const feltRatings = [...donePairs]
    .filter((p) => assignments.filter((a) => a.pairIdx === p).every((a) => a.done))
    .map((pairIdx) => ({ pairIdx, armA: 3 + Math.floor(rand() * 3), armB: 2 + Math.floor(rand() * 3) }));

  let resultJson: string | null = null;
  if (o.complete) {
    const byPair = new Map<number, { A?: number; B?: number }>();
    for (const a of assignments) {
      if (!a.done || a.value == null || a.excluded) continue;
      const p = byPair.get(a.pairIdx) ?? {};
      p[a.arm] = a.value;
      byPair.set(a.pairIdx, p);
    }
    const diffs = [...byPair.values()].filter((p) => p.A != null && p.B != null).map((p) => p.A! - p.B!);
    const feltDelta = feltRatings.length
      ? Math.round((feltRatings.reduce((a, r) => a + (r.armA - r.armB), 0) / feltRatings.length) * 10) / 10
      : null;
    if (diffs.length < 4) {
      resultJson = JSON.stringify({ pEffectGtSWC: 0.5, randTestP: 1, feltDelta, decision: "inconclusive_low_adherence", pairsUsed: diffs.length });
    } else {
      const post = pEffectGtSWC(diffs, swc);
      resultJson = JSON.stringify({
        pEffectGtSWC: Math.round(post * 100) / 100,
        randTestP: Math.round(permutationP(diffs) * 1000) / 1000,
        feltDelta,
        decision: post >= 0.8 ? "effect_found" : post <= 0.2 ? "no_effect_at_mde" : "inconclusive",
        pairsUsed: diffs.length,
      });
    }
  }

  const lockedAt = new Date(start.getTime() - 5 * DAY);
  return {
    id: o.id,
    userId: DEMO_USER_ID,
    title: o.title,
    hypothesis: o.hypothesis,
    independentVariable: o.independentVariable,
    dependentVariable: o.dependentVariable,
    dependentMetric: o.dependentMetric,
    metricSource: o.metricSource,
    lagDays: o.lagDays,
    startDate: start,
    endDate: o.complete ? new Date(start.getTime() + (legs - 1) * DAY) : null,
    minDays: legs,
    status: o.complete ? "analyzed" : "active",
    assignments: JSON.stringify(assignments),
    preReg: JSON.stringify({
      outcome: `${o.metricSource}.${o.dependentMetric}`,
      swc,
      mde,
      baselineSd: sd,
      baselineMean: mean,
      blocks: o.blocks,
      exclusionRule: "Days with no metric reading excluded; readings > 3 SD from baseline excluded — both arms, pre-set",
      analysis: "Primary: sign-permutation test on block-paired differences. Secondary: posterior P(effect > SWC). No interim results. Locked before schedule generation.",
      lockedAt: lockedAt.toISOString(),
    }),
    feltRatings: JSON.stringify(feltRatings),
    resultJson,
    createdAt: lockedAt,
  };
}
