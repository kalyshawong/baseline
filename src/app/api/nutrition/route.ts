import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { estimateMacros } from "@/lib/usda";

export async function POST(request: NextRequest) {
  const { text, mealType, eatenAt, date } = await request.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const validMealTypes = ["breakfast", "lunch", "dinner", "snack"];
  const meal = validMealTypes.includes(mealType) ? mealType : "snack";
  const eatenTime = eatenAt ? new Date(eatenAt) : new Date();

  // Estimate macros from plain text via Claude
  const estimates = await estimateMacros(text);

  // Use provided date or derive from eatenAt time
  let logDay: Date;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    logDay = new Date(date + "T00:00:00.000Z");
  } else {
    const now = new Date();
    logDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  // Upsert day's NutritionLog
  let log = await prisma.nutritionLog.findUnique({ where: { day: logDay } });

  if (!log) {
    log = await prisma.nutritionLog.create({
      data: { day: logDay, calories: 0, protein: 0, carbs: 0, fat: 0 },
    });
  }

  // Create entries and accumulate totals
  let addedCals = 0;
  let addedProt = 0;
  let addedCarbs = 0;
  let addedFat = 0;

  for (const est of estimates) {
    await prisma.nutritionEntry.create({
      data: {
        nutritionLogId: log.id,
        description: est.description,
        foodName: est.foodName,
        quantity: est.quantity,
        unit: est.unit,
        calories: est.calories,
        protein: est.protein,
        carbs: est.carbs,
        fat: est.fat,
        mealType: meal,
        eatenAt: eatenTime,
      },
    });
    addedCals += est.calories;
    addedProt += est.protein;
    addedCarbs += est.carbs;
    addedFat += est.fat;
  }

  // Update daily totals
  const updated = await prisma.nutritionLog.update({
    where: { id: log.id },
    data: {
      calories: { increment: addedCals },
      protein: { increment: addedProt },
      carbs: { increment: addedCarbs },
      fat: { increment: addedFat },
    },
    include: { entries: { orderBy: { eatenAt: "asc" } } },
  });

  // Auto-tag for experiment integration
  const eatenHour = eatenTime.getHours();
  const timeLabel = `${eatenHour > 12 ? eatenHour - 12 : eatenHour}:${String(eatenTime.getMinutes()).padStart(2, "0")}${eatenHour >= 12 ? "pm" : "am"}`;
  await prisma.activityTag.create({
    data: {
      tag: meal,
      category: "nutrition",
      timestamp: eatenTime,
      metadata: JSON.stringify({
        mealType: meal,
        eatenAt: eatenTime.toISOString(),
        time: timeLabel,
        calories: addedCals,
        protein: addedProt,
        carbs: addedCarbs,
        fat: addedFat,
        items: estimates.map((e) => e.description),
      }),
    },
  });

  return NextResponse.json({
    estimates,
    dailyTotals: {
      calories: updated.calories,
      protein: updated.protein,
      carbs: updated.carbs,
      fat: updated.fat,
    },
    log: updated,
  });
}

export async function DELETE(request: NextRequest) {
  const { entryId } = await request.json();

  if (!entryId) {
    return NextResponse.json({ error: "entryId is required" }, { status: 400 });
  }

  const entry = await prisma.nutritionEntry.findUnique({
    where: { id: entryId },
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // Delete the entry
  await prisma.nutritionEntry.delete({ where: { id: entryId } });

  // Subtract from daily totals
  await prisma.nutritionLog.update({
    where: { id: entry.nutritionLogId },
    data: {
      calories: { decrement: entry.calories },
      protein: { decrement: entry.protein },
      carbs: { decrement: entry.carbs },
      fat: { decrement: entry.fat },
    },
  });

  return NextResponse.json({ success: true });
}

export async function GET() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const log = await prisma.nutritionLog.findUnique({
    where: { day: today },
    include: { entries: { orderBy: { createdAt: "desc" } } },
  });

  return NextResponse.json(log);
}
