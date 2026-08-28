import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { getLocalDay, getLocalDayStr, getRequestTz, getUserTz, wallTimeToUtc } from "@/lib/date-utils";
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
const VALID_MEAL_SOURCES = ["home_cooked", "takeout", "restaurant", "pre_packaged"] as const;

export async function POST(request: NextRequest) {
  try {
    const { text, mealType, eatenAt, date, time, timeUnknown, source } = await request.json();

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

    if (source != null && !VALID_MEAL_SOURCES.includes(source)) {
      return NextResponse.json(
        { error: `source must be one of: ${VALID_MEAL_SOURCES.join(", ")}` },
        { status: 400 }
      );
    }

    const timeUnknownFlag = timeUnknown === true;
    // User.timezone (canonical) → bl_tz cookie → server fallback. The
    // user-level setting is what finally beats a submitting device whose OS
    // clock (and therefore cookie) is wrong.
    const tz = await getUserTz();
    // The calendar day this log belongs to — the page's date param, else
    // today as seen in the user's timezone.
    const dayStr =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : getLocalDayStr(tz);

    let eatenTime: Date;
    if (typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      // Preferred path (clients ≥2026-08-26): the client sends the literal
      // HH:MM wall time it showed the user, and the SERVER interprets it in
      // the viewer's timezone. A submitting device with a wrong OS timezone
      // can no longer corrupt eaten-times ("Florentine dinner" incident:
      // a UTC+2 device turned a typed 7:30 PM into 1:30 AM HKT).
      eatenTime = wallTimeToUtc(dayStr, timeUnknownFlag ? "00:00" : time, tz);
    } else if (eatenAt == null) {
      eatenTime = new Date();
    } else {
      // Legacy fallback (older clients / stale PWA bundles): a client-built
      // ISO instant, trusted as-is.
      eatenTime = new Date(eatenAt);
      if (Number.isNaN(eatenTime.getTime())) {
        return NextResponse.json(
          { error: "eatenAt must be a valid ISO date string" },
          { status: 400 }
        );
      }
    }

    // Estimate macros from plain text via Claude
    const estimates = await estimateMacros(text);

    // The log day is dayStr (page date param, else viewer-tz today) as a UTC
    // midnight anchor for the userId_day unique key.
    const logDay = new Date(dayStr + "T00:00:00.000Z");

    // Upsert day's NutritionLog
    let log = await prisma.nutritionLog.findUnique({ where: { userId_day: { userId: await getCurrentUserId(), day: logDay } } });

    if (!log) {
      log = await prisma.nutritionLog.create({
        data: { userId: await getCurrentUserId(), day: logDay, calories: 0, protein: 0, carbs: 0, fat: 0 },
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
          userId: await getCurrentUserId(),
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
          source: source ?? undefined,
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

    // Auto-tag for experiment integration. Label rendered in the VIEWER's
    // timezone — the old server-local getHours() produced flipped labels
    // ("11:00pm" for an 11:00 AM HKT meal) because the server clock isn't
    // hers. Intl also fixes the 12-hour edge cases (midnight/noon).
    const timeLabel = timeUnknownFlag
      ? "sometime today"
      : eatenTime
          .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })
          .toLowerCase()
          .replace(" ", "");
    await prisma.activityTag.create({
      data: {
        userId: await getCurrentUserId(),
        tag: meal,
        category: "nutrition",
        timestamp: eatenTime,
        metadata: JSON.stringify({
          mealType: meal,
          source: source ?? null,
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

// PATCH { date?: "YYYY-MM-DD", mealsComplete: boolean } — day-level
// confirmation that the logged meals are everything eaten that day.
// Unconfirmed days stay "unknown": the engine must never read an absent
// meal as a skipped meal (many people eat 1–2 meals a day). Confirmed
// days let gaps count as real fasting windows.
export async function PATCH(request: NextRequest) {
  try {
    const { date, mealsComplete } = await request.json();

    if (typeof mealsComplete !== "boolean") {
      return NextResponse.json(
        { error: "mealsComplete must be a boolean" },
        { status: 400 }
      );
    }

    const tz = await getUserTz();
    const dayStr =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : getLocalDayStr(tz);
    const logDay = new Date(dayStr + "T00:00:00.000Z");
    const userId = await getCurrentUserId();

    const log = await prisma.nutritionLog.upsert({
      where: { userId_day: { userId, day: logDay } },
      create: { userId, day: logDay, calories: 0, protein: 0, carbs: 0, fat: 0, mealsComplete },
      update: { mealsComplete },
    });

    revalidateNutritionPages();
    return NextResponse.json({ date: dayStr, mealsComplete: log.mealsComplete });
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

    // Clean up the companion "nutrition" ActivityTag that POST auto-creates
    // for experiment integration. Before this (2026-08-20), deleting a food
    // entry left its shadow tag in the tag timeline — "i delete things,
    // still shows up on the recent tags and the log". One POST can cover
    // several items, so: remove this entry's description from the tag's
    // metadata items and decrement its macros; delete the tag outright when
    // it was the last item.
    try {
      const candidates = await prisma.activityTag.findMany({
        where: {
          userId: await getCurrentUserId(),
          category: "nutrition",
          tag: entry.mealType,
          timestamp: entry.eatenAt,
        },
      });
      for (const tag of candidates) {
        let meta: {
          items?: string[];
          calories?: number;
          protein?: number;
          carbs?: number;
          fat?: number;
        } | null = null;
        try {
          meta = tag.metadata ? JSON.parse(tag.metadata) : null;
        } catch {
          continue; // unparseable legacy metadata — leave it alone
        }
        if (!meta?.items || !meta.items.includes(entry.description)) continue;

        const remaining = [...meta.items];
        remaining.splice(remaining.indexOf(entry.description), 1); // remove ONE occurrence

        if (remaining.length === 0) {
          await prisma.activityTag.delete({ where: { id: tag.id } });
        } else {
          await prisma.activityTag.update({
            where: { id: tag.id },
            data: {
              metadata: JSON.stringify({
                ...meta,
                items: remaining,
                calories: Math.max(0, (meta.calories ?? 0) - entry.calories),
                protein: Math.max(0, (meta.protein ?? 0) - entry.protein),
                carbs: Math.max(0, (meta.carbs ?? 0) - entry.carbs),
                fat: Math.max(0, (meta.fat ?? 0) - entry.fat),
              }),
            },
          });
        }
        break; // one entry cleans up at most one tag
      }
    } catch (e) {
      // Tag cleanup must never block the actual deletion.
      console.error("[nutrition] companion tag cleanup failed:", e);
    }

    revalidateNutritionPages();

    return NextResponse.json({ success: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  try {
    const today = getLocalDay(await getRequestTz());

    const log = await prisma.nutritionLog.findUnique({
      where: { userId_day: { userId: await getCurrentUserId(), day: today } },
      include: { entries: { orderBy: { createdAt: "desc" } } },
    });

    return NextResponse.json(log);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
