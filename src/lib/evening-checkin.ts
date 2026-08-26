import { prisma } from "@/lib/db";
import { getLocalDayBounds } from "@/lib/date-utils";
import { getSorenessForDay } from "@/lib/soreness";
import { CANDIDATE_LIBRARY } from "@/lib/diagnose/candidates";
import type { Assignment } from "@/lib/diagnose/runs";

/**
 * Evening check-in (audit §1.4): friction removed from capture must be
 * replaced by ONE deliberate daily ritual moment, or the practice dissolves
 * — the lowest-burden logging methods produced the WORST habit formation
 * (J Technol Behav Sci 2021), while micro-EMA holds 67% compliance at 6
 * months. So: a single ~10-second card, evenings only, where every answer
 * is one tap and every question is RELEVANT (relevance, not volume,
 * predicts compliance):
 *
 *  1. today's randomized-run assignment — done or not (the highest-value
 *     answer in the app: adherence is what verdicts are made of)
 *  2. open soreness episodes — still sore, or cleared today
 *  3. her own frequent exposures not yet logged today — tap to log
 *
 * This module only ASSEMBLES the questions; the card component gates on
 * evening + today client-side and writes through existing APIs.
 */

export interface CheckinAssignment {
  kind: "experiment" | "diagnose";
  id: string; // experimentId | runId
  idx: number;
  armLabel: string;
  title: string;
}

export interface CheckinData {
  dateStr: string;
  suggestions: { tag: string; category: string }[];
  assignments: CheckinAssignment[];
  soreness: { bodyPart: string; severity: number; streak: number }[];
}

export async function getEveningCheckinData(
  todayStr: string,
  tz: string,
): Promise<CheckinData> {
  const { start, end } = getLocalDayBounds(todayStr, tz);

  const [freq, todayTags, experiments, diagnoseRuns, soreness] = await Promise.all([
    prisma.activityTag.groupBy({
      by: ["tag", "category"],
      where: {
        timestamp: { gte: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000) },
        category: { notIn: ["nutrition"] },
      },
      _count: true,
    }),
    prisma.activityTag.findMany({
      where: { timestamp: { gte: start, lt: end } },
      select: { tag: true },
    }),
    prisma.experiment.findMany({
      where: { status: { in: ["scheduled", "active"] }, assignments: { not: null } },
      select: { id: true, title: true, independentVariable: true, assignments: true },
    }),
    prisma.diagnoseRun.findMany({
      where: { status: { in: ["scheduled", "running"] } },
      select: { id: true, candidateId: true, assignments: true },
    }),
    getSorenessForDay(todayStr).catch(() => []),
  ]);

  const loggedToday = new Set(todayTags.map((t) => t.tag));
  // Her own recurring exposures (incl. common presets she actually uses),
  // minus anything already logged today — an unanswered chip is a real
  // question, an answered one is noise.
  const suggestions = freq
    .filter((f) => f._count >= 3 && !loggedToday.has(f.tag))
    .sort((a, b) => b._count - a._count)
    .slice(0, 6)
    .map((f) => ({ tag: f.tag, category: f.category }));

  const assignments: CheckinAssignment[] = [];
  for (const e of experiments) {
    try {
      const list: Assignment[] = JSON.parse(e.assignments!);
      for (const a of list) {
        if (a.date === todayStr && !a.done) {
          assignments.push({
            kind: "experiment",
            id: e.id,
            idx: a.idx,
            armLabel: a.arm === "A" ? e.independentVariable : "Usual (control)",
            title: e.title,
          });
        }
      }
    } catch { /* skip malformed */ }
  }
  for (const r of diagnoseRuns) {
    try {
      const list: Assignment[] = JSON.parse(r.assignments);
      const label = CANDIDATE_LIBRARY.find((c) => c.id === r.candidateId)?.label ?? r.candidateId;
      for (const a of list) {
        if (a.date === todayStr && !a.done) {
          assignments.push({
            kind: "diagnose",
            id: r.id,
            idx: a.idx,
            armLabel: a.arm === "A" ? label : "Usual (control)",
            title: label,
          });
        }
      }
    } catch { /* skip */ }
  }

  return {
    dateStr: todayStr,
    suggestions,
    assignments,
    soreness: soreness.map((s) => ({ bodyPart: s.bodyPart, severity: s.severity, streak: s.streak })),
  };
}
