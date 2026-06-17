/**
 * One-time backfill for WorkoutNote.signalSnapshot rows that predate
 * the 2026-05-28 schema additions (periodDay, temperatureDeviationC,
 * temperatureTrendDeviationC, cyclePhaseStaleDays, cyclePhaseLastLogged).
 *
 * Re-runs `captureSignalsForDate` for each note's workout day and
 * merges the result into the stored signalSnapshot. Existing fields
 * are PRESERVED — this only fills in nulls/missing keys, it does not
 * overwrite values that were captured at the original note-save time.
 *
 * Why preserve original values: HRV / sleep / readiness / baseline
 * score reflect the user's state at the moment they wrote the note.
 * If those numbers have since been re-synced or recomputed, we don't
 * want to lose the "at the time" snapshot. The new fields (period
 * day, temperature) come from durable daily tables (CyclePhaseLog,
 * DailyReadiness) which are bucket-keyed, so re-deriving them now
 * still gives the correct historical value.
 *
 * Run:
 *   npx ts-node scripts/backfill-workout-note-snapshots.ts
 *   # or
 *   npx tsx scripts/backfill-workout-note-snapshots.ts
 *
 * Idempotent — re-running on already-backfilled notes is a no-op.
 */
import { prisma } from "@/lib/db";
import { captureSignalsForDate } from "@/lib/workout-notes";
import { getWorkoutByIdAndSource, isValidWorkoutSource } from "@/lib/workout-notes";

async function main() {
  const notes = await prisma.workoutNote.findMany({
    orderBy: { workoutDate: "asc" },
  });

  console.log(`Found ${notes.length} WorkoutNote rows. Backfilling…\n`);

  let updated = 0;
  let skippedNoChange = 0;
  let skippedNoWorkout = 0;
  let errors = 0;

  for (const note of notes) {
    try {
      if (!isValidWorkoutSource(note.workoutSource)) {
        console.warn(`  ${note.id}: invalid source "${note.workoutSource}" — skipping`);
        errors++;
        continue;
      }
      const workout = await getWorkoutByIdAndSource(
        note.workoutSource,
        note.workoutId,
      );
      if (!workout) {
        console.warn(
          `  ${note.id}: workout ${note.workoutId} no longer exists — skipping`,
        );
        skippedNoWorkout++;
        continue;
      }

      // Existing snapshot (parsed). May be partial.
      const existing: Record<string, unknown> = note.signalSnapshot
        ? JSON.parse(note.signalSnapshot)
        : {};

      // Fresh snapshot for the same local day. Carries every current
      // field, including the new periodDay + temperatureDeviationC.
      const fresh = await captureSignalsForDate(workout.workoutDate);

      // Merge — `existing` takes precedence for any value the user
      // explicitly captured at note time. New keys (or keys whose
      // existing value is undefined/null) get backfilled from `fresh`.
      const merged: Record<string, unknown> = { ...fresh, ...existing };
      // BUT explicitly backfill the new fields when existing is
      // missing them entirely (older snapshots didn't have these
      // keys at all). If existing already has them, keep existing.
      const newFields: Array<keyof typeof fresh> = [
        "periodDay",
        "temperatureDeviationC",
        "temperatureTrendDeviationC",
        "cyclePhaseStaleDays",
        "cyclePhaseLastLogged",
      ];
      for (const k of newFields) {
        if (!(k in existing) || existing[k] === undefined) {
          merged[k] = fresh[k];
        }
      }

      const before = note.signalSnapshot ?? "";
      const after = JSON.stringify(merged);
      if (before === after) {
        skippedNoChange++;
        continue;
      }

      await prisma.workoutNote.update({
        where: { id: note.id },
        data: { signalSnapshot: after },
      });
      console.log(
        `  ${note.id}: backfilled (workout ${workout.id} on ${workout.workoutDate.toISOString().slice(0, 10)})`,
      );
      updated++;
    } catch (e) {
      console.error(`  ${note.id}: ERROR`, e);
      errors++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  updated: ${updated}`);
  console.log(`  skipped (no change): ${skippedNoChange}`);
  console.log(`  skipped (workout deleted): ${skippedNoWorkout}`);
  console.log(`  errors: ${errors}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
