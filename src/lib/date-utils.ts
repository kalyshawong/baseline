/**
 * Centralized date utilities for consistent local-date handling.
 * BUG-008 fix: all daily data lookups use getLocalDay() instead of
 * ad-hoc Date constructions that may resolve to the wrong UTC day.
 */

/** Returns today's local date as a YYYY-MM-DD string */
export function getLocalDayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Returns a local date string as a UTC midnight Date object for Prisma queries */
export function dateStrToUTC(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00.000Z");
}

/** Returns today's local date as a UTC midnight Date for Prisma queries */
export function getLocalDay(): Date {
  return dateStrToUTC(getLocalDayStr());
}

/** Extracts date from Next.js searchParams, falling back to local today */
export function getDateFromParams(searchParams: Record<string, string | string[] | undefined>): Date {
  const dateParam = typeof searchParams.date === "string" ? searchParams.date : null;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return dateStrToUTC(dateParam);
  }
  return getLocalDay();
}

/** Extracts date string from searchParams, falling back to local today */
export function getDateStrFromParams(searchParams: Record<string, string | string[] | undefined>): string {
  const dateParam = typeof searchParams.date === "string" ? searchParams.date : null;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return dateParam;
  }
  return getLocalDayStr();
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
export function getLocalDayBounds(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}
