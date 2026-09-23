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
 *   1. DATE SHIFT. "Today" is the most recent source day with both a run and
 *      a strength workout (the showcase day). Every timestamp moves forward by
 *      the same whole number of days so that day lands on UTC today; one more
 *      source day is kept as "tomorrow" for visitors ahead of UTC, and
 *      everything later is left out. Instants recorded in Hong Kong also get
 *      +12h so they keep their lived wall-clock time for a US viewer.
 *      Internal spacing (sleep → workout → meal) is kept.
 *   2. REMOVAL. Her real cycle logs, chat history, sync/device records, intimate and
 *      alcohol tags, alcohol food entries, sleep-context life tags, GPS
 *      routes and EVERY free-text field are dropped or nulled.
 *   3. SYNTHESIS. A made-up menstrual cycle (fixed 28-day pattern pinned to
 *      the demo's today — NOT derived from the source's cycle logs), profile, workout-note narratives + GI labels, two
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
const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utcMidnight = (d: Date) => new Date(iso(d) + "T00:00:00.000Z");

export interface SeedReport {
  /** Source day shown as "today", and how it was chosen. */
  showcaseDay: string;
  showcasePick: "override" | "run+strength" | "last-sleep-day";
  todayDay: string;
  redatedSessions: number;
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

  // ---- wall-clock correction ------------------------------------------------
  // The source was recorded in two places (New York and Hong Kong). Demo
  // visitors are overwhelmingly on US time, where a 2:27 PM Hong Kong run
  // would render as 2:27 AM. Each night's bedtime tells us where that day was
  // lived: a bedtime of 12:00–21:59 UTC is a Hong Kong night. Instants from
  // those days get +12h so they keep their lived wall-clock time for a US
  // viewer. Calendar-day fields are never corrected.
  const [bedtimes, allHk, allSessions] = await Promise.all([
    db.dailySleep.findMany({ where: SRC, select: { day: true, bedtimeStart: true }, orderBy: { day: "asc" } }),
    db.healthKitWorkout.findMany({ where: SRC, select: { name: true, startedAt: true } }),
    db.workoutSession.findMany({ where: SRC, select: { date: true } }),
  ]);
  if (bedtimes.length === 0) throw new Error("Source tenant has no sleep data — nothing to seed from");
  const awayDays: { t: number; away: boolean }[] = bedtimes
    .filter((b) => b.bedtimeStart != null)
    .map((b) => {
      const h = (b.bedtimeStart as Date).getUTCHours();
      return { t: b.day.getTime(), away: h >= 12 && h < 22 }; // 8 PM – 6 AM Hong Kong
    });
  const corrMs = (d: Date): number => {
    const t = utcMidnight(d).getTime();
    let away = false;
    for (const a of awayDays) {
      if (a.t > t) break; // the night you woke from that day decides where the day was lived
      away = a.away;
    }
    return away ? 12 * 3_600_000 : 0;
  };
  /** Lived calendar day of an instant (US-Eastern wall clock after correction). */
  const livedDay = (d: Date) => iso(new Date(d.getTime() + corrMs(d) - 4 * 3_600_000));

  // ---- showcase day → "today" -----------------------------------------------
  // "Today" in the demo is the most recent lived day with BOTH a run and a
  // strength workout (and a night of sleep) — the product's core loop on one
  // screen. DEMO_SHOWCASE_DAY=YYYY-MM-DD (a source date) overrides the pick.
  // One further source day is kept and lands on "tomorrow", so a visitor whose
  // local date is already ahead of UTC still opens onto data.
  const sleepDays = new Set(bedtimes.map((b) => iso(b.day)));
  const kinds = new Map<string, { run: boolean; strength: boolean }>();
  for (const w of allHk) {
    const k = livedDay(w.startedAt);
    const e = kinds.get(k) ?? { run: false, strength: false };
    if (/run/i.test(w.name)) e.run = true;
    if (/strength/i.test(w.name)) e.strength = true;
    kinds.set(k, e);
  }
  const sessionDays = new Set(allSessions.map((x) => iso(x.date)));
  const bothDays = [...kinds.entries()]
    .filter(([k, e]) => e.run && (e.strength || sessionDays.has(k)) && sleepDays.has(k))
    .map(([k]) => k)
    .sort();
  const override = process.env.DEMO_SHOWCASE_DAY;
  const showcaseKey =
    (override && sleepDays.has(override) ? override : undefined) ??
    bothDays.at(-1) ??
    iso(bedtimes[bedtimes.length - 1].day);
  const showcase = new Date(showcaseKey + "T00:00:00.000Z");

