import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidTz } from "@/lib/date-utils";
import { apiError } from "@/lib/utils";

/**
 * Sets User.timezone — the zone typed-in wall times ("time eaten", tag
 * times) are interpreted in. Only ever called from TzMismatchBanner after the
 * user confirms, never automatically: a device with a wrong OS clock
 * ("Florentine dinner", 2026-08-26) must not be able to rewrite it silently.
 */
export async function POST(request: NextRequest) {
  try {
    const { timezone } = await request.json();
    if (typeof timezone !== "string" || timezone.length > 64 || !isValidTz(timezone)) {
      return NextResponse.json({ error: "timezone must be a valid IANA zone" }, { status: 400 });
    }
    await prisma.user.update({ where: { id: await getCurrentUserId() }, data: { timezone } });
    return NextResponse.json({ timezone });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
