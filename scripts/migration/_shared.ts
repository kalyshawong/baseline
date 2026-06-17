// Shared constants + helpers for the SQLite -> Postgres multi-tenant migration.
// See MIGRATION_RUNBOOK.md for the order these scripts run in.

import path from "node:path";

// The single tenant that owns ALL existing data (you). Keep this stable across
// all three scripts. The User row is created in load.ts step 1.
export const USER_ID = "usr_kalysha"; // cuid-ish constant is fine for the seed user
export const USER_EMAIL = "kalysha@gmail.com";

export const DUMP_DIR = path.join(process.cwd(), "migration-dump");

// Every model, by its Prisma client accessor name. Used by dump.ts (dumps all)
// and migrate-counts.ts (counts all). Order here does NOT matter — load order is
// defined separately in load.ts.
export const ALL_MODELS = [
  "ouraToken",
  "userProfile",
  "exercise",
  "workoutTemplate",
  "goal",
  "hyroxPlan",
  "hyroxSession",
  "hyroxStationBenchmark",
  "workoutSession",
  "workoutSet",
  "goalWorkoutTag",
  "experiment",
  "experimentLog",
  "activityTag",
  "nutritionLog",
  "nutritionEntry",
  "chatSession",
  "chatMessage",
  "lifeContextDef",
  "lifeContextLog",
  "workoutNote",
  "dailyReadiness",
  "dailySleep",
  "dailyActivity",
  "dailyStress",
  "dailySpO2",
  "dailyResilience",
  "dailyRunningMetrics",
  "dailyVO2Max",
  "sleepTimeRecommendation",
  "ouraWorkout",
  "ouraSession",
  "heartRateSample",
  "heartRateZoneSummary",
  "cyclePhaseLog",
  "weightLog",
  "healthKitSync",
  "healthKitWorkout",
  "envReading",
  "syncLog",
] as const;

// JSON.parse reviver: turn ISO-8601 datetime strings back into Date objects so
// Prisma's createMany gets real dates, not strings.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
export function dateReviver(_key: string, value: unknown) {
  return typeof value === "string" && ISO.test(value) ? new Date(value) : value;
}
