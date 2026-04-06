import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getLocalDay } from "@/lib/date-utils";
import { apiError } from "@/lib/utils";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") ?? "30");

    const since = new Date();
    since.setDate(since.getDate() - days);

    const logs = await prisma.weightLog.findMany({
      where: { day: { gte: since } },
      orderBy: { day: "asc" },
    });

    return NextResponse.json(logs);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { weightKg, bodyFatPct, muscleMassKg, notes, date } = body;

    // BUG-012: Input validation
    const errors: string[] = [];
    if (typeof weightKg !== "number" || weightKg < 20 || weightKg > 500) {
      errors.push("weightKg must be 20-500");
    }
    if (bodyFatPct != null && (typeof bodyFatPct !== "number" || bodyFatPct < 1 || bodyFatPct > 80)) {
      errors.push("bodyFatPct must be 1-80");
    }
    if (muscleMassKg != null && (typeof muscleMassKg !== "number" || muscleMassKg < 10 || muscleMassKg > 200)) {
      errors.push("muscleMassKg must be 10-200");
    }
    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    // Upsert by day (local date)
    let day: Date;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      day = new Date(date + "T00:00:00.000Z");
    } else {
      day = getLocalDay();
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
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
