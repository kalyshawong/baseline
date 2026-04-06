import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const profile = await prisma.userProfile.findUnique({ where: { id: 1 } });
  return NextResponse.json(profile);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
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
}
