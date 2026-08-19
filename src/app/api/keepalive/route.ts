import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch {
    // Surface failure via non-200 so Vercel cron logs show it red.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
