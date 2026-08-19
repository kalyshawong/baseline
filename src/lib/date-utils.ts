import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Centralized date utilities for consistent local-date handling.
 * BUG-008 fix: all daily data lookups use getLocalDay() instead of
 * ad-hoc Date constructions that may resolve to the wrong UTC day.
 *
 * Timezone (2026-08-19): the server clock (process.env.TZ, Eastern) is no
 * longer the source of truth for "today" — the VIEWER's timezone is. The
 * client drops its IANA zone (from the OS clock via Intl, so it follows her
 * location automatically — VPN-immune) into a `bl_tz` cookie; request-scoped
 * code resolves it via getRequestTz() and passes it into these helpers. The
 * tz parameter is optional everywhere: omitted = server clock, preserving
 * old behavior for non-request contexts (scripts, cron).
 */

export const TZ_COOKIE = "bl_tz";

/** Fallback when no cookie is present (first paint, curl, cron). */
function fallbackTz(): string {
  return process.env.APP_TZ || "America/New_York";
}

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The viewer's timezone for this request — bl_tz cookie if valid, else the
 * server default. React-cached so repeated calls in one render are free.
 * Only callable in request scope (server components / route handlers).
 */
export const getRequestTz = cache(async (): Promise<string> => {
  try {
    const raw = (await cookies()).get(TZ_COOKIE)?.value;
    if (raw && raw.length <= 64) {
      // Client writes it URL-encoded ("Asia%2FHong_Kong") — decode first.
      const tz = decodeURIComponent(raw);
      if (isValidTz(tz)) return tz;
    }
  } catch {
    /* outside request scope — fall through */
  }
  return fallbackTz();
});

/** YYYY-MM-DD of the given instant as seen in tz. */
function dayStrInTz(d: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD directly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Milliseconds that tz is ahead of UTC at the given instant. */
function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - at.getTime();
}

/** Returns today's local date as a YYYY-MM-DD string (viewer tz if given). */
export function getLocalDayStr(tz?: string): string {
  const now = new Date();
  if (tz) return dayStrInTz(now, tz);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Returns a local date string as a UTC midnight Date object for Prisma queries */
export function dateStrToUTC(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

/** Returns today's local date as a UTC midnight Date for Prisma queries */
export function getLocalDay(tz?: string): Date {
  return dateStrToUTC(getLocalDayStr(tz));
}

/** Extracts date from Next.js searchParams, falling back to local today */
export function getDateFromParams(
  searchParams: Record<string, string | string[] | undefined>,
  tz?: string,
): Date {
  const dateParam = typeof searchParams.date === "string" ? searchParams.date : null;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return dateStrToUTC(dateParam);
  }
  return getLocalDay(tz);
}

/** Extracts date string from searchParams, falling back to local today */
export function getDateStrFromParams(
  searchParams: Record<string, string | string[] | undefined>,
  tz?: string,
): string {
  const dateParam = typeof searchParams.date === "string" ? searchParams.date : null;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return dateParam;
  }
  return getLocalDayStr(tz);
}

/**
 * Returns [start, end) Date bounds for a YYYY-MM-DD date string, anchored at
 * LOCAL midnight. Use this for filtering tables whose timestamps are stored as
 * true points-in-time (e.g. ActivityTag.timestamp, NutritionEntry.eatenAt).
 *
 * Using UTC midnight for these filters (as happens when you pass the output of
 * `dateStrToUTC` straight into a `gte/lt` query) causes a timezone skew: tags
 * logged late in the local evening get pushed into the *next* UTC day's
 * bucket, and early-morning local tags bleed in from the *previous* local day.
 * This helper fixes that by using the server's local clock.
 */
export function getLocalDayBounds(
  dateStr: string,
  tz?: string,
): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!tz) {
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    return { start, end };
  }
  // Midnight in tz as a UTC instant: guess UTC midnight, correct by the
  // zone's offset at that instant. (A DST transition exactly at midnight
  // could be off by the shift — acceptable for day bucketing.)
  const toTzMidnight = (yy: number, mm: number, dd: number): Date => {
    const guess = new Date(Date.UTC(yy, mm - 1, dd));
    return new Date(guess.getTime() - tzOffsetMs(tz, guess));
  };
  const start = toTzMidnight(y, m, d);
  const end = toTzMidnight(y, m, d + 1);
  return { start, end };
}
