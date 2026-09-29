import { prisma } from "@/lib/db";
import { hasSmartScale } from "@/lib/smart-scale";
import { getLocalDayBounds, getLocalDayStr, getRequestTz } from "@/lib/date-utils";
import { buildSessionPlan, weeklyMuscleBands, MUSCLE_LABELS } from "@/lib/strength/session-plan";
import { lifterSoreness, SORE_TILES, type SorenessMap } from "@/lib/strength/body";
import { matchSplitDay, usualNextDay, type TrainingSplit } from "@/lib/strength/split";

/**
 * Today, lifter version — design_handoff_baseline_ios_strength, screen 3.
 *
 * DATA ONLY (decision 2026-09-28): Baseline never plans someone's training.
 * No Push / Hold / Deload. What's "next" comes from the split they stated at
 * intake (their rotation), else from their own last 3 weeks. Inputs are read
 * against their own normal and labelled as data, never as instructions.
 * No HRV anywhere.
 */

export type Effect = { text: string; tone: "up" | "eq" | "dn" };

export interface MuscleCall {
  id: string;
  name: string;
  sets: number;
  band: [number, number, number] | null;
  sore: number | null; // 0–3, null when no check-in
  /** Sessions in the last 7 days that trained this muscle. */
  hits: number;
  /** How often their stated split hits it a week (null without a split). */
  usualHits: number | null;
}

export interface LifterToday {
  template: string | null;
  /** Where "next" came from: their stated split, their recent history, or nothing yet. */
  nextSource: "split" | "history" | null;
  /** "Push / Pull / Legs" — the stated split's day names. */
  splitLabel: string | null;
  /** Completed sessions this week (Mon–today) vs the days a week they stated. */
  week: { done: number; stated: number | null };
  exercises: number;
  sets: number;
  lastDurationMin: number | null;
  /** Completed session today (by this template or any). */
  loggedToday: { id: string; template: string | null; sets: number; minutes: number | null } | null;
  muscles: MuscleCall[];
  sleep: { minutes: number | null; normalMinutes: number | null; score: number | null; source: string | null; effect: Effect };
  rhr: { value: number | null; normal: number | null; source: string | null; effect: Effect };
  soreness: { present: boolean; lines: string[]; effect: Effect };
  volume: { headline: string; sub: string; effect: Effect };
  weight: { latestKg: number; latestDay: string; avg7: number | null; today: boolean } | null;
  /** Smart-scale user — gates the morning weigh-in link. */
  hasScale: boolean;
  unit: "kg" | "lb";
  eveningDone: boolean;
}

const fmtMin = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
export { fmtMin };

function soreTileForMuscle(id: string): string[] {
  // muscleGroup → soreness tiles that cover it
  if (id === "shoulders") return ["front delts", "side delts", "rear delts"];
  return SORE_TILES.some((t) => t.id === id) ? [id] : [];
}

