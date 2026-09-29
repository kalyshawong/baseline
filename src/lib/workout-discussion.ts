import { prisma } from "@/lib/db";
import {
  getWorkoutByIdAndSource,
  isValidWorkoutSource,
  type SignalSnapshot,
} from "@/lib/workout-notes";
import { safeJsonParse } from "@/lib/utils";
import { getCurrentUserId } from "@/lib/current-user";
import { getRequestTz } from "@/lib/date-utils";

/** Viewer tz for every clock string in the draft — set at builder entry.
 *  Without it these rendered in the SERVER's clock (Eastern): her Italy
 *  8:27 AM run read "2:27 AM" and dinner "1:30 PM" (2026-08-26). */
let activeTz: string | undefined;

function formatClockTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: activeTz,
  });
}

/**
 * Builds a user-message draft for /coach that opens a deep-dive
 * conversation about a specific workout. Triggered by the "Discuss
 * with coach →" button on WorkoutCard.
 *
 * The draft is INSERTED INTO THE INPUT — not auto-sent. The user can
 * edit it, refocus the question, or paste in extra context before
 * hitting send.
 *
 * 2026-05-28 simplification: dropped the prior-Analyze-output branch.
 * The inline Analyze button was removed from WorkoutNotesBlock, so
 * referencing "the one-shot Analyze already said..." was both stale
 * and confusing. The draft is now a single shape: one-line header,
 * narrative if present, signals line, and a brief conversational
 * opener.
 *
 * Signal labels include explicit qualifiers ("composite", "Oura") so
 * the coach can't conflate the two near-90 scores — a known model
 * failure mode without the labels.
 */

