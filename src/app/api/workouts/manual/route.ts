import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { apiError } from "@/lib/utils";

/**
 * POST /api/workouts/manual
 *
 * Creates a HealthKitWorkout row sourced as "manual" so the user can
 * log a workout that Apple Watch / Oura / HealthAutoExport hasn't
 * synced yet (or won't sync — Oura's cloud API has a multi-hour lag
 * for Strava-imported workouts, and HealthAutoExport runs EOD).
 *
 * The created row slots into the existing HealthKitWorkout table so
 * the dashboard's `todayHkWorkout` query, ActivityCard rendering, and
 * WorkoutNote attachment all work unchanged. The `source: "manual"`
 * label preserves origin for downstream dedup logic — if a later
 * Oura/HK sync brings in the same workout, that flow can detect the
 * manual one by time overlap and avoid double-counting.
 */

const NAME_MAX_LEN = 80;
const DURATION_MIN = 1;
const DURATION_MAX = 300; // 5 hours; long enough for a Hyrox + transitions

interface ManualWorkoutBody {
  name?: unknown;
  durationMinutes?: unknown;
  /** ISO 8601 timestamp. Defaults to `new Date()` when missing. */
  startTime?: unknown;
  avgHeartRate?: unknown;
  maxHeartRate?: unknown;
  activeCalories?: unknown;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isOptionalHr(v: unknown): v is number | undefined | null {
  if (v == null) return true;
  return isFiniteNumber(v) && v >= 30 && v <= 230;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ManualWorkoutBody;

    // --- Name ---
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 },
      );
    }
    const name = body.name.trim().slice(0, NAME_MAX_LEN);

    // --- Duration ---
    if (
      !isFiniteNumber(body.durationMinutes) ||
      body.durationMinutes < DURATION_MIN ||
      body.durationMinutes > DURATION_MAX
    ) {
      return NextResponse.json(
        {
          error: `durationMinutes must be a number between ${DURATION_MIN} and ${DURATION_MAX}`,
        },
        { status: 400 },
      );
    }
    const durationSeconds = Math.round(body.durationMinutes * 60);

    // --- Start time ---
    let startedAt: Date;
    if (body.startTime == null) {
      startedAt = new Date();
    } else if (typeof body.startTime === "string") {
      const parsed = new Date(body.startTime);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "startTime must be a valid ISO 8601 timestamp" },
          { status: 400 },
        );
      }
      startedAt = parsed;
    } else {
      return NextResponse.json(
        { error: "startTime must be an ISO 8601 string or omitted" },
        { status: 400 },
      );
    }
    const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);

    // --- Optional HR fields ---
    if (!isOptionalHr(body.avgHeartRate)) {
      return NextResponse.json(
        { error: "avgHeartRate must be between 30 and 230 if provided" },
        { status: 400 },
      );
    }
    if (!isOptionalHr(body.maxHeartRate)) {
      return NextResponse.json(
        { error: "maxHeartRate must be between 30 and 230 if provided" },
        { status: 400 },
      );
    }
    if (
      body.activeCalories != null &&
      (!isFiniteNumber(body.activeCalories) ||
        body.activeCalories < 0 ||
        body.activeCalories > 5000)
    ) {
      return NextResponse.json(
        { error: "activeCalories must be a number between 0 and 5000 if provided" },
        { status: 400 },
      );
    }

    const created = await prisma.healthKitWorkout.create({
      data: {
        userId: getCurrentUserId(),
        // externalId is @unique. Use a uuid prefix to avoid collisions
        // with HAE-pushed externalIds (which are HK UUIDs from iOS).
        externalId: `manual-${randomUUID()}`,
        name,
        source: "manual",
        startedAt,
        endedAt,
        durationSeconds,
        avgHeartRate: typeof body.avgHeartRate === "number" ? Math.round(body.avgHeartRate) : null,
        maxHeartRate: typeof body.maxHeartRate === "number" ? Math.round(body.maxHeartRate) : null,
        activeCalories: typeof body.activeCalories === "number" ? body.activeCalories : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
