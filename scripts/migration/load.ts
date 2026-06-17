// STEP 2 — run this AFTER you've flipped the schema to Postgres, run
// `prisma migrate dev`, and `prisma generate` (so the client knows about User,
// userId, etc.):
//
//   npx tsx scripts/migration/load.ts
//
// Reads migration-dump/*.json, stamps your userId on every row, and loads into
// Postgres in foreign-key-dependency order. Idempotent (skipDuplicates), so
// safe to re-run if it fails partway.
//
// Confirmed decisions baked in:
//   - Exercise rows load as the SHARED CATALOG (userId = null)
//   - userId is stamped on EVERY other table (denormalized children)

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { USER_ID, USER_EMAIL, DUMP_DIR, dateReviver } from "./_shared";

const prisma = new PrismaClient();

function read(model: string): any[] {
  const f = path.join(DUMP_DIR, `${model}.json`);
  if (!existsSync(f)) return [];
  return JSON.parse(readFileSync(f, "utf8"), dateReviver);
}

// Insert in chunks — a single createMany of 1.2M rows (heartRateSample) would
// exceed Postgres/pooler limits. 5k per batch is safe and fast enough.
const BATCH = 5000;
async function insertMany(model: string, rows: any[]): Promise<number> {
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const res = await (prisma as any)[model].createMany({ data: slice, skipDuplicates: true });
    done += res.count;
    if (rows.length > BATCH) {
      process.stdout.write(`\r${model.padEnd(26)} ${done}/${rows.length}`);
    }
  }
  if (rows.length > BATCH) process.stdout.write("\n");
  return done;
}

// Tables loaded generically: add userId, keep id/FKs, bulk insert.
// Order = parents before children.
const ORDER = [
  "goal",
  "hyroxPlan",
  "workoutSession",
  "workoutSet",
  "goalWorkoutTag",
  "hyroxSession",
  "hyroxStationBenchmark",
  "experiment",
  "experimentLog",
  "activityTag",
  "nutritionLog",
  "nutritionEntry",
  "chatSession",
  "chatMessage",
  "lifeContextDef",
  "lifeContextLog",
  "workoutTemplate",
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
];

async function main() {
  // 1) The tenant. baselineStartedAt = earliest sleep day we have (best "day 0").
  const sleep = read("dailySleep");
  const earliest = sleep.length
    ? new Date(Math.min(...sleep.map((r) => new Date(r.day).getTime())))
    : null;

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: USER_EMAIL, baselineStartedAt: earliest },
  });
  console.log(`user            1`);

  // 2) UserProfile — 1:1, drop the old Int id (new id is a cuid).
  for (const p of read("userProfile")) {
    const { id, ...rest } = p;
    await prisma.userProfile.upsert({
      where: { userId: USER_ID },
      update: {},
      create: { ...rest, userId: USER_ID },
    });
  }
  console.log(`userProfile     ${read("userProfile").length}`);

  // 3) OuraToken — drop the old autoincrement id, attach to user.
  for (const t of read("ouraToken")) {
    const { id, ...rest } = t;
    await prisma.ouraToken.upsert({
      where: { userId: USER_ID },
      update: {},
      create: { ...rest, userId: USER_ID },
    });
  }
  console.log(`ouraToken       ${read("ouraToken").length}`);

  // 4) Exercise — SHARED CATALOG: userId = null, keep ids.
  const exercises = read("exercise").map((e) => ({ ...e, userId: null }));
  if (exercises.length) {
    const n = await insertMany("exercise", exercises);
    console.log(`exercise        ${n} (shared catalog, userId=null)`);
  }

  // 5) Everything else — stamp userId, keep ids/FKs, bulk insert in FK order.
  for (const model of ORDER) {
    const rows = read(model).map((r) => ({ ...r, userId: USER_ID }));
    if (!rows.length) {
      console.log(`${model.padEnd(26)} 0`);
      continue;
    }
    const n = await insertMany(model, rows);
    console.log(`${model.padEnd(26)} ${n}`);
  }

  console.log("\nLoad complete. Now run recompute-baselines.ts, then migrate-counts.ts after.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
