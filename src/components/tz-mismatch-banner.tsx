import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { getRequestTz, isValidTz, tzOffsetMs, TZ_COOKIE } from "@/lib/date-utils";
import { auth } from "@/auth";
import { DEMO_USER_ID } from "@/lib/demo/constants";
import { TZ_ACK_COOKIE } from "@/lib/tz-ack";
import { TzMismatchActions } from "@/components/tz-mismatch-actions";

/**
 * Shown when the account timezone (where typed-in meal/tag times are SAVED)
 * disagrees with this device's timezone (where they're DISPLAYED).
 *
 * Why it exists (2026-09-28): User.timezone stayed Asia/Hong_Kong after she
 * flew home to New York. Every "7:30 PM" she typed was saved as 7:30 PM HKT
 * and displayed as 7:30 AM EDT — two weeks of meals silently 12h off. The
 * account zone can't auto-follow the device (that's the exact hole it was
 * added to close), so the mismatch has to be surfaced and confirmed.
 *
 * Deliberately plain — existing tokens only; visual treatment is Kalysha's
 * to restyle.
 */
function cityOf(tz: string): string {
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ");
}

export async function TzMismatchBanner() {
  let userTz: string | null = null;
  let deviceTz: string | null = null;
  let acked: string | undefined;
  try {
    // Signed-in real users only — getCurrentUserId falls back to Kalysha for
    // session-less requests, so a logged-out visitor must never see this.
    const session = (await auth()) as { userId?: string } | null;
    if (!session?.userId || session.userId === DEMO_USER_ID) return null;
    const jar = await cookies();
    if (!jar.get(TZ_COOKIE)) return null; // device zone unknown yet
    deviceTz = await getRequestTz();
    acked = jar.get(TZ_ACK_COOKIE)?.value;
    const user = await prisma.user.findUnique({
      where: { id: await getCurrentUserId() },
      select: { timezone: true },
    });
    userTz = user?.timezone ?? null;
  } catch {
    return null; // no request scope / db unavailable
  }
  if (!userTz || !deviceTz || !isValidTz(userTz)) return null;
  // Compare offsets, not names: America/Detroit vs America/New_York is fine.
  const now = new Date();
  if (tzOffsetMs(userTz, now) === tzOffsetMs(deviceTz, now)) return null;
  // "Keep" was chosen for this exact pair — don't nag until something changes.
  if (acked && decodeURIComponent(acked) === `${userTz}|${deviceTz}`) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-center text-xs"
      style={{
        background: "var(--color-surface-2)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <span>
        Times you type are saved in {cityOf(userTz)} time, but this device is on {cityOf(deviceTz)} time.
      </span>
      <TzMismatchActions userTz={userTz} deviceTz={deviceTz} />
    </div>
  );
}
