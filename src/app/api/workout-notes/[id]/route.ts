import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import {
  captureSignalsForDate,
  classifyGiFields,
  getWorkoutByIdAndSource,
  isValidWorkoutSource,
} from "@/lib/workout-notes";

const NARRATIVE_MAX_LEN = 4_000;

/**
 * PATCH /api/workout-notes/[id]
 * body: { narrative }
 *
 * Updates the narrative AND re-captures the signal snapshot. The
 * previous design left the snapshot frozen at create-time, but a
 * 2026-05-27 timezone bug created a class of notes whose snapshots
 * captured the wrong day's data (or nothing at all). Treating
 * narrative edits as an explicit refresh signal lets users recover
 * from those notes without manual DB surgery — just tap Edit, save,
 * and the snapshot rebuilds from the correct local day.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { narrative } = body ?? {};

    if (typeof narrative !== "string") {
      return NextResponse.json(
        { error: "narrative is required and must be a string" },
        { status: 400 },
      );
    }
    if (narrative.length > NARRATIVE_MAX_LEN) {
      return NextResponse.json(
        { error: `narrative must be ≤${NARRATIVE_MAX_LEN} chars` },
        { status: 400 },
      );
    }

    const existing = await prisma.workoutNote.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    // Re-derive a fresh snapshot from the workout's local day. If the
    // workout has been deleted or has an unexpected source, we keep
    // the existing (possibly stale) snapshot rather than corrupt it.
    let signalSnapshot: string | undefined;
    if (isValidWorkoutSource(existing.workoutSource)) {
      const workout = await getWorkoutByIdAndSource(
        existing.workoutSource,
        existing.workoutId,
      );
      if (workout) {
        const signals = await captureSignalsForDate(workout.workoutDate);
        signalSnapshot = JSON.stringify(signals);
      }
    }

    // The narrative changed, so re-classify the GI outcome to match.
    const gi = await classifyGiFields(narrative.trim());

    const updated = await prisma.workoutNote.update({
      where: { id },
      data: {
        narrative: narrative.trim(),
        // Editing the narrative invalidates any previous analysis —
        // null it so the UI prompts the user to re-analyze.
        analysis: null,
        ...(signalSnapshot ? { signalSnapshot } : {}),
        ...gi,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * DELETE /api/workout-notes/[id]
 *
 * Drops the note entirely. Useful when a user wants to clear out a
 * test entry. Not surfaced in V1 UI but having the endpoint avoids
 * having to do a schema migration later just to add destructive ops.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await prisma.workoutNote.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