  // ---- anchor + shift ------------------------------------------------------
  const sourceLast = new Date(showcase.getTime() + DAY); // last source day kept
  const anchor = new Date(utcMidnight(now).getTime() + DAY); // where sourceLast lands
  const shiftMs = anchor.getTime() - sourceLast.getTime();
  const srcCutoff = new Date(sourceLast.getTime() + DAY); // exclusive, for instants
  const DAY_FIELDS = new Set([
    "day", "date", "firstDay", "lastDay", "raceDate", "startDate", "blockStartDate", "deadline", "endDate",
  ]);
  const shDay = (d: Date) => new Date(d.getTime() + shiftMs);
  const sh = (d: Date) => new Date(d.getTime() + shiftMs + corrMs(d));

  /** Generic row transform: shift every Date (calendar-day fields by whole
   *  days, instants also by the wall-clock correction), retarget the tenant,
   *  prefix the id and the named foreign keys, then apply overrides. */
  const tx = (row: Row, fks: string[] = [], overrides: Row = {}): Row => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v instanceof Date ? (DAY_FIELDS.has(k) ? shDay(v) : sh(v)) : v;
    }
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
  // Workout windows can overlap (watch + manual entry of the same session),
  // so dedupe on the table's unique key.
  const hrRows: Row[] = [];
  const hrSeen = new Set<string>();
  for (const w of hkWorkouts.slice(0, HR_WORKOUT_LOOKBACK)) {
    const samples = await db.heartRateSample.findMany({
      where: { ...SRC, timestamp: { gte: w.startedAt, lte: w.endedAt } },
      select: { bpm: true, source: true, timestamp: true },
    });
    for (const s of samples) {
      const key = `${s.timestamp.getTime()}|${s.source}`;
      if (hrSeen.has(key)) continue;
      hrSeen.add(key);
      hrRows.push({ userId: DEMO_USER_ID, bpm: s.bpm, source: s.source, timestamp: sh(s.timestamp) });
    }
  }

  // In-app strength log on the showcase day. If the watch recorded a strength
  // workout that day but the sets were entered in the app the NEXT day (a
  // back-logged session), re-date those sessions onto the workout they
  // describe, so the day shows the lift and its sets together.
  const showcaseStrength = hkWorkouts.find(
    (w) => livedDay(w.startedAt) === showcaseKey && /strength/i.test(w.name),
  );
  const hasSessionOnShowcase = sessions.some((x) => x.date.getTime() === showcase.getTime());
  let redatedSessions = 0;
  if (showcaseStrength && !hasSessionOnShowcase) {
    sessions
      .filter((x) => x.date.getTime() === sourceLast.getTime())
      .forEach((x, i) => {
        x.date = showcase;
        x.startedAt = new Date(showcaseStrength.startedAt.getTime() + i * 60_000);
        x.completedAt = x.completedAt ? showcaseStrength.endedAt : null;
        x.durationMin ??= Math.round(showcaseStrength.durationSeconds / 60);
        redatedSessions++;
      });
  }

  // ---- showcase strength = an upper day (Kalysha, 2026-09-23) ---------------
  // The demo's lift is a made-up upper day, one exercise per muscle in her
  // order: lats → mid back → lower back → rear delts → delts → chest →
  // biceps → triceps. Sets and reps follow the hypertrophy evidence: 3 hard
  // sets per exercise, 8–15 reps a few reps short of failure (Schoenfeld et al.
  // 2017, 2021), overhead triceps extension over pushdowns for the long head
  // (Maeo et al. 2023). Loads are her own most recent working weight on that
  // exercise when she has one. Whatever she really logged that day is replaced.
  const UPPER_DAY: { name: string; sets: number; reps: number; fallbackKg: number }[] = [
    { name: "Lat Pulldown", sets: 3, reps: 10, fallbackKg: 32 },
    { name: "Seated Cable Row", sets: 3, reps: 10, fallbackKg: 32 },
    { name: "Back Extension", sets: 3, reps: 12, fallbackKg: 0 },
    { name: "Rear Delt Fly", sets: 3, reps: 15, fallbackKg: 7 },
    { name: "Dumbbell Shoulder Press", sets: 3, reps: 8, fallbackKg: 18 },
    { name: "Dumbbell Bench Press", sets: 3, reps: 8, fallbackKg: 30 },
    { name: "Bicep Curl", sets: 3, reps: 10, fallbackKg: 11 },
    { name: "Overhead Tricep Extension", sets: 3, reps: 12, fallbackKg: 14 },
  ];
  const catalog = await db.exercise.findMany({
    where: { userId: null, name: { in: UPPER_DAY.map((e) => e.name) } },
    select: { id: true, name: true },
  });
  const catalogId = new Map(catalog.map((e) => [e.name, e.id]));
  const exName = new Map(exercises.map((e) => [e.id, e.name]));
  for (const e of catalog) exName.set(e.id, e.name);
  const lastKg = new Map<string, number>();
  for (const st of [...sets].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const n = exName.get(st.exerciseId);
    if (n && !st.isWarmup && st.weight > 0 && !lastKg.has(n)) lastKg.set(n, st.weight);
  }
  const showcaseSessions = sessions.filter((x) => x.date.getTime() === showcase.getTime());
  if (showcaseSessions.length > 0 || showcaseStrength) {
    const host =
      showcaseSessions[0] ??
      (() => {
        const w = showcaseStrength!;
        const row = {
          id: "synth_upper_day",
          userId: SOLO_USER_ID,
          date: showcase,
          startedAt: w.startedAt,
          completedAt: w.endedAt,
          durationMin: Math.round(w.durationSeconds / 60),
          readinessScore: null,
          cyclePhase: null,
          sessionRPE: null,
          sessionVolume: null,
          notes: null,
          templateName: null,
          createdAt: w.startedAt,
          updatedAt: w.startedAt,
        } as (typeof sessions)[number];
        sessions.push(row);
        return row;
      })();
    const drop = new Set(showcaseSessions.map((x) => x.id));
    for (let i = sessions.length - 1; i >= 0; i--) {
      if (sessions[i].id !== host.id && drop.has(sessions[i].id)) sessions.splice(i, 1);
    }
    for (let i = sets.length - 1; i >= 0; i--) if (drop.has(sets[i].sessionId)) sets.splice(i, 1);
    let k = 0;
    let volume = 0;
    for (const ex of UPPER_DAY) {
      const exerciseId = catalogId.get(ex.name);
      if (!exerciseId) continue;
      const kg = lastKg.get(ex.name) ?? ex.fallbackKg;
      for (let n = 1; n <= ex.sets; n++) {
        const at = new Date(host.startedAt.getTime() + k++ * 150_000);
        volume += kg * ex.reps;
        sets.push({
          id: `synth_upper_${k}`,
          userId: SOLO_USER_ID,
          sessionId: host.id,
          exerciseId,
          setNumber: n,
          reps: ex.reps,
          weight: kg,
          rpe: 8,
          restSeconds: 90,
          isWarmup: false,
          isPR: false,
          notes: null,
          createdAt: at,
        });
      }
    }
    host.templateName = "Upper";
    host.sessionVolume = Math.round(volume);
  }

  // A night (or a workout) must move as one piece: correcting its start and
  // end separately splits them by 12h on the travel days where the home/away
  // flag flips in between. Both ends take the correction of the row's anchor.
  const shWith = (d: Date | null, anchorFor: Date) =>
    d ? new Date(d.getTime() + shiftMs + corrMs(anchorFor)) : null;

  // ---- synthetic cycle --------------------------------------------------------
  // Made up on purpose (Kalysha, 2026-09-21): a fixed 28-day pattern pinned so
  // the demo's today is always cycle day SYNTH_TODAY_CYCLE_DAY. It reads none of
  // the source tenant's cycle logs, so it reveals nothing about her real cycle.
  const SYNTH_CYCLE_LEN = 28;
  const SYNTH_TODAY_CYCLE_DAY = 10;
  const demoToday = new Date(anchor.getTime() - DAY);
  const synthPhase = (demoDay: Date): string => {
    const back = Math.round((demoToday.getTime() - utcMidnight(demoDay).getTime()) / DAY);
    const cd = ((((SYNTH_TODAY_CYCLE_DAY - 1 - back) % SYNTH_CYCLE_LEN) + SYNTH_CYCLE_LEN) % SYNTH_CYCLE_LEN) + 1;
    return cd <= 5 ? "menstrual" : cd <= 13 ? "follicular" : cd <= 16 ? "ovulation" : "luteal";
  };
  const cycleRows: Row[] = [];
  for (let back = 150; back >= -1; back--) {
    const day = new Date(demoToday.getTime() - back * DAY);
    cycleRows.push({ userId: DEMO_USER_ID, day, phase: synthPhase(day), source: "manual" });
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
        // Weekly run-volume landmarks (demo only, 2026-09-21). Real users set
        // their own; until then their run card shows plain weekly km.
        runMevKm: 16,
        runMavKm: 24,
        runMrvKm: 32,
      })
    : null;

  // Run detail (demo only): km splits and walk breaks are not in the source
  // data yet (a later native sync will walk HealthKit segments backwards for
  // real users). For the demo, derive plausible splits from each run's own
  // pace — deterministic per workout, summing to its duration — and give the
  // runs whose sample note mentions walking two walk breaks.
  const runDetailFor = (r: { id: string; name: string; durationSeconds: number; distance: number | null; distanceUnit: string | null }) => {
    if (!/run/i.test(r.name) || r.distance == null || r.distance <= 0) return {};
    const km = (r.distanceUnit ?? "km").toLowerCase() === "m" ? r.distance / 1000 : r.distance;
    if (km < 1) return {};
    const rand = mulberry32(hash(r.id));
    const full = Math.floor(km);
    const avg = r.durationSeconds / km;
    // whole-km splits only (the handoff shows five for a 5.45 km run):
    // slightly slower each km, ±4% noise, scaled to the time spent on full kms
    const raw = Array.from({ length: full }, (_, i) => avg * (1 + 0.01 * i + (rand() - 0.5) * 0.08));
    const scale = (avg * full) / raw.reduce((a, b) => a + b, 0);
    const splits = raw.map((v) => Math.round(v * scale));
    const walks = avg > 420 ? 2 : 0; // slower than 7:00/km → the walk-break runs
    return {
      splitsJson: JSON.stringify(splits),
      walkBreakCount: walks,
      walkBreakSeconds: walks ? 220 : 0,
    };
  };

  // ---- synthetic experiments (values pulled from the demo's real dailies) ---
  const byDay = <T extends { day: Date }>(rows: T[], pick: (r: T) => number | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const v = pick(r);
      if (typeof v === "number") m.set(iso(shDay(r.day)), v);
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
  const lastNight = sleep.find((s) => s.day.getTime() === showcase.getTime());
  const recentHrv = sleep
    .filter((s) => s.averageHrv != null && s.day.getTime() <= showcase.getTime() && s.day.getTime() > showcase.getTime() - 14 * DAY)
    .map((s) => s.averageHrv as number);
  const hrvAvg = recentHrv.length ? Math.round(recentHrv.reduce((a, b) => a + b, 0) / recentHrv.length) : null;
  const lastReadiness = readiness.find((r) => r.day.getTime() === showcase.getTime());
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
          baselineStartedAt: srcUser?.baselineStartedAt ? shDay(srcUser.baselineStartedAt) : null,
        },
        update: {
          baselineStartedAt: srcUser?.baselineStartedAt ? shDay(srcUser.baselineStartedAt) : null,
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
      await put(
        "DailySleep",
        t.dailySleep,
        sleep.map((r) =>
          tx(r, [], { bedtimeStart: shWith(r.bedtimeStart, r.day), bedtimeEnd: shWith(r.bedtimeEnd, r.day) }),
        ),
      );
      await put("CyclePhaseLog", t.cyclePhaseLog, cycleRows);
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
      await put("WorkoutSession", t.workoutSession, sessions.map((r) => tx(r, [], { notes: null, cyclePhase: synthPhase(shDay(r.date)) })));
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
        hkWorkouts.map((r) =>
          tx(r, [], {
            routeJson: null,
            externalId: did(r.externalId),
            endedAt: shWith(r.endedAt, r.startedAt),
            ...runDetailFor(r),
          }),
        ),
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
    showcaseDay: showcaseKey,
    showcasePick: override && sleepDays.has(override) ? "override" : bothDays.length ? "run+strength" : "last-sleep-day",
    todayDay: iso(new Date(anchor.getTime() - DAY)),
    redatedSessions,
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
