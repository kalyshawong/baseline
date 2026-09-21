import { NextRequest, NextResponse } from "next/server";
import { seedDemoTenant, lastDemoSeedAt } from "@/lib/demo/seed";

/**
 * Daily demo reseed (Vercel cron — see vercel.json).
 *
 * The demo's dates are shifted so its last day is always "today"; without a
 * daily re-shift the demo would age one day per day.
 *
 * Unauthenticated by design, like /api/keepalive: it takes no input, touches
 * only the demo tenant, and returns only row counts. The abuse case is cost,
 * not data — so it refuses to run more than once per MIN_INTERVAL. A caller
 * holding CRON_SECRET (if set) may force a run with ?force=1.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const authed = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
    const force = authed && req.nextUrl.searchParams.get("force") === "1";

    const last = await lastDemoSeedAt();
    if (!force && last && Date.now() - last.getTime() < MIN_INTERVAL_MS) {
      return NextResponse.json({ ok: true, skipped: true, lastSeedAt: last.toISOString() });
    }

    const report = await seedDemoTenant();
    return NextResponse.json({ ok: true, ...report });
  } catch (err) {
    console.error("[demo reseed] failed", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
