import { prisma } from "@/lib/db";
import { getLocalDayBounds, getLocalDayStr, getRequestTz } from "@/lib/date-utils";
import { buildSessionPlan, weeklyMuscleBands, MUSCLE_LABELS } from "@/lib/strength/session-plan";
import { lifterSoreness, SORE_TILES, type SorenessMap } from "@/lib/strength/body";

/**
 * Today's call, lifter version — design_handoff_baseline_ios_strength, screen 3.
 * Four inputs vs the person's own normal (sleep, resting HR, soreness in
 * today's muscles, sets this week vs band). No HRV anywhere.
 */

export type Verdict = "Push" | "Hold" | "Deload";
export type Effect = { text: string; tone: "up" | "eq" | "dn" };

export interface MuscleCall {
  id: string;
  name: string;
  sets: number;
  band: [number, number, number] | null;
  sore: number | null; // 0–3, null when no check-in
  verdict: Verdict;
}

export interface LifterToday {
  template: string | null;
  exercises: number;
  sets: number;
  lastDurationMin: number | null;
  /** Completed session today (by this template or any). */
  loggedToday: { id: string; template: string | null; sets: number; minutes: number | null } | null;
  muscles: MuscleCall[];
  anyPush: boolean;
  sleep: { minutes: number | null; normalMinutes: number | null; score: number | null; source: string | null; effect: Effect };
  rhr: { value: number | null; normal: number | null; source: string | null; effect: Effect };
  soreness: { present: boolean; lines: string[]; effect: Effect };
  volume: { headline: string; sub: string; effect: Effect };
  weight: { latestKg: number; latestDay: string; avg7: number | null; today: boolean } | null;
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

export async function lifterToday(): Promise<LifterToday> {
  const tz = await getRequestTz();
  const todayStr = getLocalDayStr(tz);
  const { start, end } = getLocalDayBounds(todayStr, tz);

  // ---- which session is next: round-robin over templates seen in the last 21 days
  const recent = await prisma.workoutSession.findMany({
    where: { completedAt: { not: null }, date: { gte: new Date(Date.now() - 21 * 86400_000) } },
    orderBy: { date: "desc" },
    select: { id: true, templateName: true, date: true, durationMin: true, completedAt: true, _count: { select: { sets: true } } },
  });
  const loggedTodayRow = recent.find((s) => s.completedAt && s.completedAt >= start && s.completedAt <= end) ?? null;
  const lastByTemplate = new Map<string, Date>();
  for (const s of recent) {
    const t = s.templateName ?? "Session";
    if (!lastByTemplate.has(t)) lastByTemplate.set(t, s.date);
  }
  let template: string | null = null;
  if (lastByTemplate.size) {
    template = [...lastByTemplate.entries()].sort((a, b) => a[1].getTime() - b[1].getTime())[0][0];
  }
  const plan = template ? await buildSessionPlan(template) : null;
  const planSets = plan ? plan.exercises.reduce((n, e) => n + e.plan.length, 0) : 0;
  const planByMuscle: Record<string, number> = {};
  plan?.exercises.forEach((e) => { planByMuscle[e.muscle] = (planByMuscle[e.muscle] ?? 0) + e.plan.length; });

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
  let sleepEffect: Effect = { text: "No sleep data", tone: "eq" };
  let sleepOk = true;
  if (sleepMin != null) {
    const ref = sleepNormal ?? 7 * 60;
    if (sleepMin >= ref - 15) sleepEffect = { text: "Supports push", tone: "up" };
    else if (sleepMin < ref - 45) { sleepEffect = { text: "Holds all", tone: "dn" }; sleepOk = false; }
    else sleepEffect = { text: "Normal", tone: "eq" };
  }

  // Resting HR
  let rhr: number | null = null, rhrSource: string | null = null;
  if (garminRow?.restingHr != null && garminRow.day >= dayAgo) { rhr = garminRow.restingHr; rhrSource = "Garmin"; }
  else if (ouraRow?.restingHeartRate != null && ouraRow.day >= dayAgo) { rhr = ouraRow.restingHeartRate; rhrSource = "Oura"; }
  const rhrNormal = rhrHist.length >= 14 ? rhrHist.reduce((s, r) => s + (r.restingHr as number), 0) / rhrHist.length : null;
  let rhrEffect: Effect = { text: rhr == null ? "No data" : "Normal", tone: "eq" };
  let rhrOk = true;
  if (rhr != null && rhrNormal != null) {
    if (rhr - rhrNormal >= 3) { rhrEffect = { text: "Holds all", tone: "dn" }; rhrOk = false; }
    else if (rhr - rhrNormal <= -1) rhrEffect = { text: "Supports push", tone: "up" };
  }

  // Muscles on deck + verdicts
  const soreLevel = (id: string): number | null => {
    const tiles = soreTileForMuscle(id);
    if (!tiles.length || !sore.lastLoggedAt) return null;
    return Math.max(...tiles.map((t) => sore.levels[t] ?? 0));
  };
  const deck = plan ? Object.keys(planByMuscle) : [];
  const muscles: MuscleCall[] = deck.map((id) => {
    const b = bands.find((x) => x.id === id);
    const sets = b?.sets ?? 0;
    const band = b?.band ?? null;
    const sv = soreLevel(id);
    let verdict: Verdict;
    if ((sv ?? 0) >= 3 || (band && sets > band[2])) verdict = "Deload";
    else if (band && sets + planByMuscle[id] <= band[2] && sets < band[1] && (sv ?? 0) <= 1 && sleepOk && rhrOk) verdict = "Push";
    else verdict = "Hold";
    return { id, name: MUSCLE_LABELS[id] ?? id, sets, band, sore: sv, verdict };
  });

  // Soreness input line
  const holds = muscles.filter((m) => (m.sore ?? 0) >= 2).map((m) => m.name);
  const sorenessLines = muscles.filter((m) => m.sore != null).map((m) => `${m.name} ${m.sore}`);
  const sorenessEffect: Effect = !sore.lastLoggedAt
    ? { text: "Left out", tone: "eq" }
    : holds.length ? { text: `Holds ${holds.join(" · ").toLowerCase()}`, tone: "dn" } : { text: "Normal", tone: "eq" };

  // Volume input line
  const room = muscles.filter((m) => m.band && m.sets < m.band[1]);
  const first = room[0] ?? muscles[0];
  const volume = first
    ? {
        headline: `${first.name} ${first.sets}`,
        sub: first.band ? (first.sets < first.band[0] ? `under your ${first.band[0]} min` : first.sets > first.band[2] ? `over your ${first.band[2]} max` : `of ${first.band[0]}–${first.band[2]}`) : "no band yet",
        effect: room.length ? { text: `Room in ${room.map((m) => m.name).join(" · ").toLowerCase()}`, tone: "up" as const } : { text: "Week is full", tone: "eq" as const },
      }
    : { headline: "—", sub: "No session on deck", effect: { text: "No data", tone: "eq" as const } };

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
    exercises: plan?.exercises.length ?? 0,
    sets: planSets,
    lastDurationMin: plan?.lastDurationMin ?? null,
    loggedToday: loggedTodayRow ? { id: loggedTodayRow.id, template: loggedTodayRow.templateName, sets: loggedTodayRow._count.sets, minutes: loggedTodayRow.durationMin } : null,
    muscles,
    anyPush: muscles.some((m) => m.verdict === "Push"),
    sleep: { minutes: sleepMin, normalMinutes: sleepNormal, score: sleepScore, source: sleepSource, effect: sleepEffect },
    rhr: { value: rhr, normal: rhrNormal, source: rhrSource, effect: rhrEffect },
    soreness: { present: !!sore.lastLoggedAt, lines: sorenessLines, effect: sorenessEffect },
    volume,
    weight,
    eveningDone: soreToday > 0 || tagsToday > 0,
    unit: profile?.unit === "kg" ? "kg" : "lb",
  };
}

export type { SorenessMap };
