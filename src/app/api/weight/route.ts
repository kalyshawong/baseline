import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") ?? "30");

  const since = new Date();
  since.setDate(since.getDate() - days);

  const logs = await prisma.weightLog.findMany({
    where: { day: { gte: since } },
    orderBy: { day: "asc" },
  });

  return NextResponse.json(logs);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { weightKg, bodyFatPct, muscleMassKg, notes, date } = body;

  if (typeof weightKg !== "number" || weightKg <= 0) {
    return NextResponse.json({ error: "weightKg is required" }, { status: 400 });
  }

  // Upsert by day (local date)
  let day: Date;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    day = new Date(date + "T00:00:00.000Z");
  } else {
    const now = new Date();
    const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    day = new Date(localDateStr + "T00:00:00.000Z");
  }

  const log = await prisma.weightLog.upsert({
    where: { day },
    update: { weightKg, bodyFatPct, muscleMassKg, notes },
    create: { day, weightKg, bodyFatPct, muscleMassKg, notes },
  });

  // Also update UserProfile.bodyWeightKg to the latest for protein/TDEE calcs
  await prisma.userProfile.upsert({
    where: { id: 1 },
    update: { bodyWeightKg: weightKg, ...(bodyFatPct != null && { bodyFatPct }) },
    create: {
      id: 1,
      bodyWeightKg: weightKg,
      ...(bodyFatPct != null && { bodyFatPct }),
    },
  });

  return NextResponse.json(log, { status: 201 });
}
