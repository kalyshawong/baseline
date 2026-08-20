import { NextResponse } from "next/server";

/**
 * Which build is the server running? Polled by VersionWatch on app
 * foreground — a mismatch with the client's baked-in sha triggers a reload,
 * so the long-lived WebView stops showing day-old pages after deploys
 * ("you have no hide button" while prod verifiably had it, 2026-08-20).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "cache-control": "no-store" } },
  );
}
