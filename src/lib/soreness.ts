import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { dateStrToUTC } from "@/lib/date-utils";

/**
 * Soreness — EPISODE model (2026-08-20, replacing log-every-day streaks).
 *
 * Her call: "sore until i clear it". One log opens an episode; it carries
 * forward automatically each day ("day N" keeps counting) until a cleared
 * row ends it. Logging again mid-episode just updates that day's severity.
 * The cleared day itself is the first NOT-sore day.
 *
 * Nothing episodic is stored — rows are still (day, part, severity[, cleared])
 * and episodes are derived at read time, so history stays reinterpretable.
 */

export const BODY_PARTS = [
  "quads",
  "hamstrings",
  "calves",
  "shins",
  "glutes",
  "hips",
  "back",
  "shoulders",
  "feet/ankles",
] as const;

/** How far back an un-cleared episode can carry. Guards against a forgotten
 *  clear turning into a months-long phantom episode in the analyzer. */
const LOOKBACK_DAYS = 60;

export interface SorenessEntry {
  id: string;
  bodyPart: string;
  severity: number;
  note: string | null;
  /** Days since the episode opened, inclusive ("day N"). */
  streak: number;
  /** True when today's value is carried from an earlier log, not logged today. */
  carried: boolean;
}

interface Row {
  id: string;
  day: Date;
  bodyPart: string;
  severity: number;
  note: string | null;
  cleared: boolean;
}

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Active episodes as of `dateStr` — carried forward from the last log. */
export async function getSorenessForDay(dateStr: string): Promise<SorenessEntry[]> {
  const day = dateStrToUTC(dateStr);
  const lookback = new Date(day);
  lookback.setUTCDate(lookback.getUTCDate() - LOOKBACK_DAYS);

  const logs: Row[] = await prisma.sorenessLog.findMany({
    where: { userId: getCurrentUserId(), day: { gte: lookback, lte: day } },
    orderBy: { day: "asc" },
  });

  const byPart = new Map<string, Row[]>();
  for (const l of logs) {
    const arr = byPart.get(l.bodyPart) ?? [];
    arr.push(l);
    byPart.set(l.bodyPart, arr);
  }

  const entries: SorenessEntry[] = [];
  for (const [part, rows] of byPart) {
    const last = rows[rows.length - 1];
    if (last.cleared) continue; // episode ended

    // Episode start = first row after the most recent cleared row.
    const lastClearIdx = rows.map((r) => r.cleared).lastIndexOf(true);
    const start = rows[lastClearIdx + 1];
    const streak =
      Math.round((day.getTime() - start.day.getTime()) / 86_400_000) + 1;

    entries.push({
      id: last.id,
      bodyPart: part,
      severity: last.severity,
      note: last.note,
      streak,
      carried: last.day.getTime() !== day.getTime(),
    });
  }
  return entries.sort((a, b) => b.severity - a.severity);
}

/**
 * Per-part sets of sore YYYY-MM-DD days with episodes expanded — for the
 * soreness→running analyzer. An episode spans from its opening log through
 * the day BEFORE its cleared row (clearing day = first not-sore day). An
 * open episode extends to `today`.
 */
export async function getSoreDaySetsByPart(): Promise<Map<string, Set<string>>> {
  const logs: Row[] = await prisma.sorenessLog.findMany({
    where: { userId: getCurrentUserId() },
    orderBy: { day: "asc" },
  });

  const byPart = new Map<string, Row[]>();
  for (const l of logs) {
    const arr = byPart.get(l.bodyPart) ?? [];
    arr.push(l);
    byPart.set(l.bodyPart, arr);
  }

  const today = new Date();
  const out = new Map<string, Set<string>>();

  for (const [part, rows] of byPart) {
    const days = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.cleared) continue;
      // This row keeps the episode sore from its day until the next row
      // (which either updates severity — also sore — or clears it).
      const next = rows[i + 1];
      const endExclusive = next ? next.day : addDays(today, 1);
      const capped = Math.min(
        // never expand a single row more than LOOKBACK_DAYS
        LOOKBACK_DAYS,
        Math.round((endExclusive.getTime() - row.day.getTime()) / 86_400_000),
      );
      for (let d = 0; d < capped; d++) days.add(dayStr(addDays(row.day, d)));
    }
    if (days.size > 0) out.set(part, days);
  }
  return out;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
