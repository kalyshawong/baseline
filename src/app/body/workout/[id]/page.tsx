import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { WorkoutLogger } from "@/components/body/workout-logger";
import { workoutTemplates } from "@/lib/exercise-library";
import { safeJsonParse } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await prisma.workoutSession.findUnique({
    where: { id },
    include: {
      sets: {
        orderBy: { createdAt: "asc" },
        include: { exercise: true },
      },
    },
  });

  if (!session) notFound();

  const exercises = await prisma.exercise.findMany({
    orderBy: [{ isCompound: "desc" }, { name: "asc" }],
  });

  // Resolve template: check builtin first, then custom from DB
  let templateExercises: { name: string; targetSets: number; targetReps: number }[] | undefined;
  if (session.templateName) {
    const builtin = workoutTemplates.find((t) => t.name === session.templateName);
    if (builtin) {
      templateExercises = builtin.exercises;
    } else {
      const custom = await prisma.workoutTemplate.findUnique({
        where: { name: session.templateName },
      });
      if (custom) {
        const parsed = safeJsonParse<Array<{
          exerciseName: string;
          targetSets: number;
          targetReps: number;
        }>>(custom.exercises, []);
        templateExercises = parsed.map((e) => ({
          name: e.exerciseName,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
        }));
      }
    }
  }

  // Fetch previous session's sets for each exercise in this session (or template)
  const exerciseIdsInSession = new Set(session.sets.map((s) => s.exerciseId));
  if (templateExercises) {
    for (const ex of exercises) {
      if (templateExercises.some((te) => te.name === ex.name)) {
        exerciseIdsInSession.add(ex.id);
      }
    }
  }

  const previousByExercise: Record<
    string,
    Array<{ weight: number; reps: number; rpe: number | null }>
  > = {};

  for (const exerciseId of exerciseIdsInSession) {
    const lastSession = await prisma.workoutSession.findFirst({
      where: {
        id: { not: session.id },
        sets: { some: { exerciseId } },
        completedAt: { not: null },
      },
      orderBy: { date: "desc" },
      include: {
        sets: {
          where: { exerciseId, isWarmup: false },
          orderBy: { setNumber: "asc" },
        },
      },
    });
    if (lastSession) {
      previousByExercise[exerciseId] = lastSession.sets.map((s) => ({
        weight: s.weight,
        reps: s.reps,
        rpe: s.rpe,
      }));
    }
  }

  const initialSets = session.sets.map((s) => ({
    id: s.id,
    exerciseId: s.exerciseId,
    exerciseName: s.exercise.name,
    muscleGroup: s.exercise.muscleGroup,
    setNumber: s.setNumber,
    reps: s.reps,
    weight: s.weight,
    rpe: s.rpe,
    isWarmup: s.isWarmup,
    isPR: s.isPR,
  }));

  return (
    <div>
      <div className="mb-4">
        <p className="text-xs text-[var(--color-text-muted)]">
          {session.templateName ?? "Freestyle"}
          {session.readinessScore != null && <> · Readiness {session.readinessScore}</>}
          {session.cyclePhase && <> · {session.cyclePhase}</>}
          {session.completedAt && (
            <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-400">
              completed
            </span>
          )}
        </p>
      </div>
      <WorkoutLogger
        sessionId={session.id}
        exercises={exercises}
        initialSets={initialSets}
        previousByExercise={previousByExercise}
        templateExercises={templateExercises}
      />
    </div>
  );
}
