import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { safeJsonParse, apiError } from "@/lib/utils";

export async function GET() {
  try {
    const templates = await prisma.workoutTemplate.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(
      templates.map((t) => ({
        ...t,
        exercises: safeJsonParse(t.exercises, []),
      }))
    );
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, split, exercises } = body;

    if (!name || !Array.isArray(exercises) || exercises.length === 0) {
      return NextResponse.json(
        { error: "name and at least one exercise required" },
        { status: 400 }
      );
    }

    // Validate exercise shape
    for (const ex of exercises) {
      if (!ex.exerciseName || !ex.targetSets || !ex.targetReps) {
        return NextResponse.json(
          { error: "each exercise needs exerciseName, targetSets, targetReps" },
          { status: 400 }
        );
      }
    }

    const template = await prisma.workoutTemplate.create({
      data: {
        name,
        split: split ?? "custom",
        exercises: JSON.stringify(exercises),
      },
    });

    return NextResponse.json(
      { ...template, exercises: safeJsonParse(template.exercises, []) },
      { status: 201 }
    );
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
