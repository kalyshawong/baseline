import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { apiError } from "@/lib/utils";

/**
 * POST /api/hyrox/sessions
 *
 * Logs a HyroxSession row for today's prescribed session. Created when
 * the user taps "Start this session" on /body/hyrox.
 *
 * Body: {
 *   sessionType: string,       // from recommendation.sessionType
 *   prescriptionNotes?: string,
 *   rationale?: string,
 * }
 *
 * The row anchors to the user's active HyroxPlan and uses today's local
 * date. Actual performance metrics (sets/reps/weights/times) are not
 * captured here — those live on WorkoutSession and can be added via a
 * follow-up "log details" flow. The minimal POST is enough to:
 *   - mark "session done" in today's view
 *   - update daysSinceLastHardSession for tomorrow's recommendation
 *   - make the session visible to coach via get_hyrox_sessions tool
 *
 * Returns 404 when no active plan exists, 409 if a session for today
 * already exists (caller can switch to PATCH if we add edit later).
 */

const VALID_SESSION_TYPES = new Set([
  "easy_run",
  "tempo",
  "intervals",
  "long_run",
  "strength",
  "compromised",
  "station_work",
  "recovery",
  "race_simulation",
]);

const PRESCRIPTION_MAX = 1_000;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionType, prescriptionNotes, rationale } = body ?? {};

    if (typeof sessionType !== "string" || !VALID_SESSION_TYPES.has(sessionType)) {
      return NextResponse.json(
        {
          error: `sessionType must be one of: ${Array.from(VALID_SESSION_TYPES).join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (
      prescriptionNotes != null &&
      (typeof prescriptionNotes !== "string" || prescriptionNotes.length > PRESCRIPTION_MAX)
    ) {
      return NextResponse.json(
        { error: `prescriptionNotes must be a string ≤${PRESCRIPTION_MAX} chars` },
        { status: 400 },
      );
    }
    if (
      rationale != null &&
      (typeof rationale !== "string" || rationale.length > PRESCRIPTION_MAX)
    ) {
      return NextResponse.json(
        { error: `rationale must be a string ≤${PRESCRIPTION_MAX} chars` },
        { status: 400 },
      );
    }

    const plan = await prisma.hyroxPlan.findFirst({
      where: { status: "active" },
      orderBy: { updatedAt: "desc" },
    });
    if (!plan) {
      return NextResponse.json(
        { error: "No active Hyrox plan." },
        { status: 404 },
      );
    }

    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const dayEnd = endOfLocalDay(now);

    // Prevent silent duplicates — if a session was already logged today
    // for this plan, return the existing row instead of stacking.
    const existing = await prisma.hyroxSession.findFirst({
      where: {
        planId: plan.id,
        day: { gte: dayStart, lt: dayEnd },
      },
    });
    if (existing) {
      return NextResponse.json({ session: existing, alreadyLogged: true });
    }

    const session = await prisma.hyroxSession.create({
      data: {
        userId: getCurrentUserId(),
        planId: plan.id,
        day: dayStart,
        sessionType,
        prescriptionNotes: prescriptionNotes ?? null,
        rationale: rationale ?? null,
      },
    });

    return NextResponse.json({ session, alreadyLogged: false }, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
