import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncAllGarminLinks } from "@/lib/garmin/sync";

/**
 * Supabase keep-alive.
 *
 * The free tier auto-pauses projects after ~7 idle days — which took prod
 * down on Aug 15 2026 (503s until a manual dashboard restore). A daily
 * Vercel cron (vercel.json) hits this endpoint; one trivial query counts
 * as activity and resets the idle clock.
 *
 * Unauthenticated by design: it leaks nothing (fixed response shape), and
 * the middleware exempts it so the cron can reach it without credentials.
 */
export const maxDuration = 60; // the Garmin piggyback needs more than the 10s default

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Piggyback: the Hobby plan allows two crons and both are taken, so the
    // daily Garmin pull rides along here (pilot-only, a handful of links).
    const garmin = await syncAllGarminLinks(7).catch((e) => ({ synced: 0, error: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json({ ok: true, at: new Date().toISOString(), garmin });
  } catch {
    // Surface failure via non-200 so Vercel cron logs show it red.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
