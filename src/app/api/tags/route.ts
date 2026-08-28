import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { apiError } from "@/lib/utils";
import { getLocalDayStr, getUserTz, wallTimeToUtc } from "@/lib/date-utils";

/**
 * Resolve a tag's timestamp. Preferred path (clients ≥2026-08-26): the
 * literal HH:MM wall time the user entered plus the page's calendar day,
 * interpreted SERVER-side in the user's canonical timezone (User.timezone →
 * bl_tz → fallback) — same hardening as /api/nutrition, so a device with a
 * wrong OS clock can't skew tag times. Legacy fallback: the client-built
 * ISO instant, trusted as-is; else "now".
 */
async function resolveTagTimestamp(input: {
  time?: unknown;
  date?: unknown;
  timestamp?: unknown;
}): Promise<Date> {
  const { time, date, timestamp } = input;
  if (typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    const tz = await getUserTz();
    const dayStr =
      typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : getLocalDayStr(tz);
    return wallTimeToUtc(dayStr, time, tz);
  }
  if (typeof timestamp === "string" || typeof timestamp === "number") {
    const d = new Date(timestamp);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const startDate = url.searchParams.get("start_date");
    const endDate = url.searchParams.get("end_date");
    // BUG-C1 fix: clamp limit to [1, 1000] and reject NaN (which Prisma silently
    // treats as "no limit", leaking the full table).
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 1000)
      : 50;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (startDate || endDate) {
      where.timestamp = {
        ...(startDate && { gte: new Date(startDate) }),
        ...(endDate && { lte: new Date(endDate) }),
      };
    }

    const tags = await prisma.activityTag.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { experiment: { select: { id: true, title: true } } },
    });

    return NextResponse.json(tags);
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tag, category, metadata, experimentId, timestamp, time, date } = body;

    if (!tag || !category) {
      return NextResponse.json({ error: "tag and category are required" }, { status: 400 });
    }

    const validCategories = [
      "music", "breathing", "caffeine", "alcohol",
      "meditation", "exercise", "social", "study", "nutrition", "custom",
    ];
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }

    const created = await prisma.activityTag.create({
      data: {
        userId: await getCurrentUserId(),
        // Normalized at write: "Sex" and "sex" were living as two tags,
        // splitting counts across every analyzer (2026-08-26). One tag,
        // one identity, case-insensitive.
        tag: String(tag).trim().toLowerCase(),
        category,
        metadata: metadata ? JSON.stringify(metadata) : null,
        experimentId: experimentId ?? null,
        timestamp: await resolveTagTimestamp({ time, date, timestamp }),
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await prisma.activityTag.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
