/**
 * Hyrox plan sync — called from the goals POST/PATCH handlers inside an
 * existing transaction to create or update the HyroxPlan alongside the goal.
 *
 * Rules (spec § Goal integration):
 *   - Only acts when goal.type === "race" && goal.subtype === "hyrox" && goal.deadline.
 *   - On create (no existing plan): auto-scale block days from weeksToRace.
 *   - On update (existing plan, still hyrox): refresh raceDate + targetTime,
 *     but NEVER recompute block days. The /api/hyrox/plan/[id] Recalculate
 *     action is the only way to re-run autoScaleBlocks — user may have
 *     customized the schedule.
 *   - If subtype has moved away from hyrox: no-op. The caller controls
 *     whether to leave the stale plan in place (we do — user may revert).
 *
 * Any exception thrown here propagates out of the transaction, rolling back
 * the goal save. That's intentional: a broken HyroxPlan means the goal save
 * should fail loudly so the caller sees the mismatch.
 */

import type { Prisma, Goal } from "@prisma/client";
import { parseTargetTimeSeconds } from "./hyrox-pace";
import { autoScaleBlocks, weeksToRace } from "./hyrox-blocks";

/** sub-85 min default when goal.target is unparseable. */
const DEFAULT_TARGET_SECONDS = 5100;

/**
 * Create or update the HyroxPlan linked to this goal. Call from inside an
 * existing prisma.$transaction(async (tx) => ...) block. Returns silently
 * when the goal is not a Hyrox race goal (no error, no mutation).
 */
export async function syncHyroxPlanForGoal(
  tx: Prisma.TransactionClient,
  goal: Pick<Goal, "id" | "type" | "subtype" | "target" | "deadline">
): Promise<void> {
  if (goal.type !== "race" || goal.subtype !== "hyrox" || !goal.deadline) {
    return;
  }

  const raceDate = goal.deadline;
  const targetTime = parseTargetTimeSeconds(goal.target) ?? DEFAULT_TARGET_SECONDS;

  const existing = await tx.hyroxPlan.findUnique({
    where: { goalId: goal.id },
  });

  if (existing) {
    // Plan already exists — refresh only the fields that track the goal,
    // never the block schedule.
    await tx.hyroxPlan.update({
      where: { goalId: goal.id },
      data: {
        raceDate,
        targetTime,
      },
    });
    return;
  }

  // New plan — auto-scale block days from the runway at creation time.
  const weeks = weeksToRace(raceDate, new Date());
  const blocks = autoScaleBlocks(weeks);

  await tx.hyroxPlan.create({
    data: {
      goalId: goal.id,
      raceDate,
      targetTime,
      accumulationDays: blocks.accumulationDays,
      transmutationDays: blocks.transmutationDays,
      realizationDays: blocks.realizationDays,
      taperDays: blocks.taperDays,
    },
  });
}
