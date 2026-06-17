/**
 * One-time backfill: label every WorkoutNote with a GI outcome derived
 * from its free-text `narrative`, so the meal->GI analyzer has an
 * outcome variable to work with (see docs/meal-gi-analyzer-spec.md).
 *
 * Requires the schema additions on WorkoutNote (run the migration first):
 *   giOutcome        String?   // none | mild | moderate | vomited
 *   giConfidence     Float?    // 0..1, classifier confidence
 *   giEvidence       String?   // quoted span justifying a positive label
 *   giNeedsReview    Boolean   @default(false)
 *
 * Idempotent: skips notes that already have a giOutcome unless --force.
 * Notes flagged needsReview are written with their (low-confidence)
 * label AND the flag, so you can review them in one query:
 *   prisma.workoutNote.findMany({ where: { giNeedsReview: true } })
 *
 * Run:
 *   npx ts-node scripts/backfill-gi-outcomes.ts          # only unlabeled
 *   npx ts-node scripts/backfill-gi-outcomes.ts --force  # re-label all
 *   npx ts-node scripts/backfill-gi-outcomes.ts --dry    # no writes
 */

import { prisma } from "../src/lib/db";
import { classifyNarrative } from "../src/lib/gi-classifier";

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — add it to .env");
    process.exit(1);
  }

  const notes = await prisma.workoutNote.findMany({
    orderBy: { workoutDate: "asc" },
    where: FORCE ? undefined : { giOutcome: null },
    select: { id: true, narrative: true, workoutDate: true },
  });

  console.log(
    `${notes.length} note(s) to classify${FORCE ? " (--force: re-labeling all)" : ""}${DRY ? " (--dry: no writes)" : ""}\n`,
  );

  const counts: Record<string, number> = { none: 0, mild: 0, moderate: 0, vomited: 0 };
  let review = 0;
  let llmCalls = 0;
  let errors = 0;

  for (const note of notes) {
    const day = note.workoutDate.toISOString().slice(0, 10);
    try {
      const c = await classifyNarrative(note.narrative);
      counts[c.outcome] = (counts[c.outcome] ?? 0) + 1;
      if (c.method === "llm") llmCalls++;
      if (c.needsReview) review++;

      const flag = c.needsReview ? "  ⚠ REVIEW" : "";
      const ev = c.evidence ? `  "${c.evidence.slice(0, 50)}"` : "";
      console.log(
        `  ${day}  ${c.outcome.padEnd(8)} conf=${c.confidence.toFixed(2)} (${c.method})${ev}${flag}`,
      );

      if (!DRY) {
        await prisma.workoutNote.update({
          where: { id: note.id },
          data: {
            giOutcome: c.outcome,
            giConfidence: c.confidence,
            giEvidence: c.evidence || null,
            giNeedsReview: c.needsReview,
          },
        });
      }
    } catch (e) {
      console.error(`  ${day}  ERROR`, e);
      errors++;
    }
  }

  const positives = counts.mild + counts.moderate + counts.vomited;
  console.log(`\nDone.`);
  console.log(`  labels: none=${counts.none} mild=${counts.mild} moderate=${counts.moderate} vomited=${counts.vomited}`);
  console.log(`  positive GI events: ${positives}`);
  console.log(`  flagged for review: ${review}`);
  console.log(`  llm calls: ${llmCalls}  (keyword-skipped: ${notes.length - llmCalls - errors})`);
  console.log(`  errors: ${errors}`);

  // Honor the no-invented-data / sample-size rule up front.
  if (positives < 6) {
    console.log(
      `\n  ⚠ Only ${positives} positive GI event(s). That's below the ~6 the analyzer\n` +
        `    needs to call a pattern. Don't trust meal->GI output yet — keep logging.`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
