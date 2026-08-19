import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { dateStrToUTC } from "@/lib/date-utils";

/**
 * Soreness log helpers.
 *
 * Day-streaks are computed at read time: a part logged on N consecutive days
 * (ending at the queried day) is "day N". Never stored — the user just logs
 * "quads 6/10" each day and the streak follows.
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

export interface SorenessEntry {
  id: string;
  bodyPart: string;
  severity: number;
  note: string | null;
  /** Consecutive days (ending at the queried day) this part has been logged. */
  streak: number;
}

export async function getSorenessForDay(dateStr: string): Promise<SorenessEntry[]> {
  const day = dateStrToUTC(dateStr);
  const lookback = new Date(day);
  lookback.setUTCDate(lookback.getUTCDate() - 60);

  const logs = await prisma.sorenessLog.findMany({
    where: { userId: getCurrentUserId(), day: { gte: lookback, lte: day } },
    orderBy: { day: "desc" },
  });

  const todays = logs.filter((l) => l.day.getTime() === day.getTime());
  const byPartDays = new Map<string, Set<string>>();
  for (const l of logs) {
    const set = byPartDays.get(l.bodyPart) ?? new Set<string>();
    set.add(l.day.toISOString().slice(0, 10));
    byPartDays.set(l.bodyPart, set);
  }

  return todays.map((l) => {
    const days = byPartDays.get(l.bodyPart) ?? new Set<string>();
    let streak = 0;
    const cursor = new Date(day);
    while (days.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return { id: l.id, bodyPart: l.bodyPart, severity: l.severity, note: l.note, streak };
  });
}
