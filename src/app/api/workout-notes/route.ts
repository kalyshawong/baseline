import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { apiError } from "@/lib/utils";
import {
  captureSignalsForDate,
  classifyGiFields,
  getWorkoutByIdAndSource,
  isValidWorkoutSource,
} from "@/lib/workout-notes";

const NARRATIVE_MAX_LEN = 4_000;

/**
 * GET /api/workout-notes?source=<healthkit|oura>&workoutId=<id>
 *
 * Returns the existing note for a workout, or 404 if none. The UI
 * uses this on mount to populate the textarea + render an existing
 * analysis if present.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");
    const workoutId = searchParams.get("workoutId");

    if (!isValidWorkoutSource(source)) {
      return NextResponse.json(
        { error: "source must be 'healthkit' or 'oura'" },
        { status: 400 },
      );
    }
    if (!workoutId || typeof workoutId !== "string") {
      return NextResponse.json(
        { error: "workoutId is required" },
        { status: 400 },
      );
    }

    const note = await prisma.workoutNote.findUnique({
      where: {
        userId_workoutSource_workoutId: { userId: getCurrentUserId(), workoutSource: source, workoutId },
      },
    });

    if (!note) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(note);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/workout-notes
 * body: { source, workoutId, narrative }
 *
 * Creates a note for a workout. Captures a signal snapshot at create
 * time so future analysis reasons over data as-it-was, not as-it-is.
 *
 * If a note already exists for this workout, returns 409 — the UI
 * should switch to PATCH on the existing id instead. (The unique
 * constraint enforces one-note-per-workout.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, workoutId, narrative } = body ?? {};

    if (!isValidWorkoutSource(source)) {
      return NextResponse.json(
        { error: "source must be 'healthkit' or 'oura'" },
        { status: 400 },
      );
    }
    if (!workoutId || typeof workoutId !== "string") {
      return NextResponse.json(
        { error: "workoutId is required" },
        { status: 400 },
      );
    }
    if (!narrative || typeof narrative !== "string") {
      return NextResponse.json(
        { error: "narrative is required" },
        { status: 400 },
      );
    }
    if (narrative.length > NARRATIVE_MAX_LEN) {
      return NextResponse.json(
        { error: `narrative must be ≤${NARRATIVE_MAX_LEN} chars` },
        { status: 400 },
      );
    }

    // Validate that the workout actually exists before we create a
    // note for it — better a 404 here than a dangling FK-less reference.
    const workout = await getWorkoutByIdAndSource(source, workoutId);
    if (!workout) {
      return NextResponse.json(
        { error: "Workout not found" },
        { status: 404 },
      );
    }

    // Freeze the day's signals at create time.
    const signals = await captureSignalsForDate(workout.workoutDate);

    // Label the GI outcome from the narrative now, so the meal->GI analyzer
    // sees it immediately (no manual backfill needed).
    const gi = await classifyGiFields(narrative.trim());

    const note = await prisma.workoutNote.create({
      data: {
        userId: getCurrentUserId(),
        workoutSource: source,
        workoutId,
        workoutDate: workout.workoutDate,
        narrative: narrative.trim(),
        signalSnapshot: JSON.stringify(signals),
        ...gi,
      },
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
