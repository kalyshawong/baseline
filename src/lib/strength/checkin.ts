import { prisma } from "@/lib/db";
import { getLocalDayBounds, getLocalDayStr, getRequestTz } from "@/lib/date-utils";
import { lifterSoreness } from "@/lib/strength/body";

/**
 * Data for the lifter check-in — design_handoff_baseline_ios_strength, screen 4.
 * Evening: session RPE · soreness map · protein vs target · tags.
 * Morning: body weight with 7-day average, rate and the phase corridor.
 */

export interface CheckinData {
  dateStr: string;
  session: { id: string; template: string | null; rpe: number | null } | null;
  soreness: Record<string, number>; // tile id → 0–3
  proteinTargetG: number | null;
  proteinAnswer: "yes" | "close" | "no" | null;
  tags: { tag: string; category: string }[];
  tagsToday: string[];
  weights: { day: string; kg: number }[]; // last 28 days, ascending
  todayKg: number | null;
  goal: "gain" | "lose" | "maintain";
  unit: "kg" | "lb";
}

export async function lifterCheckinData(): Promise<CheckinData> {
  const tz = await getRequestTz();
  const dateStr = getLocalDayStr(tz);
  const { start, end } = getLocalDayBounds(dateStr, tz);
  const [session, sore, profile, latestW, tagFreq, tagsToday, weights] = await Promise.all([
    prisma.workoutSession.findFirst({ where: { completedAt: { gte: start, lte: end } }, orderBy: { completedAt: "desc" }, select: { id: true, templateName: true, sessionRPE: true } }),
    lifterSoreness(),
    prisma.userProfile.findFirst({ select: { bodyWeightKg: true, goal: true, unit: true } }),
    prisma.weightLog.findFirst({ orderBy: { day: "desc" }, select: { weightKg: true } }),
    prisma.activityTag.groupBy({
      by: ["tag", "category"],
      where: { timestamp: { gte: new Date(Date.now() - 120 * 86400_000) }, category: { notIn: ["nutrition"] } },
      _count: true,
      orderBy: { _count: { tag: "desc" } },
      take: 8,
    }),
    prisma.activityTag.findMany({ where: { timestamp: { gte: start, lte: end } }, select: { tag: true, category: true } }),
    prisma.weightLog.findMany({ where: { day: { gte: new Date(Date.now() - 28 * 86400_000) } }, orderBy: { day: "asc" }, select: { day: true, weightKg: true } }),
  ]);
  const kg = latestW?.weightKg ?? profile?.bodyWeightKg ?? null;
  const proteinTag = tagsToday.find((t) => t.category === "nutrition" && /^protein (yes|close|no)$/.test(t.tag));
  const defaults = ["caffeine", "alcohol", "social", "study", "music", "breathing", "meditation"];
  const tags = tagFreq.length ? tagFreq.map((t) => ({ tag: t.tag, category: t.category })) : defaults.map((t) => ({ tag: t, category: t }));
  const todayRow = weights.find((w) => w.day.toISOString().slice(0, 10) === dateStr);
  const goal = profile?.goal === "gain" || profile?.goal === "lose" ? profile.goal : "maintain";
  return {
    dateStr,
    session: session ? { id: session.id, template: session.templateName, rpe: session.sessionRPE } : null,
    soreness: sore.levels,
    proteinTargetG: kg ? Math.round(kg * 1.6) : null,
    proteinAnswer: proteinTag ? (proteinTag.tag.split(" ")[1] as "yes" | "close" | "no") : null,
    tags,
    tagsToday: tagsToday.filter((t) => t.category !== "nutrition").map((t) => t.tag),
    weights: weights.map((w) => ({ day: w.day.toISOString().slice(0, 10), kg: w.weightKg })),
    todayKg: todayRow?.weightKg ?? null,
    goal,
    unit: profile?.unit === "kg" ? "kg" : "lb",
  };
}
