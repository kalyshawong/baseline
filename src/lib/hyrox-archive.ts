/**
 * Lazy plan archival — call at the top of any /api/hyrox/* GET handler.
 *
 * A HyroxPlan is "active" until its raceDate passes; we auto-flip it to
 * "archived" the first time someone reads it after that point. This avoids a
 * separate cron and keeps the lifecycle eventually-consistent.
 *
 * Spec: docs/hyrox-module-spec.md § Phased implementation, item 7
 */

import { prisma } from "./db";
import { DemoReadOnlyError } from "./demo/constants";
import type { HyroxPlan } from "@prisma/client";

/**
 * If the plan is still marked active but its raceDate is in the past,
 * flip it to archived and return the updated row. Otherwise, return the
 * plan unchanged.
 */
export async function maybeArchivePlan(plan: HyroxPlan): Promise<HyroxPlan> {
  if (plan.status !== "active") return plan;

  const now = new Date();
  if (plan.raceDate.getTime() >= startOfDay(now).getTime()) {
    return plan;
  }

  try {
    return await prisma.hyroxPlan.update({
      where: { id: plan.id },
      data: { status: "archived" },
    });
  } catch (err) {
    // This runs on GET paths. The read-only demo tenant refuses the write;
    // show the plan as archived for this render instead of failing the page.
    if (err instanceof DemoReadOnlyError) return { ...plan, status: "archived" };
    throw err;
  }
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
