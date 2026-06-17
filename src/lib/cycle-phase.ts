import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";

/**
 * Centralized cycle-phase lookup with staleness guard.
 *
 * Bug history (2026-05-28): every consumer of `CyclePhaseLog` did its
 * own `findFirst({ where: { day: { lte: target } }, orderBy: { day:
 * "desc" } })` and trusted whatever came back. CyclePhaseLog is
 * manual-entry-only, so when the user stops logging, the "most recent
 * entry before X" can be from months ago — and every downstream
 * (workout-note snapshots, training call, baseline score temp adjust,
 * coach prompts) would confidently echo a stale phase. The May 27 puke
 * session's signalSnapshot wrote `cyclePhase: "menstrual"` from an
 * April 25 log, and the coach response said "day 33 of your cycle"
 * because the LLM treated the 32-day gap as a cycle-day count.
 *
 * Fix: every phase entry has a maximum useful lifetime (longer than
 * the phase's typical duration, padded for individual variation). If
 * the most recent log is older than its phase's cap, we return
 * `phase: null` and surface `lastLoggedDaysAgo` instead, so callers
 * can render "cycle phase: unknown (last logged 32 days ago)" rather
 * than a false phase.
 *
 * Phase caps (max days from log entry to expected phase end):
 *   - menstrual: 7  (typical 1-5d; padding for individual variation)
 *   - follicular: 14 (typical 6-13d; allows late ovulation)
 *   - ovulation: 5  (typical 14-16d, very short)
 *   - luteal: 16   (typical 17-28d, ~12-day phase + padding)
 */

const PHASE_MAX_DAYS: Record<string, number> = {
  menstrual: 7,
  follicular: 14,
  ovulation: 5,
  luteal: 16,
};
const DEFAULT_MAX_DAYS = 14;

export interface ResolvedCyclePhase {
  /** Phase active on the target day, or null when stale / no log ever. */
  phase: string | null;
  /**
   * The local-day Date the active phase was logged on. Null when
   * `phase` is null (either stale or no log ever). When non-null,
   * useful for "phase logged Mar 5" copy and cycle-day arithmetic.
   */
  loggedDay: Date | null;
  /**
   * Source of the active phase log ("manual" | "healthkit" | etc.).
   * Null when `phase` is null.
   */
  source: string | null;
  /**
   * Days since the most recent CyclePhaseLog entry, regardless of
   * staleness. Null only when there's never been a log entry on or
   * before the target day. Use this to render "last logged N days ago"
   * UI/prompt copy even when `phase` is null.
   */
  lastLoggedDaysAgo: number | null;
  /**
   * The raw most-recent log's phase string, even if stale. Useful for
   * staleness-aware copy like "last known: luteal (16 days ago)."
   */
  lastLoggedPhase: string | null;
  /**
   * True when a log existed but the helper declined to use it because
   * it's older than the phase's max-days cap. False when phase is
   * non-null OR when no log existed at all.
   */
  isStale: boolean;
}

/**
 * Resolve the cycle phase active on `targetDay` from CyclePhaseLog,
 * applying phase-aware staleness caps.
 *
 * @param targetDay The local-day Date to resolve a phase for.
 * @param maxDaysOverride Override the phase-aware caps (e.g. for
 *   surfaces that want a stricter "today's truth only" check).
 */
export async function resolveCyclePhase(
  targetDay: Date,
  maxDaysOverride?: number,
): Promise<ResolvedCyclePhase> {
  const log = await prisma.cyclePhaseLog.findFirst({
    where: { day: { lte: targetDay } },
    orderBy: { day: "desc" },
  });
  if (!log) {
    return {
      phase: null,
      loggedDay: null,
      source: null,
      lastLoggedDaysAgo: null,
      lastLoggedPhase: null,
      isStale: false,
    };
  }
  const DAY_MS = 24 * 60 * 60 * 1000;
  const msAgo = targetDay.getTime() - log.day.getTime();
  const daysAgo = Math.max(0, Math.floor(msAgo / DAY_MS));

  // --- End-of-period handling (2026-06-01) ----------------------------
  // A menstrual log means bleeding occurred ON that day — it does NOT
  // mean the user stays menstrual for `cap` days AFTER it. The original
  // staleness cap carried the last menstrual log forward up to 7 days,
  // so the day a period actually ended, the app kept reporting
  // "menstrual" for a week (the May 27 -> still-menstrual-June-1 bug).
  //
  // When the most recent menstrual log is the tail of a CONSECUTIVE
  // daily-logged streak (HealthKit/Clue sync writes every bleeding
  // day), the period ended on that day. Once we're carrying the phase
  // forward past it, the honest phase is follicular — menstruation-end
  // to ovulation is the follicular phase by definition, so this is
  // derivation, not a guess.
  //
  // Grace: 1 day, to tolerate "still bleeding but hasn't logged today
  // yet" before flipping. An ISOLATED menstrual log (no menstrual entry
  // the day before) is treated as a lone "period started" marker and
  // keeps the original multi-day carry — we can't see the end of a
  // period that was only logged once.
  if (log.phase === "menstrual" && daysAgo > 0) {
    const prev = await prisma.cyclePhaseLog.findUnique({
      where: { userId_day: { userId: getCurrentUserId(), day: new Date(log.day.getTime() - DAY_MS) } },
    });
    const isStreak = prev?.phase === "menstrual";
    const MENSTRUAL_GRACE_DAYS = 1;

    if (isStreak && daysAgo > MENSTRUAL_GRACE_DAYS) {
      // Period ended on log.day; the next day is follicular onset.
      const follicularOnset = new Date(log.day.getTime() + DAY_MS);
      const follicularDaysAgo = daysAgo - 1;
      const folStale = follicularDaysAgo > PHASE_MAX_DAYS.follicular;
      return {
        phase: folStale ? null : "follicular",
        // Anchor on the derived follicular onset so coach surfaces get a
        // non-null `loggedDay` (active_phase requires it). source marks
        // this as derived, not a user-entered follicular log.
        loggedDay: folStale ? null : follicularOnset,
        source: folStale ? null : "derived",
        lastLoggedDaysAgo: daysAgo,
        lastLoggedPhase: "menstrual",
        isStale: folStale,
      };
    }
    // Within grace, or an isolated marker: fall through to the standard
    // carry below (keeps the original "logged start, then stopped" path).
  }

  const cap = maxDaysOverride ?? PHASE_MAX_DAYS[log.phase] ?? DEFAULT_MAX_DAYS;
  const isStale = daysAgo > cap;
  return {
    phase: isStale ? null : log.phase,
    loggedDay: isStale ? null : log.day,
    source: isStale ? null : log.source,
    lastLoggedDaysAgo: daysAgo,
    lastLoggedPhase: log.phase,
    isStale,
  };
}

