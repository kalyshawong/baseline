import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { mintSyncToken } from "@/lib/sync-token";

/**
 * GET /api/native/sync-token — the HealthKit sync token for the signed-in user.
 *
 * Session only: this is what ties a phone's Health data to an account, so it
 * must never fall back to a default tenant. No session → 401 and the native
 * bootstrap simply doesn't start syncing. The demo tenant never syncs.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId || userId === DEMO_USER_ID) {
    return NextResponse.json({ error: "Sign in to sync Health data" }, { status: 401 });
  }
  return NextResponse.json(
    { token: mintSyncToken(userId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
