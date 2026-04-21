import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import { autoScaleBlocks, weeksToRace } from "@/lib/hyrox-blocks";

/**
 * PATCH /api/hyrox/plan/[id]
 *
 * Two modes:
 *   (a) Direct field overrides — any subset of:
 *         accumulationDays, transmutationDays, realizationDays, taperDays,
 *         weeklyRunHours, weeklyStrengthHours, weeklyCompromisedHours,
 *         targetTime, raceDate, startDate, status
 *   (b) { action: "recalculate" } — re-run autoScaleBlocks(weeksToRace) from
 *       the current date and write the new block day values. Leaves weekly
 *       hour targets and status alone.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === "recalculate") {
      const existing = await prisma.hyroxPlan.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Plan not found" }, { status: 404 });
      }

      const weeks = weeksToRace(existing.raceDate, new Date());
      const blocks = autoScaleBlocks(weeks);

      const updated = await prisma.hyroxPlan.update({
        where: { id },
        data: {
          accumulationDays: blocks.accumulationDays,
          transmutationDays: blocks.transmutationDays,
          realizationDays: blocks.realizationDays,
          taperDays: blocks.taperDays,
          startDate: new Date(),
          blockStartDate: new Date(),
        },
      });
      return NextResponse.json(updated);
    }

    // Mode (a): direct field overrides
    const data: Record<string, unknown> = {};

    const intFields = [
      "accumulationDays",
      "transmutationDays",
      "realizationDays",
      "taperDays",
      "targetTime",
    ] as const;
    for (const field of intFields) {
      if (body[field] !== undefined) {
        const n = Number(body[field]);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { error: `${field} must be a non-negative number` },
            { status: 400 }
          );
        }
        data[field] = Math.round(n);
      }
    }

    const floatFields = [
      "weeklyRunHours",
      "weeklyStrengthHours",
      "weeklyCompromisedHours",
    ] as const;
    for (const field of floatFields) {
      if (body[field] !== undefined) {
        const n = Number(body[field]);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { error: `${field} must be a non-negative number` },
            { status: 400 }
          );
        }
        data[field] = n;
      }
    }

    if (body.raceDate !== undefined) {
      data.raceDate = new Date(body.raceDate);
    }
    if (body.startDate !== undefined) {
      data.startDate = new Date(body.startDate);
    }
    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "archived") {
        return NextResponse.json(
          { error: "status must be 'active' or 'archived'" },
          { status: 400 }
        );
      }
      data.status = body.status;
    }
    if (body.currentBlock !== undefined) {
      data.currentBlock = body.currentBlock;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const updated = await prisma.hyroxPlan.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