export async function buildWorkoutDiscussionStarter(
  source: string,
  workoutId: string,
  tz?: string,
): Promise<string | null> {
  if (!isValidWorkoutSource(source)) return null;

  try {
    activeTz = tz ?? (await getRequestTz());
  } catch {
    activeTz = undefined;
  }

  const workout = await getWorkoutByIdAndSource(source, workoutId);
  if (!workout) return null;

  // Scope (Kalysha, 2026-09-28): a question about ONE workout carries only
  // that workout, how she came into it (signals) and what she ate BEFORE
  // it. Meals eaten after it and the trailing 7-day workout list were
  // dropped — "coach is pulling too many things ... only pull what i ate
  // before and ignore everything after." The coach can still fetch more
  // with its tools if she asks.
  const { getCurrentPeriodDay } = await import("@/lib/cycle-phase");
  // Compute cycle-day on the WORKOUT'S local day (matches how the
  // signal snapshot was anchored), then pass it into the prompt so
  // the coach doesn't have to derive day-of-period from a single
  // log entry — that's what produced "day 2 of menstrual" instead of
  // the correct "day 6" on 2026-05-27.
  const workoutDayPeriodDay = await getCurrentPeriodDay(workout.workoutDate);
  const dailyTemp = await prisma.dailyReadiness.findUnique({
    where: { userId_day: { userId: await getCurrentUserId(), day: workout.workoutDate } },
    select: { temperatureDeviation: true, temperatureTrendDeviation: true },
  });
  const [note, nutritionLog] = await Promise.all([
    prisma.workoutNote.findUnique({
      where: {
        userId_workoutSource_workoutId: { userId: await getCurrentUserId(), workoutSource: source, workoutId },
      },
    }),
    prisma.nutritionLog.findUnique({
      where: { userId_day: { userId: await getCurrentUserId(), day: workout.workoutDate } },
      include: { entries: { orderBy: { eatenAt: "asc" } } },
    }),
  ]);

  const startedAt = workout.startedAt;
  const startTime = formatClockTime(startedAt);
  const dateStr = startedAt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: activeTz,
  });
  const durationMin = Math.round(workout.durationSeconds / 60);

  // Compact header line: name · date time · duration · HR.
  const headerBits: string[] = [
    workout.name,
    `${dateStr} ${startTime}`,
    `${durationMin} min`,
  ];
  if (workout.avgHeartRate != null) {
    headerBits.push(
      `HR avg ${workout.avgHeartRate}${workout.maxHeartRate != null ? ` / max ${workout.maxHeartRate}` : ""}`,
    );
  }

  const lines: string[] = [headerBits.join(" · ")];

  if (note?.narrative) {
    lines.push("");
    lines.push(note.narrative);
  }

  // Inline signal line. Explicit "(composite)" / "(Oura)" labels to
  // prevent label-swap on output — a verified model failure mode.
  if (note?.signalSnapshot) {
    const signals = safeJsonParse<SignalSnapshot | null>(
      note.signalSnapshot,
      null,
    );
    if (signals) {
      const signalBits: string[] = [];
      if (signals.hrvCv != null)
        signalBits.push(`HRV CV ${signals.hrvCv}%`);
      if (signals.baselineScore != null)
        signalBits.push(`Baseline ${signals.baselineScore} (composite)`);
      if (signals.readinessScore != null)
        signalBits.push(`Readiness ${signals.readinessScore} (Oura)`);
      if (signals.sleepDurationSec != null) {
        const h = Math.floor(signals.sleepDurationSec / 3600);
        const m = Math.round((signals.sleepDurationSec % 3600) / 60);
        signalBits.push(
          `Sleep ${h}h${m}m${signals.sleepScore != null ? ` (score ${signals.sleepScore})` : ""}`,
        );
      }
      if (signals.cyclePhase) {
        // Stamp the actual period day (walked back through the
        // streak) onto the cycle bit so the model doesn't have to
        // guess. Falls back to phase-only when no streak exists.
        const dayBit =
          signals.cyclePhase === "menstrual" && workoutDayPeriodDay
            ? `, day ${workoutDayPeriodDay}`
            : "";
        signalBits.push(`Cycle: ${signals.cyclePhase}${dayBit}`);
      }
      if (signals.stressSummary)
        signalBits.push(`Stress: ${signals.stressSummary}`);
      // Temperature deviation in °C — load-bearing for the cycle
      // narrative. Without this in the signal line, the model
      // invents claims like "core temp +0.3-0.5°C during menstruation"
      // (wrong physiology AND not from her data — verified
      // 2026-05-28). Cite the actual number.
      if (dailyTemp?.temperatureDeviation != null) {
        signalBits.push(
          `Temp deviation: ${dailyTemp.temperatureDeviation > 0 ? "+" : ""}${dailyTemp.temperatureDeviation.toFixed(2)}°C from baseline${
            dailyTemp.temperatureTrendDeviation != null
              ? ` (trend ${dailyTemp.temperatureTrendDeviation > 0 ? "+" : ""}${dailyTemp.temperatureTrendDeviation.toFixed(2)}°C)`
              : ""
          }`,
        );
      }
      if (signalBits.length > 0) {
        lines.push("");
        lines.push(signalBits.join(" · "));
      }
    }
  }

  // Food log for the workout's day. Timestamps matter (especially
  // pre-workout meal timing — the question that prompted including
  // this section at all).
  //
  // `timeUnknown: true` entries don't have a reliable clock time, but
  // the user's logging convention treats mealType as a coarse time
  // band: breakfast = before noon, lunch = 12-5pm, dinner = 5pm+. We
  // surface the band alongside "time unknown" so the coach can still
  // reason about meal-to-workout gaps for ~15% of entries that would
  // otherwise be unanchored. (Without this, all the "discuss" prompts
  // dropped the band entirely and the model treated the entries as
  // useless — see the May 28 audit on food→performance analysis.)
  if (nutritionLog && nutritionLog.entries.length > 0) {
    const entryLine = (entry: (typeof nutritionLog.entries)[number]): string => {
      const time = entry.timeUnknown
        ? `${entry.mealType} (time unknown)`
        : formatClockTime(entry.eatenAt);
      const macros: string[] = [];
      if (entry.protein > 0) macros.push(`${Math.round(entry.protein)}g protein`);
      if (entry.carbs > 0) macros.push(`${Math.round(entry.carbs)}g carbs`);
      if (entry.fat > 0) macros.push(`${Math.round(entry.fat)}g fat`);
      return `- ${time} · ${entry.description} · ${Math.round(entry.calories)} cal${macros.length > 0 ? ` · ${macros.join(", ")}` : ""}`;
    };
    // Only meals that could have fueled the session. A meal eaten after
    // the workout cannot explain it (a post-run dinner with corrupted
    // early-AM timestamps was once narrated as pre-run eating, 2026-08-26),
    // so after-workout entries are left out entirely. Time-unknown entries
    // stay only when their meal_type band can start before the workout.
    const bandStartHour: Record<string, number> = { breakfast: 0, lunch: 12, dinner: 17 };
    const localHour = Number(
      startedAt.toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: activeTz }),
    );
    const before = nutritionLog.entries.filter((e) =>
      e.timeUnknown
        ? (bandStartHour[e.mealType] ?? 0) <= localHour
        : e.eatenAt.getTime() <= startedAt.getTime(),
    );
    lines.push("");
    if (before.length > 0) {
      lines.push(
        `Eaten before this workout (meal-time convention: breakfast = before noon, lunch = 12-5pm, dinner = 5pm onward; "time unknown" entries use meal_type as a coarse band):`,
      );
      for (const entry of before) lines.push(entryLine(entry));
    } else {
      lines.push("Nothing logged before this workout that day.");
    }
  }

  lines.push("");
  lines.push("Walk me through what happened.");

  return lines.join("\n");
}
