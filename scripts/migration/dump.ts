// STEP 1 — run this WHILE THE SCHEMA IS STILL SQLITE (before flipping the
// provider / running prisma generate against Postgres).
//
//   npx tsx scripts/migration/dump.ts
//
// Dumps every model to migration-dump/<model>.json, preserving all ids and
// foreign keys exactly. No transformation here — just a faithful export.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ALL_MODELS, DUMP_DIR } from "./_shared";

const prisma = new PrismaClient();

async function main() {
  mkdirSync(DUMP_DIR, { recursive: true });

  for (const m of ALL_MODELS) {
    const rows = await (prisma as any)[m].findMany();
    writeFileSync(path.join(DUMP_DIR, `${m}.json`), JSON.stringify(rows, null, 2));
    console.log(`${m.padEnd(26)} ${rows.length}`);
  }

  console.log(`\nDump complete -> ${DUMP_DIR}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
