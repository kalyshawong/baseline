import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { syncAllGarminLinks, syncGarminLink } from "@/lib/garmin/sync";

export const maxDuration = 300; // ~7 endpoints × days, sequential per day

/**
 * POST /api/garmin/sync — signed-in user re-syncs their own Garmin link
 * (the "Sync Garmin" button). 14 days.
 *
 * GET /api/garmin/sync — every link, 7 days. Called by the daily keep-alive
 * cron (vercel.json has room for only two crons on Hobby) and guarded by
 * CRON_SECRET when set.
 */
export async function POST() {
  const session = (await auth()) as { userId?: string } | null;
  if (!session?.userId || session.userId === DEMO_USER_ID) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const link = await prisma.garminLink.findUnique({ where: { userId: session.userId }, select: { id: true } });
  if (!link) return NextResponse.json({ error: "No Garmin link on this account" }, { status: 404 });
  try {
    const r = await syncGarminLink(link.id, 14);
    return NextResponse.json({ ok: true, days: r.days, errors: r.errors });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await syncAllGarminLinks(7);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 500 });
  }
}
