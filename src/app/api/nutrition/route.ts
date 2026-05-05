import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getLocalDay } from "@/lib/date-utils";
import { estimateMacros } from "@/lib/usda";
import { apiError } from "@/lib/utils";

// Pages whose server components read NutritionLog. They must be revalidated
// after every write so router.refresh() on the client returns fresh data —
// without this, the MacroSummary / NutritionLog cards on /mind and the macro
// + TDEE cards on / only update after a hard browser refresh.
const NUTRITION_PAGES = ["/mind", "/"];

function revalidateNutritionPages() {
  for (const path of NUTRITION_PAGES) {
    revalidatePath(path);
  }
}

// Bound the Anthropic-bound free-text field. estimateMacros() sends `text` to
// Claude verbatim, so unbounded length = unbounded token cost. 4 KB is plenty
// for "two slices of sourdough toast with avocado and an egg".
const NUTRITION_TEXT_MAX_LEN = 4_000;
const VALID_MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;

export async function POST(request: NextRequest) {
  try {
    const { text, mealType, eatenAt, date, timeUnknown } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }
    if (text.length > NUTRITION_TEXT_MAX_LEN) {
      return NextResponse.json(
        { error: `text must be ≤${NUTRITION_TEXT_MAX_LEN} chars` },
        { status: 400 }
      );
    }

    // Reject unknown mealType rather than silently coercing to "snack" — silent
    // coercion masks frontend bugs and corrupts experiment correlations later.
    if (mealType != null && !VALID_MEAL_TYPES.includes(mealType)) {
      return NextResponse.json(
        { error: `mealType must be one of: ${VALID_MEAL_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    const meal = mealType ?? "snack";

    let eatenTime: Date;
    if (eatenAt == null) {
      eatenTime = new Date();
    } else {
      eatenTime = new Date(eatenAt);
      if (Number.isNaN(eatenTime.getTime())) {
        return NextResponse.json(
          { error: "eatenAt must be a valid ISO date string" },
          { status: 400 }
        );
      }
    }
    const timeUnknownFlag = timeUnknown === true;

    // Estimate macros from plain text via Claude
    const estimates = await estimateMacros(text);

    // Use provided date or derive from eatenAt time
    let logDay: Date;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      logDay = new Date(date + "T00:00:00.000Z");
    } else {
      logDay = getLocalDay();
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
          timeUnknown: timeUnknownFlag,
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
    const timeLabel = timeUnknownFlag
      ? "sometime today"
      : `${eatenHour > 12 ? eatenHour - 12 : eatenHour}:${String(eatenTime.getMinutes()).padStart(2, "0")}${eatenHour >= 12 ? "pm" : "am"}`;
    await prisma.activityTag.create({
      data: {
        tag: meal,
        category: "nutrition",
        timestamp: eatenTime,
        metadata: JSON.stringify({
          mealType: meal,
          eatenAt: eatenTime.toISOString(),
          time: timeLabel,
          timeUnknown: timeUnknownFlag,
          calories: addedCals,
          protein: addedProt,
          carbs: addedCarbs,
          fat: addedFat,
          items: estimates.map((e) => e.description),
        }),
      },
    });

    revalidateNutritionPages();

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
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
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

    revalidateNutritionPages();

    return NextResponse.json({ success: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  try {
    const today = getLocalDay();

    const log = await prisma.nutritionLog.findUnique({
      where: { day: today },
      include: { entries: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json(log);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
