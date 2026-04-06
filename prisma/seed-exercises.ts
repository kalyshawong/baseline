import { PrismaClient } from "@prisma/client";
import { exerciseLibrary } from "../src/lib/exercise-library";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding exercise library...");
  let created = 0;
  let skipped = 0;

  for (const ex of exerciseLibrary) {
    const existing = await prisma.exercise.findUnique({ where: { name: ex.name } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.exercise.create({ data: ex });
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
