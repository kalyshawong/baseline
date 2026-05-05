import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, collectErrors, validateNumber, validateString } from "@/lib/utils";

const NOTES_MAX = 2_000;

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  try {
    const { setId } = await params;
    await prisma.workoutSet.delete({ where: { id: setId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; setId: string }> }
) {
  try {
    const { setId } = await params;
    const body = await request.json();

    // Match BUG-011 ranges from the sibling POST route — PATCH was bypassing them.
    const validationError = collectErrors(
      body.reps !== undefined ? validateNumber(body.reps, "reps", { min: 1, max: 100 }) : null,
      body.weight !== undefined ? validateNumber(body.weight, "weight", { min: 0, max: 1000 }) : null,
      body.rpe !== undefined && body.rpe !== null
        ? validateNumber(body.rpe, "rpe", { min: 1, max: 10 })
        : null,
      body.notes !== undefined ? validateString(body.notes, "notes", { maxLen: NOTES_MAX }) : null,
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.reps !== undefined) data.reps = body.reps;
    if (body.weight !== undefined) data.weight = body.weight;
    if (body.rpe !== undefined) data.rpe = body.rpe;
    if (body.notes !== undefined) data.notes = body.notes;

    const set = await prisma.workoutSet.update({ where: { id: setId }, data });
    return NextResponse.json(set);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