/**
 * Find the most recent menstrual log on or before `targetDay`, ONLY
 * if it falls within the maximum plausible cycle length (35 days).
 * Used as the anchor for cycle-day calculations — beyond 35 days, no
 * extrapolation from a stale menstrual entry is honest.
 *
 * Returns the menstrual log's day, or null when none qualify.
 */
export async function findRecentMenstrualStart(
  targetDay: Date,
  maxCycleDays = 35,
): Promise<Date | null> {
  const log = await prisma.cyclePhaseLog.findFirst({
    where: { phase: "menstrual", day: { lte: targetDay } },
    orderBy: { day: "desc" },
  });
  if (!log) return null;
  const daysAgo = Math.floor(
    (targetDay.getTime() - log.day.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (daysAgo > maxCycleDays) return null;
  return log.day;
}

/**
 * Walk backward from the most recent menstrual log on or before
 * `targetDay` through CONSECUTIVE menstrual entries, returning the
 * earliest day in that streak. That's day 1 of the user's current
 * period — the right anchor for "you're on day N of your period."
 *
 * Why this matters (bug 2026-05-28): the dashboard previously
 * computed cycle day as `daysSinceMostRecentMenstrualLog + 1`, which
 * always returned "Day 1" when the user logged her period today —
 * even if she'd been bleeding for a week. Walking back through the
 * streak gives the actual start.
 *
 * Strict-consecutive logic: a single missing day breaks the streak.
 * Real periods usually log every day; an off-day usually indicates a
 * separate event (e.g., spotting from the previous cycle). If we
 * later see data showing the user reliably skips logging on light
 * days, we can relax this to allow 1-day gaps.
 *
 * Returns null when there's no menstrual log on or before targetDay,
 * or when the most recent one is more than `maxCycleDays` old (same
 * staleness rule as findRecentMenstrualStart).
 */
export async function findCurrentPeriodStart(
  targetDay: Date,
  maxCycleDays = 35,
): Promise<Date | null> {
  const latest = await findRecentMenstrualStart(targetDay, maxCycleDays);
  if (!latest) return null;

  let earliest = latest;
  // Walk backward day-by-day until the chain of consecutive menstrual
  // entries ends. Bounded by maxCycleDays to keep worst-case query
  // count cheap.
  for (let i = 0; i < maxCycleDays; i++) {
    const prevDay = new Date(earliest.getTime() - 24 * 60 * 60 * 1000);
    const prev = await prisma.cyclePhaseLog.findUnique({
      where: { userId_day: { userId: getCurrentUserId(), day: prevDay } },
    });
    if (!prev || prev.phase !== "menstrual") break;
    earliest = prevDay;
  }
  return earliest;
}

/**
 * Days since the start of the current period, 1-indexed (day 1 = the
 * earliest consecutive menstrual entry). Returns null when there's
 * no current menstrual streak on or before targetDay.
 */
export async function getCurrentPeriodDay(
  targetDay: Date,
  maxCycleDays = 35,
): Promise<number | null> {
  const start = await findCurrentPeriodStart(targetDay, maxCycleDays);
  if (!start) return null;
  const diffMs = targetDay.getTime() - start.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * Short prompt/UI-friendly description of the cycle phase state,
 * including staleness when relevant. Examples:
 *   - "menstrual (day 2)"
 *   - "menstrual"
 *   - "unknown — last logged 32 days ago (luteal)"
 *   - "unknown — never logged"
 *
 * For LLM prompts, the staleness message keeps the model from
 * confidently quoting a phase that isn't actually known.
 */
export function describeCyclePhase(resolved: ResolvedCyclePhase): string {
  if (resolved.phase) {
    return resolved.phase;
  }
  if (resolved.lastLoggedPhase && resolved.lastLoggedDaysAgo != null) {
    return `unknown — last logged ${resolved.lastLoggedDaysAgo} days ago (${resolved.lastLoggedPhase})`;
  }
  return "unknown — never logged";
}
