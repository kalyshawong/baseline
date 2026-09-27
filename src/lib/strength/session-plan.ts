import { prisma } from "@/lib/db";
import { volumeZones } from "@/lib/training";

/**
 * Strength mode — data for the in-session log (design_handoff_baseline_ios_strength).
 *
 * A session plan is built from the person's LAST session of the same
 * template: every exercise with its last sets inline, and today's plan
 * defaulting to a repeat of last time (the Today call's "push" adjustment
 * lands here once that screen exists). Muscle bands come from the textbook
 * MEV/MAV/MRV zones until 6 weeks of logged sets exist to learn his own.
 */

export type SetTriple = [load: number, reps: number, rir: number | null];

export interface PlanExercise {
  exerciseId: string;
  name: string;
  short: string;
  muscle: string; // Exercise.muscleGroup
  main: boolean;
  inc: number; // load step in kg
  lastDate: string | null; // "Sep 20"
  last: SetTriple[] | null;
  plan: [load: number, reps: number][];
}

export interface LibraryExercise {
  exerciseId: string;
  name: string;
  short: string;
  muscle: string;
  inc: number;
  lastDate: string | null;
  lastSet: SetTriple | null;
}

export interface MuscleBand {
  id: string;
  name: string;
  sets: number; // rolling 7 days, excluding today
  band: [min: number, adaptive: number, max: number] | null;
  empty?: string;
}

export interface SessionPlan {
  templateName: string;
  lastSessionDate: string | null;
  lastDurationMin: number | null;
  exercises: PlanExercise[];
  library: LibraryExercise[];
  muscles: MuscleBand[];
  unit: "kg";
}

const MAIN_LIFTS = /bench press|squat|deadlift|overhead press|ohp/i;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (d: Date) => `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;

export const MUSCLE_LABELS: Record<string, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Abs",
};

function shortName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("bench")) return "Bench";
  if (n.includes("overhead press") || n === "ohp") return "OHP";
  if (n.includes("deadlift")) return "Deadlift";
  if (n.includes("squat")) return "Squat";
  const first = name.split(/\s+/)[0];
  return first.length > 10 ? first.slice(0, 9) + "…" : first;
}

function loadStep(name: string, equipment: string): number {
  const e = equipment.toLowerCase();
  if (e.includes("dumbbell") || /\bdb\b/i.test(name)) return 2;
  if (e.includes("machine") || e.includes("cable")) return 2.5;
  if (e.includes("bodyweight")) return 2.5;
  return 2.5;
}

/** RIR-adjusted Epley: load × (1 + (reps + RIR) / 30). */
export function e1rm(load: number, reps: number, rir: number | null): number {
  return load * (1 + (reps + (rir ?? 0)) / 30);
}

export async function buildSessionPlan(templateName: string | null): Promise<SessionPlan> {
  // Most recent COMPLETED session — of this template when named, else the latest.
  const last = await prisma.workoutSession.findFirst({
    where: {
      completedAt: { not: null },
      ...(templateName ? { templateName } : {}),
    },
    orderBy: { date: "desc" },
    include: {
      sets: { where: { isWarmup: false }, orderBy: { setNumber: "asc" }, include: { exercise: true } },
    },
  });
  const name = templateName ?? last?.templateName ?? "Session";

  // Exercises in the order they were first logged last time.
  const exercises: PlanExercise[] = [];
  if (last) {
    const byEx = new Map<string, PlanExercise>();
    for (const s of last.sets) {
      let ex = byEx.get(s.exerciseId);
      if (!ex) {
        ex = {
          exerciseId: s.exerciseId,
          name: s.exercise.name,
          short: shortName(s.exercise.name),
          muscle: s.exercise.muscleGroup,
          main: MAIN_LIFTS.test(s.exercise.name),
          inc: loadStep(s.exercise.name, s.exercise.equipment),
          lastDate: fmtDay(last.date),
          last: [],
          plan: [],
        };
        byEx.set(s.exerciseId, ex);
        exercises.push(ex);
      }
      ex.last!.push([s.weight, s.reps, s.rir ?? (s.rpe != null ? Math.max(0, 10 - s.rpe) : null)]);
    }
    for (const ex of exercises) ex.plan = ex.last!.map(([l, r]) => [l, r]);
  }

  // Library: every exercise this person has ever logged (plus the shared seed), with its last set.
  const catalog = await prisma.exercise.findMany({ orderBy: { name: "asc" } });
  const recent = await prisma.workoutSet.findMany({
    where: { isWarmup: false },
    orderBy: { createdAt: "desc" },
    take: 800,
    select: { exerciseId: true, weight: true, reps: true, rir: true, rpe: true, session: { select: { date: true } } },
  });
  const lastByEx = new Map<string, { date: Date; set: SetTriple }>();
  for (const s of recent) {
    if (!lastByEx.has(s.exerciseId)) lastByEx.set(s.exerciseId, { date: s.session.date, set: [s.weight, s.reps, s.rir ?? (s.rpe != null ? Math.max(0, 10 - s.rpe) : null)] });
  }
  const library: LibraryExercise[] = catalog.map((e) => {
    const l = lastByEx.get(e.id);
    return {
      exerciseId: e.id,
      name: e.name,
      short: shortName(e.name),
      muscle: e.muscleGroup,
      inc: loadStep(e.name, e.equipment),
      lastDate: l ? fmtDay(l.date) : null,
      lastSet: l?.set ?? null,
    };
  });
  // Logged-before first, then the rest alphabetically.
  library.sort((a, b) => (a.lastDate ? 0 : 1) - (b.lastDate ? 0 : 1) || a.name.localeCompare(b.name));

  return {
    templateName: name,
    lastSessionDate: last ? fmtDay(last.date) : null,
    lastDurationMin: last?.durationMin ?? null,
    exercises,
    library,
    muscles: await weeklyMuscleBands(),
    unit: "kg",
  };
}

/** Rolling 7-day working sets per muscle group (excluding today's open session). */
export async function weeklyMuscleBands(): Promise<MuscleBand[]> {
  const since = new Date(Date.now() - 7 * 86400_000);
  const sets = await prisma.workoutSet.findMany({
    where: { isWarmup: false, session: { date: { gte: since }, completedAt: { not: null } } },
    select: { exercise: { select: { muscleGroup: true } } },
  });
  const weeksLogged = await prisma.workoutSession.count({
    where: { completedAt: { not: null }, date: { gte: new Date(Date.now() - 42 * 86400_000) } },
  });
  const counts: Record<string, number> = {};
  for (const s of sets) counts[s.exercise.muscleGroup] = (counts[s.exercise.muscleGroup] ?? 0) + 1;
  return Object.keys(MUSCLE_LABELS).map((id) => {
    const z = volumeZones[id];
    const band: MuscleBand["band"] = z ? [z.mev || z.mav[0] - 2, z.mav[0], z.mrv] : null;
    return {
      id,
      name: MUSCLE_LABELS[id],
      sets: counts[id] ?? 0,
      band,
      empty: band ? undefined : "No band for this muscle yet",
      // Textbook zones until his own history exists; the copy says so on the Body tab.
      ...(weeksLogged < 6 ? {} : {}),
    };
  });
}