export async function lifterToday(split: TrainingSplit | null = null): Promise<LifterToday> {
  const tz = await getRequestTz();
  const todayStr = getLocalDayStr(tz);
  const { start, end } = getLocalDayBounds(todayStr, tz);

  const recent = await prisma.workoutSession.findMany({
    where: { completedAt: { not: null }, date: { gte: new Date(Date.now() - 60 * 86400_000) } },
    orderBy: { date: "desc" },
    select: { id: true, templateName: true, date: true, durationMin: true, completedAt: true, _count: { select: { sets: true } } },
  });
  const loggedTodayRow = recent.find((s) => s.completedAt && s.completedAt >= start && s.completedAt <= end) ?? null;

  // ---- what's usually next — THEIR rotation, never our plan
  let template: string | null = null;
  let nextSource: LifterToday["nextSource"] = null;
  let splitMuscles: string[] | null = null;
  const hasSplit = !!split && split.days.length > 0;
  if (hasSplit) {
    // A session logged today counts as today's day; "next" is the one after it.
    const nx = usualNextDay(split!, recent.map((s) => s.templateName));
    if (nx) {
      const day = split!.days[nx.index];
      // Reuse the template name they actually log under ("Push A"), else the day's name.
      const logged = recent.find((s) => matchSplitDay(s.templateName, [day]) === 0);
      template = logged?.templateName ?? day.name;
      splitMuscles = day.muscles;
      nextSource = "split";
    }
  } else {
    // No split stated: the template they've gone longest without (last 21 days).
    const lastByTemplate = new Map<string, Date>();
    for (const s of recent) {
      if (s.date < new Date(Date.now() - 21 * 86400_000)) continue;
      const t = s.templateName ?? "Session";
      if (!lastByTemplate.has(t)) lastByTemplate.set(t, s.date);
    }
    if (lastByTemplate.size) {
      template = [...lastByTemplate.entries()].sort((a, b) => a[1].getTime() - b[1].getTime())[0][0];
      nextSource = "history";
    }
  }
  const plan = template ? await buildSessionPlan(template) : null;
  const planSets = plan && plan.lastSessionDate ? plan.exercises.reduce((n, e) => n + e.plan.length, 0) : 0;
  const planMuscles = plan && plan.lastSessionDate ? [...new Set(plan.exercises.map((e) => e.muscle))] : [];

  // ---- sessions this week, and per-muscle hits in the last 7 days
  const dow = (new Date(`${todayStr}T12:00:00Z`).getUTCDay() + 6) % 7; // Mon = 0
  const weekStart = getLocalDayBounds(new Date(Date.parse(`${todayStr}T12:00:00Z`) - dow * 86400_000).toISOString().slice(0, 10), tz).start;
  const weekDone = recent.filter((s) => s.date >= weekStart).length;
  const hitRows = await prisma.workoutSet.findMany({
    where: { isWarmup: false, session: { completedAt: { not: null }, date: { gte: new Date(Date.now() - 7 * 86400_000) } } },
    select: { sessionId: true, exercise: { select: { muscleGroup: true } } },
  });
  const hitSessions: Record<string, Set<string>> = {};
  for (const r of hitRows) (hitSessions[r.exercise.muscleGroup] ??= new Set()).add(r.sessionId);
  const usualHits = (id: string): number | null => {
    if (!hasSplit || !split!.daysPerWeek) return null;
    const n = split!.days.filter((d) => d.muscles.includes(id)).length;
    return Math.round(((split!.daysPerWeek * n) / split!.days.length) * 2) / 2;
  };

  // ---- inputs
  const [bands, sore, sleepRow, garminRow, ouraRow, rhrHist, sleepHist, weightRows, soreToday, tagsToday, profile] = await Promise.all([
    weeklyMuscleBands(),
    lifterSoreness(),
    prisma.dailySleep.findFirst({ where: { day: { lte: end }, totalSleepDuration: { not: null } }, orderBy: { day: "desc" }, select: { day: true, totalSleepDuration: true } }).catch(() => null),
    prisma.garminDaily.findFirst({ where: { day: { lte: end }, OR: [{ sleepSeconds: { not: null } }, { restingHr: { not: null } }] }, orderBy: { day: "desc" } }),
    prisma.dailyReadiness.findFirst({ where: { day: { lte: end }, restingHeartRate: { not: null } }, orderBy: { day: "desc" }, select: { day: true, restingHeartRate: true } }),
    prisma.garminDaily.findMany({ where: { day: { gte: new Date(Date.now() - 60 * 86400_000) }, restingHr: { not: null } }, select: { restingHr: true } }),
    prisma.garminDaily.findMany({ where: { day: { gte: new Date(Date.now() - 60 * 86400_000) }, sleepSeconds: { not: null } }, select: { sleepSeconds: true } }),
    prisma.weightLog.findMany({ where: { day: { gte: new Date(Date.now() - 8 * 86400_000) } }, orderBy: { day: "desc" }, select: { day: true, weightKg: true } }),
    prisma.sorenessLog.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.activityTag.count({ where: { timestamp: { gte: start, lte: end } } }),
    prisma.userProfile.findFirst({ select: { unit: true } }),
  ]);

  // Sleep: Garmin first (lifter with a Forerunner), else DailySleep.
  const dayAgo = new Date(Date.now() - 36 * 3600_000);
  let sleepMin: number | null = null, sleepScore: number | null = null, sleepSource: string | null = null;
  if (garminRow?.sleepSeconds != null && garminRow.day >= dayAgo) { sleepMin = garminRow.sleepSeconds / 60; sleepScore = garminRow.sleepScore; sleepSource = "Garmin"; }
  else if (sleepRow?.totalSleepDuration != null && sleepRow.day >= dayAgo) { sleepMin = sleepRow.totalSleepDuration / 60; sleepSource = "Apple Health"; }
  let sleepNormal: number | null = null;
  if (sleepHist.length >= 14) sleepNormal = sleepHist.reduce((s, r) => s + (r.sleepSeconds as number), 0) / sleepHist.length / 60;
  else {
    const ds = await prisma.dailySleep.findMany({ where: { day: { gte: new Date(Date.now() - 60 * 86400_000) }, totalSleepDuration: { not: null } }, select: { totalSleepDuration: true } }).catch(() => []);
    if (ds.length >= 14) sleepNormal = ds.reduce((s, r) => s + (r.totalSleepDuration as number), 0) / ds.length / 60;
  }
  // Labels are data vs THEIR normal — no textbook 7 h stand-in before 14 nights.
  let sleepEffect: Effect = { text: "No sleep data", tone: "eq" };
  if (sleepMin != null) {
    if (sleepNormal == null) sleepEffect = { text: "Learning your normal", tone: "eq" };
    else {
      const diff = sleepMin - sleepNormal;
      if (diff >= 15) sleepEffect = { text: "Above your normal", tone: "up" };
      else if (diff > -15) sleepEffect = { text: "Normal", tone: "eq" };
      else if (diff > -45) sleepEffect = { text: "Below your normal", tone: "eq" };
      else sleepEffect = { text: "Well below your normal", tone: "dn" };
    }
  }

  // Resting HR
  let rhr: number | null = null, rhrSource: string | null = null;
  if (garminRow?.restingHr != null && garminRow.day >= dayAgo) { rhr = garminRow.restingHr; rhrSource = "Garmin"; }
  else if (ouraRow?.restingHeartRate != null && ouraRow.day >= dayAgo) { rhr = ouraRow.restingHeartRate; rhrSource = "Oura"; }
  const rhrNormal = rhrHist.length >= 14 ? rhrHist.reduce((s, r) => s + (r.restingHr as number), 0) / rhrHist.length : null;
  let rhrEffect: Effect = { text: rhr == null ? "No data" : rhrNormal == null ? "Learning your normal" : "Normal", tone: "eq" };
  if (rhr != null && rhrNormal != null) {
    if (rhr - rhrNormal >= 3) rhrEffect = { text: `${Math.round(rhr - rhrNormal)} above your normal`, tone: "dn" };
    else if (rhr - rhrNormal <= -1) rhrEffect = { text: "Below your normal", tone: "up" };
  }

  // Muscles on deck: the split day's muscles (stated), else what that session trained last time.
  const soreLevel = (id: string): number | null => {
    const tiles = soreTileForMuscle(id);
    if (!tiles.length || !sore.lastLoggedAt) return null;
    return Math.max(...tiles.map((t) => sore.levels[t] ?? 0));
  };
  const deck = splitMuscles ?? planMuscles;
  const muscles: MuscleCall[] = deck.map((id) => {
    const b = bands.find((x) => x.id === id);
    return {
      id,
      name: MUSCLE_LABELS[id] ?? id,
      sets: b?.sets ?? 0,
      band: b?.band ?? null,
      sore: soreLevel(id),
      hits: hitSessions[id]?.size ?? 0,
      usualHits: usualHits(id),
    };
  });

  // Soreness input line — which of today's muscles are sore, nothing more.
  const soreNames = muscles.filter((m) => (m.sore ?? 0) >= 2).map((m) => m.name);
  const sorenessLines = muscles.filter((m) => m.sore != null).map((m) => `${m.name} ${m.sore}`);
  const sorenessEffect: Effect = !sore.lastLoggedAt
    ? { text: "No check-in", tone: "eq" }
    : soreNames.length ? { text: `Sore: ${soreNames.join(" · ").toLowerCase()}`, tone: "dn" } : { text: "Nothing sore", tone: "eq" };

  // Volume input line — sets vs band, as a count.
  const below = muscles.filter((m) => m.band && m.sets < m.band[0]);
  const above = muscles.filter((m) => m.band && m.sets > m.band[2]);
  const first = muscles[0];
  const volume = first
    ? {
        headline: `${first.name} ${first.sets}`,
        sub: first.band ? (first.sets < first.band[0] ? `under your ${first.band[0]} min` : first.sets > first.band[2] ? `over your ${first.band[2]} max` : `of ${first.band[0]}–${first.band[2]}`) : "no band yet",
        effect: above.length
          ? { text: `Over band: ${above.map((m) => m.name).join(" · ").toLowerCase()}`, tone: "dn" as const }
          : below.length
            ? { text: `Under band: ${below.map((m) => m.name).join(" · ").toLowerCase()}`, tone: "eq" as const }
            : { text: "In band", tone: "eq" as const },
      }
    : { headline: "—", sub: "Nothing logged yet", effect: { text: "No data", tone: "eq" as const } };

  // Weight
  const latestW = weightRows[0] ?? null;
  const weight = latestW
    ? {
        latestKg: latestW.weightKg,
        latestDay: latestW.day.toISOString().slice(0, 10),
        avg7: weightRows.length ? weightRows.slice(0, 7).reduce((s, r) => s + r.weightKg, 0) / Math.min(7, weightRows.length) : null,
        today: latestW.day.toISOString().slice(0, 10) === todayStr,
      }
    : null;

  return {
    template,
    nextSource,
    splitLabel: hasSplit ? split!.days.map((d) => d.name).join(" / ") : null,
    week: { done: weekDone, stated: split?.daysPerWeek ?? null },
    exercises: plan && plan.lastSessionDate ? plan.exercises.length : 0,
    sets: planSets,
    lastDurationMin: plan?.lastDurationMin ?? null,
    loggedToday: loggedTodayRow ? { id: loggedTodayRow.id, template: loggedTodayRow.templateName, sets: loggedTodayRow._count.sets, minutes: loggedTodayRow.durationMin } : null,
    muscles,
    sleep: { minutes: sleepMin, normalMinutes: sleepNormal, score: sleepScore, source: sleepSource, effect: sleepEffect },
    rhr: { value: rhr, normal: rhrNormal, source: rhrSource, effect: rhrEffect },
    soreness: { present: !!sore.lastLoggedAt, lines: sorenessLines, effect: sorenessEffect },
    volume,
    weight,
    hasScale: await hasSmartScale(),
    eveningDone: soreToday > 0 || tagsToday > 0,
    unit: profile?.unit === "kg" ? "kg" : "lb",
  };
}

export type { SorenessMap };
