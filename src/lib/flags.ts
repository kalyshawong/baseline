/**
 * Flags — the "this doesn't add up" surface.
 *
 * Distinct from insights.ts (which finds statistical correlations in tagged
 * behavior). Flags are the system being honest about *itself*: contradictions
 * between signals, physiologically implausible data, assumptions/thresholds
 * that don't fit her, and stale inputs. The goal is to surface the things a
 * good training partner would notice unprompted — before she has to ask.
 *
 * Two axes the UI leans on:
 *   - kind: "your_data" (something for her to confirm/fix) vs "my_assumption"
 *     (the system's default was wrong — my problem, not hers). Different tone.
 *   - severity: "needs_you" (act/confirm), "calibration" (standing FYI),
 *     "resolved" (closed the loop). v1 mostly emits needs_you.
 *
 * v1 is four cheap deterministic checks. A nightly LLM "what's off?" sweep is
 * the planned v2 — that's where open-ended coverage comes from.
 */

import { prisma } from "./db";
import { getTrainingCallForDate } from "./training-call";
import { resolveCyclePhase, getCurrentPeriodDay } from "./cycle-phase";
import type { TrainingCall } from "./training";

export type FlagSeverity = "needs_you" | "calibration" | "resolved";
export type FlagKind = "your_data" | "my_assumption";

export interface FlagAction {
  label: string;
  /** Navigation target within the app. */
  href: string;
}

export interface Flag {
  /** Stable key — used for dismissal and to dedupe across renders. */
  id: string;
  title: string;
  body: string;
  severity: FlagSeverity;
  kind: FlagKind;
  /** Navigational actions. The feed always renders its own Dismiss. */
  actions: FlagAction[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Typical phase lengths (days) — beyond this, a still-active log is worth a
// second look. Looser than the staleness caps in cycle-phase.ts on purpose:
// this asks "is this real?", not "should I stop trusting it?"
const PHASE_TYPICAL_DAYS: Record<string, number> = {
  menstrual: 6,
  follicular: 13,
  ovulation: 3,
  luteal: 14,
};

// Plausible bounds for an overnight average. Deliberately wide so her
// genuinely low HRV (~20ms) never trips it — only true sync artifacts do.
const HRV_MS_MIN = 3;
const HRV_MS_MAX = 200;
const TEMP_DEV_MAX_C = 1.5;

// No fresh readiness for this many days → the call is running on stale data.
const STALE_SYNC_DAYS = 2;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function getFlags(
  forDate: Date,
  opts?: { call?: TrainingCall | null },
): Promise<Flag[]> {
  const flags: Flag[] = [];

  // ── Check 1: verdict vs readiness contradiction ──────────────────────
  // A strong baseline (go_hard) dragged all the way to Easy/Recover means
  // multiple downgrades stacked. Surface the gap so she can sanity-check
  // that the reasons are real (this is exactly the class of bug that hid
  // the stuck-on-Easy HRV miscalibration).
  const call =
    opts && "call" in opts ? opts.call : await getTrainingCallForDate(forDate);
  if (
    call &&
    call.baseTier === "go_hard" &&
    (call.verdict === "Easy" || call.verdict === "Recover")
  ) {
    const reasons =
      call.downgrades.length > 0
        ? call.downgrades.join(" + ")
        : "stacked downgrades";
    flags.push({
      id: "contradiction-call",
      title: `Strong readiness, but the call says ${call.verdict}`,
      body: `Your score alone would say go hard, yet the call landed on ${call.verdict} — driven by ${reasons}. Worth checking those downgrades are real.`,
      severity: "needs_you",
      kind: "my_assumption",
      actions: [{ label: "See breakdown", href: "/body" }],
    });
  }

  // ── Check 2: cycle phase outrunning its typical length ────────────────
  const cycle = await resolveCyclePhase(forDate);
  if (cycle.phase) {
    const typical = PHASE_TYPICAL_DAYS[cycle.phase] ?? 14;
    if (cycle.phase === "menstrual") {
      const periodDay = await getCurrentPeriodDay(forDate);
      if (periodDay != null && periodDay > typical) {
        flags.push({
          id: "phase-streak-menstrual",
          title: `Menstrual logged ${periodDay} days straight`,
          body: `That's longer than a typical period (~${typical} days) and past the window the call assumes — it's been capping your call. Still your period, or did logging lapse?`,
          severity: "needs_you",
          kind: "your_data",
          actions: [{ label: "Update phase", href: "/" }],
        });
      }
    } else if (
      cycle.lastLoggedDaysAgo != null &&
      cycle.lastLoggedDaysAgo >= typical
    ) {
      flags.push({
        id: "phase-aging",
        title: `${capitalize(cycle.phase)} phase is ${cycle.lastLoggedDaysAgo} days old`,
        body: `No newer cycle log, so the call still assumes ${cycle.phase}. If you've moved on, update it so the call isn't running on a stale phase.`,
        severity: "needs_you",
        kind: "your_data",
        actions: [{ label: "Update phase", href: "/" }],
      });
    }
  }

  // ── Check 3: physiologically implausible values ──────────────────────
  const latestSleep = await prisma.dailySleep.findFirst({
    where: { day: { lte: forDate }, averageHrv: { not: null } },
    orderBy: { day: "desc" },
    select: { averageHrv: true, day: true },
  });
  if (
    latestSleep?.averageHrv != null &&
    (latestSleep.averageHrv < HRV_MS_MIN || latestSleep.averageHrv > HRV_MS_MAX)
  ) {
    flags.push({
      id: "implausible-hrv",
      title: `HRV reading looks off: ${Math.round(latestSleep.averageHrv)} ms`,
      body: `That's outside the plausible range (${HRV_MS_MIN}–${HRV_MS_MAX} ms) for an overnight average — likely a sync glitch, not a real value.`,
      severity: "needs_you",
      kind: "your_data",
      actions: [{ label: "Re-sync Oura", href: "/api/auth/oura" }],
    });
  }

  const latestReadiness = await prisma.dailyReadiness.findFirst({
    where: { day: { lte: forDate } },
    orderBy: { day: "desc" },
    select: { temperatureDeviation: true, day: true },
  });
  if (
    latestReadiness?.temperatureDeviation != null &&
    Math.abs(latestReadiness.temperatureDeviation) > TEMP_DEV_MAX_C
  ) {
    flags.push({
      id: "implausible-temp",
      title: `Body temp deviation looks extreme: ${latestReadiness.temperatureDeviation.toFixed(1)}°C`,
      body: `A deviation over ±${TEMP_DEV_MAX_C}°C is rare from a ring sensor — could be illness, or a bad reading. Flagging so it doesn't quietly skew your score.`,
      severity: "needs_you",
      kind: "your_data",
      actions: [],
    });
  }

  // ── Check 4: stale sync ───────────────────────────────────────────────
  if (latestReadiness) {
    const daysStale = Math.floor(
      (forDate.getTime() - latestReadiness.day.getTime()) / DAY_MS,
    );
    if (daysStale >= STALE_SYNC_DAYS) {
      flags.push({
        id: "stale-sync",
        title: `No fresh data for ${daysStale} days`,
        body: `Your most recent readiness is ${daysStale} days old. The call is running on stale inputs until you sync.`,
        severity: "needs_you",
        kind: "your_data",
        actions: [{ label: "Sync now", href: "/api/auth/oura" }],
      });
    }
  }

  return flags;
}
