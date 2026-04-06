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
