import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const muscleGroup = url.searchParams.get("muscleGroup");
    const search = url.searchParams.get("q");

    const where: Record<string, unknown> = {};
    if (muscleGroup) where.muscleGroup = muscleGroup;
    if (search) where.name = { contains: search };

    const exercises = await prisma.exercise.findMany({
      where,
      orderBy: [{ isCompound: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(exercises);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, muscleGroup, movementPattern, equipment, isCompound, defaultSets, defaultReps } = body;

    if (!name || !muscleGroup || !movementPattern || !equipment) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const exercise = await prisma.exercise.create({
      data: {
        name,
        muscleGroup,
        movementPattern,
        equipment,
        isCompound: isCompound ?? false,
        defaultSets: defaultSets ?? 3,
        defaultReps: defaultReps ?? 10,
      },
    });

    return NextResponse.json(exercise, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
