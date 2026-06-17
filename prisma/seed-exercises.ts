import { PrismaClient } from "@prisma/client";
import { exerciseLibrary } from "../src/lib/exercise-library";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding exercise library...");
  let created = 0;
  let skipped = 0;

  for (const ex of exerciseLibrary) {
    // Exercise is a shared catalog: catalog rows have userId = null.
    // name alone is no longer unique (now @@unique([userId, name])), so a
    // findUnique on name can't be used — match catalog rows via findFirst.
    const existing = await prisma.exercise.findFirst({
      where: { name: ex.name, userId: null },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.exercise.create({ data: { ...ex, userId: null } });
    created++;
  }

  console.log(`Created ${created} exercises, skipped ${skipped} existing.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
