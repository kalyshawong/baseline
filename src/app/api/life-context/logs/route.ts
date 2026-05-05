import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";
import { dateStrToUTC } from "@/lib/date-utils";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDayParam(dateStr: string | null | undefined): Date | null {
  if (!dateStr || !DATE_RE.test(dateStr)) return null;
  return dateStrToUTC(dateStr);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const day = parseDayParam(url.searchParams.get("day"));

    if (!day) {
      return NextResponse.json(
        { error: "day query param required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const logs = await prisma.lifeContextLog.findMany({
      where: { day },
      include: { def: true },
      orderBy: { createdAt: "asc" },
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
    const { defId, day: dayStr, notes } = body;

    if (!defId || typeof defId !== "string") {
      return NextResponse.json({ error: "defId is required" }, { status: 400 });
    }

    const day = parseDayParam(dayStr);
    if (!day) {
      return NextResponse.json(
        { error: "day is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // Upsert so retoggling-on for a day is idempotent
    const log = await prisma.lifeContextLog.upsert({
      where: { defId_day: { defId, day } },
      update: { notes: typeof notes === "string" ? notes : null },
      create: {
        defId,
        day,
        notes: typeof notes === "string" ? notes : null,
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { defId, day: dayStr } = body;

    if (!defId || typeof defId !== "string") {
      return NextResponse.json({ error: "defId is required" }, { status: 400 });
    }

    const day = parseDayParam(dayStr);
    if (!day) {
      return NextResponse.json(
        { error: "day is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    // deleteMany is forgiving when the row doesn't exist (no-op vs. throwing)
    const { count } = await prisma.lifeContextLog.deleteMany({
      where: { defId, day },
    });

    return NextResponse.json({ ok: true, deleted: count });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
