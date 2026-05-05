import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  apiError,
  collectErrors,
  validateDateString,
  validateNumber,
  validateString,
} from "@/lib/utils";

const NOTES_MAX = 4_000;
// 24 hours of training is already an outlier; cap at 1440 minutes for safety.
const DURATION_MIN_MAX = 1_440;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await prisma.workoutSession.findUnique({
      where: { id },
      include: {
        sets: {
          orderBy: { createdAt: "asc" },
          include: { exercise: true },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validationError = collectErrors(
      body.sessionRPE !== undefined && body.sessionRPE !== null
        ? validateNumber(body.sessionRPE, "sessionRPE", { min: 1, max: 10 })
        : null,
      body.notes !== undefined ? validateString(body.notes, "notes", { maxLen: NOTES_MAX }) : null,
      body.completedAt !== undefined && body.completedAt !== null
        ? validateDateString(body.completedAt, "completedAt")
        : null,
      body.durationMin !== undefined && body.durationMin !== null
        ? validateNumber(body.durationMin, "durationMin", { min: 0, max: DURATION_MIN_MAX })
        : null,
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.sessionRPE !== undefined) data.sessionRPE = body.sessionRPE;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.completedAt !== undefined) {
      data.completedAt = body.completedAt === null ? null : new Date(body.completedAt);
    }
    if (body.durationMin !== undefined) data.durationMin = body.durationMin;

    // If completing the session, compute total volume
    if (body.completedAt) {
      const sets = await prisma.workoutSet.findMany({
        where: { sessionId: id, isWarmup: false },
      });
      const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      data.sessionVolume = totalVolume;
    }

    const session = await prisma.workoutSession.update({
      where: { id },
      data,
    });

    return NextResponse.json(session);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.workoutSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
