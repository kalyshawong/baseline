import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, collectErrors, validateEnum, validateNumber } from "@/lib/utils";

// Body composition + activity ranges. These feed TDEE math, energy availability,
// and protein targets — bad values silently corrupt downstream metrics, so reject
// at the boundary. Bounds chosen to cover plausible adult range with margin.
// Enums match prisma/schema.prisma comments on UserProfile fields.
const SEX = ["male", "female"] as const;
const EXPERIENCE_LEVEL = ["beginner", "intermediate", "advanced"] as const;
const ACTIVITY_LEVEL = ["sedentary", "light", "moderate", "active", "very_active"] as const;
const GOAL = ["lose", "maintain", "gain"] as const;
const UNIT = ["lb", "kg"] as const;

export async function GET() {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { id: 1 } });
    return NextResponse.json(profile);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationError = collectErrors(
      body.bodyWeightKg !== undefined
        ? validateNumber(body.bodyWeightKg, "bodyWeightKg", { min: 20, max: 400 })
        : null,
      body.bodyFatPct !== undefined
        ? validateNumber(body.bodyFatPct, "bodyFatPct", { min: 2, max: 70 })
        : null,
      body.heightCm !== undefined
        ? validateNumber(body.heightCm, "heightCm", { min: 100, max: 250 })
        : null,
      body.age !== undefined
        ? validateNumber(body.age, "age", { min: 13, max: 120, integer: true })
        : null,
      body.targetWeightKg !== undefined
        ? validateNumber(body.targetWeightKg, "targetWeightKg", { min: 20, max: 400 })
        : null,
      body.dailyCalorieTarget !== undefined
        ? validateNumber(body.dailyCalorieTarget, "dailyCalorieTarget", { min: 800, max: 8000, integer: true })
        : null,
      body.sex !== undefined ? validateEnum(body.sex, SEX, "sex") : null,
      body.experienceLevel !== undefined
        ? validateEnum(body.experienceLevel, EXPERIENCE_LEVEL, "experienceLevel")
        : null,
      body.activityLevel !== undefined
        ? validateEnum(body.activityLevel, ACTIVITY_LEVEL, "activityLevel")
        : null,
      body.goal !== undefined ? validateEnum(body.goal, GOAL, "goal") : null,
      body.unit !== undefined ? validateEnum(body.unit, UNIT, "unit") : null,
    );
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const allowed = [
      "bodyWeightKg",
      "bodyFatPct",
      "heightCm",
      "age",
      "sex",
      "experienceLevel",
      "activityLevel",
      "goal",
      "targetWeightKg",
      "dailyCalorieTarget",
      "unit",
    ] as const;

    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key];
    }

    const profile = await prisma.userProfile.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });

    return NextResponse.json(profile);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
