// Snapshot row counts for every model. Run it TWICE:
//   - before migration (against SQLite):  npx tsx scripts/migration/migrate-counts.ts before
//   - after  migration (against Postgres): npx tsx scripts/migration/migrate-counts.ts after
// Then diff counts.before.json vs counts.after.json — every number must match.

import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { ALL_MODELS } from "./_shared";

const prisma = new PrismaClient();

async function main() {
  const label = process.argv[2] === "after" ? "after" : "before";
  const counts: Record<string, number> = {};

  for (const m of ALL_MODELS) {
    counts[m] = await (prisma as any)[m].count();
  }

  const file = `counts.${label}.json`;
  writeFileSync(file, JSON.stringify(counts, null, 2));
  console.log(`Wrote ${file}`);
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
