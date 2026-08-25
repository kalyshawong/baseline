import { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "@/lib/current-user";

/**
 * Prisma client with TENANT ISOLATION baked in (2026-08-26).
 *
 * After the multi-tenant flip, ~159 queries across the codebase still had no
 * user filter at all ("latest weight", "all experiments", "all chat
 * sessions") — fine solo, but they'd show a second account the solo user's
 * data. Instead of patching 159 callsites (and every future one), this
 * extension makes isolation the DEFAULT at the only choke point every query
 * passes through:
 *
 *   - reads/counts/groupBy/updateMany/deleteMany on user-owned models get
 *     `userId = current user` ANDed into their `where`
 *   - creates get `userId` stamped into `data` when absent
 *   - findUnique results are ownership-checked after the fetch (their WHERE
 *     must stay a pure unique key, so we can't inject there)
 *   - Exercise is special: `userId null` rows are the shared seed catalog,
 *     visible to everyone alongside the user's own
 *
 * Residual (audit later): `update`/`delete` by bare unique id pass through —
 * existing callsites overwhelmingly scope via compound keys or deleteMany.
 *
 * No recursion: auth's own `prisma.user` lookups hit a non-owned model and
 * return before the userId resolution; getCurrentUserId reads the JWT, not
 * the database.
 */

const OWNED_MODELS = new Set([
  "ActivityTag", "ChatMessage", "ChatSession", "CyclePhaseLog",
  "DailyActivity", "DailyReadiness", "DailyResilience", "DailyRunningMetrics",
  "DailySleep", "DailySpO2", "DailyStress", "DailyVO2Max", "EnvReading",
  "Exercise", "Experiment", "ExperimentLog", "Goal", "GoalWorkoutTag",
  "HealthKitSync", "HealthKitWorkout", "HeartRateSample",
  "HeartRateZoneSummary", "HyroxPlan", "HyroxSession",
  "HyroxStationBenchmark", "LifeContextDef", "LifeContextLog",
  "NutritionEntry", "NutritionLog", "OuraSession", "OuraToken", "OuraWorkout",
  "SleepTimeRecommendation", "SorenessLog", "SyncLog", "UserBaseline",
  "UserProfile", "WeightLog", "WorkoutNote", "WorkoutSession", "WorkoutSet",
  "WorkoutTemplate",
]);

/** userId is nullable here: null = shared seed rows, visible to all users. */
const SHARED_NULLABLE_MODELS = new Set(["Exercise"]);

function buildClient() {
  const base = new PrismaClient();
  return base.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!OWNED_MODELS.has(model)) return query(args);
          const userId = await getCurrentUserId();
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const a = (args ?? {}) as any;
          const scope = SHARED_NULLABLE_MODELS.has(model)
            ? { OR: [{ userId }, { userId: null }] }
            : { userId };

          switch (operation) {
            case "findMany":
            case "findFirst":
            case "findFirstOrThrow":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "deleteMany":
              a.where = a.where ? { AND: [a.where, scope] } : scope;
              return query(a);

            case "findUnique":
            case "findUniqueOrThrow": {
              const res = (await query(a)) as { userId?: string | null } | null;
              if (
                res &&
                res.userId !== undefined &&
                res.userId !== null &&
                res.userId !== userId
              ) {
                if (operation === "findUniqueOrThrow") {
                  throw new Error(`${model} not found`);
                }
                return null;
              }
              return res;
            }

            case "create":
              if (a.data && a.data.userId === undefined) a.data.userId = userId;
              return query(a);

            case "createMany":
              if (Array.isArray(a.data)) {
                for (const d of a.data) {
                  if (d.userId === undefined) d.userId = userId;
                }
              }
              return query(a);

            case "upsert":
              if (a.create && a.create.userId === undefined) {
                a.create.userId = userId;
              }
              return query(a);

            default:
              return query(a);
          }
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof buildClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
