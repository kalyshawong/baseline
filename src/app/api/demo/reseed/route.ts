import { NextRequest, NextResponse } from "next/server";
import { seedDemoTenant, lastDemoSeed } from "@/lib/demo/seed";
import { generateDemoWorkoutAnswers, hasDemoWorkoutAnswers } from "@/lib/demo/workout-answers";

/**
 * Daily demo reseed (Vercel cron — see vercel.json).
 *
 * The demo's dates are shifted so its last day is always "today"; without a
 * daily re-shift the demo would age one day per day.
 *
 * Unauthenticated by design, like /api/keepalive: it takes no input, touches
 * only the demo tenant, and returns only row counts. The abuse case is cost,
 * not data — so it refuses to run more than once per New York day (and never twice within MIN_INTERVAL). A caller
 * holding CRON_SECRET (if set) may force a run with ?force=1.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    const authed = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
    const force = authed && req.nextUrl.searchParams.get("force") === "1";

    const lastSeed = await lastDemoSeed();
    const last = lastSeed?.at ?? null;
    // Skip when this version already seeded on today's New York date — the
    // demo's "today" is New York's (seed.ts), so a seed from yesterday
    // evening must not block this morning's re-date. MIN_INTERVAL_MS still
    // caps abuse at one reseed per few hours.
    const nyDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const fresh = !!last && (nyDate(last) === nyDate(new Date()) || Date.now() - last.getTime() < MIN_INTERVAL_MS);
    if (!force && last && lastSeed?.current && fresh) {
      // Seed is fresh, but its workout answers may never have been generated
      // (first deploy of the feature, or a run that timed out). Fill them in
      // only when none exist, so repeat hits cost nothing.
      const workoutAnswers = (await hasDemoWorkoutAnswers())
        ? undefined
        : await generateDemoWorkoutAnswers().catch((e) => ({ error: String((e as Error)?.message ?? e).slice(0, 300) }));
      return NextResponse.json({ ok: true, skipped: true, lastSeedAt: last.toISOString(), workoutAnswers });
    }

    const report = await seedDemoTenant();
    // Real coach answers for the demo's recent workouts. A failure here leaves
    // the demo usable (those workouts fall back to the draft + canned reply).
    const workoutAnswers = await generateDemoWorkoutAnswers().catch((e) => ({
      error: String((e as Error)?.message ?? e).slice(0, 300),
    }));
    return NextResponse.json({ ok: true, ...report, workoutAnswers });
  } catch (err) {
    console.error("[demo reseed] failed", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
