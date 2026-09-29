import { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUserId, runAsUser } from "@/lib/current-user";
import { runCoachTurn } from "@/lib/coach-run";
import { buildWorkoutDiscussionStarter } from "@/lib/workout-discussion";
import { DEMO_USER_ID } from "@/lib/demo/constants";

/**
 * Real coach answers for the public demo's workouts (Kalysha, 2026-09-28:
 * "just pull the real answer for this for demo").
 *
 * The demo never calls Anthropic on a visitor's behalf. Instead, after each
 * reseed, this runs the real coach (same prompt, context and tools as
 * /api/coach, reading only the demo tenant) on the "Discuss with coach"
 * question for each recent demo workout and stores the exchange as a demo
 * chat session with a fixed id. /coach?workout=… for a demo visitor opens
 * that conversation instead of the empty draft. Cost is bounded: at most
 * MAX_WORKOUTS calls per reseed, none per visit. The reseed wipes these rows,
 * so answers always match the re-dated data.
 */

const MAX_WORKOUTS = 10;
const LOOKBACK_DAYS = 7;
/** Demo visitors are assumed US-Eastern, matching the seed's wall-clock fix. */
const DEMO_TZ = "America/New_York";

export function demoWorkoutSessionId(source: string, workoutId: string): string {
  return `demo_wk_${source}_${workoutId}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 190);
}

let rawClient: PrismaClient | undefined;
function raw(): PrismaClient {
  rawClient ??= new PrismaClient();
  return rawClient;
}

/** Whether any pre-generated workout answer exists in the demo tenant. */
export async function hasDemoWorkoutAnswers(): Promise<boolean> {
  const n = await raw().chatSession.count({
    where: { userId: DEMO_USER_ID, id: { startsWith: "demo_wk_" } },
  });
  return n > 0;
}

export interface WorkoutAnswerReport {
  considered: number;
  generated: number;
  skipped: number;
  failed: { workoutId: string; reason: string }[];
  ms: number;
}

export async function generateDemoWorkoutAnswers(now: Date = new Date()): Promise<WorkoutAnswerReport> {
  const t0 = Date.now();
  const report: WorkoutAnswerReport = { considered: 0, generated: 0, skipped: 0, failed: [], ms: 0 };
  if (!process.env.ANTHROPIC_API_KEY) {
    report.failed.push({ workoutId: "*", reason: "ANTHROPIC_API_KEY not set" });
    return report;
  }

  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
  const until = new Date(now.getTime() + 2 * 86_400_000); // seed keeps one "tomorrow"
  const workouts = await runAsUser(DEMO_USER_ID, () =>
    prisma.healthKitWorkout.findMany({
      where: { startedAt: { gte: since, lt: until } },
      orderBy: { startedAt: "desc" },
      take: MAX_WORKOUTS,
      select: { id: true, name: true, startedAt: true },
    }),
  );
  report.considered = workouts.length;

  const existing = new Set(
    (
      await raw().chatSession.findMany({
        where: { userId: DEMO_USER_ID, id: { in: workouts.map((w) => demoWorkoutSessionId("healthkit", w.id)) } },
        select: { id: true },
      })
    ).map((s) => s.id),
  );

  // Two at a time: keeps the cron inside its duration budget without
  // bursting the Anthropic rate limit.
  const queue = workouts.filter((w) => {
    if (existing.has(demoWorkoutSessionId("healthkit", w.id))) {
      report.skipped++;
      return false;
    }
    return true;
  });
  const worker = async () => {
    for (let w = queue.shift(); w; w = queue.shift()) {
      try {
        await answerOne(w);
        report.generated++;
      } catch (e) {
        report.failed.push({ workoutId: w.id, reason: String((e as Error)?.message ?? e).slice(0, 300) });
      }
    }
  };
  await Promise.all([worker(), worker()]);
  report.ms = Date.now() - t0;
  return report;
}

async function answerOne(w: { id: string; name: string; startedAt: Date }): Promise<void> {
  const question = await runAsUser(DEMO_USER_ID, () =>
    buildWorkoutDiscussionStarter("healthkit", w.id, DEMO_TZ),
  );
  if (!question) {
    const row = await raw().healthKitWorkout.findUnique({ where: { id: w.id }, select: { userId: true } });
    const seen = await runAsUser(DEMO_USER_ID, () => getCurrentUserId());
    throw new Error(`no draft for workout (row user ${row?.userId ?? "none"}, tenant ${seen})`);
  }

  const turn = await runAsUser(DEMO_USER_ID, () =>
    runCoachTurn({ history: [{ role: "user", content: question }] }),
  );
  if (!turn.ok) throw new Error(turn.reason);

  const day = w.startedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: DEMO_TZ });
  const askedAt = new Date(Math.min(w.startedAt.getTime() + 3 * 3_600_000, Date.now()));
  // Raw client: the tenant layer refuses every write while the tenant is
  // demo. This is the one server-side writer besides the seed itself.
  await raw().chatSession.create({
    data: {
      id: demoWorkoutSessionId("healthkit", w.id),
      userId: DEMO_USER_ID,
      title: `Sample: ${w.name}, ${day}`,
      createdAt: askedAt,
      messages: {
        create: [
          { userId: DEMO_USER_ID, role: "user", content: question, createdAt: askedAt },
          { userId: DEMO_USER_ID, role: "assistant", content: turn.text, createdAt: new Date(askedAt.getTime() + 20_000) },
        ],
      },
    },
  });
}
