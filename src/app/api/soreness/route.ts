import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { dateStrToUTC } from "@/lib/date-utils";
import { getSorenessForDay } from "@/lib/soreness";
import { apiError } from "@/lib/utils";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date") ?? "";
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
    }
    return NextResponse.json({ entries: await getSorenessForDay(date) });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { date, bodyPart, severity, note, clear } = await request.json();
    if (!DATE_RE.test(date ?? "")) {
      return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
    }
    if (typeof bodyPart !== "string" || !bodyPart.trim()) {
      return NextResponse.json({ error: "bodyPart required" }, { status: 400 });
    }
    const userId = await getCurrentUserId();
    const day = dateStrToUTC(date);
    const part = bodyPart.trim().toLowerCase();

    if (clear === true) {
      // End the episode: this day is the first NOT-sore day.
      await prisma.sorenessLog.upsert({
        where: { userId_day_bodyPart: { userId, day, bodyPart: part } },
        create: { userId, day, bodyPart: part, severity: 0, cleared: true },
        update: { severity: 0, cleared: true, note: null },
      });
      return NextResponse.json({ entries: await getSorenessForDay(date) });
    }

    const sev = Number(severity);
    if (!Number.isInteger(sev) || sev < 1 || sev > 10) {
      return NextResponse.json({ error: "severity must be an integer 1-10" }, { status: 400 });
    }
    // Opens an episode (or updates today's severity mid-episode). cleared
    // explicitly reset in update in case this day previously held a clear.
    await prisma.sorenessLog.upsert({
      where: { userId_day_bodyPart: { userId, day, bodyPart: part } },
      create: { userId, day, bodyPart: part, severity: sev, note: note || null },
      update: { severity: sev, note: note || null, cleared: false },
    });
    return NextResponse.json({ entries: await getSorenessForDay(date) });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    const date = request.nextUrl.searchParams.get("date") ?? "";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    // Scope the delete to the current user so an id can't cross tenants.
    await prisma.sorenessLog.deleteMany({ where: { id, userId: await getCurrentUserId() } });
    return NextResponse.json(
      DATE_RE.test(date) ? { entries: await getSorenessForDay(date) } : { ok: true },
    );
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
