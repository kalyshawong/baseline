/**
 * Hyrox daily session recommender — pure function, no DB dependency.
 *
 * Answers "what should I do today?" by combining:
 *   - Where the athlete is in the periodization (via currentBlock)
 *   - Today's readiness, HRV CV, sleep, cycle phase
 *   - Days since the last hard session
 *
 * Rule precedence (spec § Daily session recommender):
 *   1. readiness < 50 OR sleep < 5h → recovery
 *   2. HRV CV > 10% → downgrade to easy_run
 *   3. luteal + planned intervals → swap for tempo
 *   4. ≥4 days since last hard session + transmutation → force intervals
 *   5. Otherwise → block template rotation (by weekday)
 *
 * Spec: docs/hyrox-module-spec.md § Daily session recommender
 */

import { currentBlock, type Block, type PlanBlockInput } from "./hyrox-blocks";

export type HyroxSessionType =
  | "easy_run"
  | "tempo"
  | "intervals"
  | "long_run"
  | "strength"
  | "compromised"
  | "station_work"
  | "recovery"
  | "race_simulation";

export interface RecommendSessionInput {
  plan: PlanBlockInput;
  readiness: number | null;
  hrvCv: number | null;
  sleepHours: number | null;
  cyclePhase: string | null;
  /**
   * Days since the athlete last completed a hard session (intervals, tempo,
   * compromised, long_run, race_simulation).
   *
   * null = no prior hard session logged on this plan (semantically distinct
   * from 0, "today", or any numeric value). null is treated as "stale" and
   * fires Rule 4 in transmutation.
   */
  daysSinceLastHardSession: number | null;
  today?: Date;
}

export interface RecommendedSession {
  sessionType: HyroxSessionType;
  title: string;
  prescription: string;
  durationMin: number;
  rationale: string;
  warnings: string[];
  block: Block;
  weekInBlock: number;
  daysToRace: number;
}

const HARD_SESSION_TYPES: ReadonlySet<HyroxSessionType> = new Set([
  "intervals",
  "tempo",
  "compromised",
  "long_run",
  "race_simulation",
]);

/**
 * Canonical weekday template: indexes are 0=Sun..6=Sat to match Date.getDay().
 * This is the "block rotation" baseline before overrides apply.
 */
const WEEKDAY_TEMPLATE: Record<Block, readonly HyroxSessionType[]> = {
  accumulation: [
    "recovery",     // Sun
    "intervals",    // Mon
    "strength",     // Tue
    "easy_run",     // Wed
    "compromised",  // Thu
    "strength",     // Fri
    "long_run",     // Sat
  ],
  transmutation: [
    "recovery",     // Sun
    "intervals",    // Mon
    "strength",     // Tue
    "compromised",  // Wed
    "tempo",        // Thu
    "strength",     // Fri
    "long_run",     // Sat
  ],
  realization: [
    "recovery",         // Sun
    "race_simulation",  // Mon
    "station_work",     // Tue
    "easy_run",         // Wed
    "compromised",      // Thu
    "station_work",     // Fri
    "tempo",            // Sat
  ],
  taper: [
    "recovery",     // Sun
    "tempo",        // Mon
    "strength",     // Tue
    "easy_run",     // Wed
    "station_work", // Thu
    "recovery",     // Fri
    "easy_run",     // Sat
  ],
  complete: [
    "recovery",
    "recovery",
    "recovery",
    "recovery",
    "recovery",
    "recovery",
    "recovery",
  ],
};

interface SessionShape {
  title: string;
  prescription: string;
  durationMin: number;
}

function shape(
  sessionType: HyroxSessionType,
  block: Block,
  volumeMultiplier: number,
  intensityMultiplier: number
): SessionShape {
  // Base durations get scaled by block volume multiplier.
  const scale = (mins: number) => Math.max(20, Math.round(mins * volumeMultiplier));

  switch (sessionType) {
    case "recovery":
      return {
        title: "Recovery day",
        prescription:
          "Easy walk, mobility, foam rolling. Zone 1 only. No structured work.",
        durationMin: scale(30),
      };
    case "easy_run":
      return {
        title: "Easy run",
        prescription:
          block === "taper"
            ? "30-40 min easy, conversational pace (zone 2)."
            : "45-60 min easy, conversational pace (zone 2).",
        durationMin: scale(block === "taper" ? 35 : 50),
      };
    case "tempo":
      return {
        title: "Tempo run",
        prescription:
          intensityMultiplier >= 1.05
            ? "20 min tempo @ threshold pace after 10 min warm-up + 10 min cool-down."
            : "30 min tempo @ threshold pace after 10 min warm-up + 10 min cool-down.",
        durationMin: scale(50),
      };
    case "intervals":
      return {
        title: "Interval session",
        prescription:
          block === "accumulation"
            ? "6 × 800m @ 5k pace, 90s rest. 15 min warm-up / 10 min cool-down."
            : "5 × 1km @ goal pace, 2 min rest. 15 min warm-up / 10 min cool-down.",
        durationMin: scale(60),
      };
    case "long_run":
      return {
        title: "Long run",
        prescription:
          block === "accumulation"
            ? "75-90 min aerobic, steady zone 2."
            : "60-75 min aerobic, steady zone 2.",
        durationMin: scale(80),
      };
    case "strength":
      return {
        title: "Strength session",
        prescription:
          "Compound lifts + Hyrox-adjacent accessories (sled, lunges, carries). Keep concurrency gap ≥6h from runs.",
        durationMin: scale(50),
      };
    case "compromised":
      return {
        title: "Compromised running",
        prescription:
          "4 rounds: 1km run @ goal pace → 1 station (rotate: ski erg, sled, sandbag, wall balls). No rest between.",
        durationMin: scale(55),
      };
    case "station_work":
      return {
        title: "Station work",
        prescription:
          "Benchmark one weakest station at race weight × 2-3 sets. Log time per set.",
        durationMin: scale(40),
      };
    case "race_simulation":
      return {
        title: "Race simulation",
        prescription:
          "Half Hyrox: 4 × (1km run + station) at goal pace. Log transitions.",
        durationMin: scale(55),
      };
  }
}

/**
 * Recommend the session for the given date, applying rule precedence over the
 * weekday template and block multipliers.
 */
export function recommendSession(
  input: RecommendSessionInput
): RecommendedSession {
  const today = input.today ?? new Date();
  const blockState = currentBlock(input.plan, today);
  const warnings: string[] = [];

  // Normalize daysSinceLastHardSession: coerce NaN and non-finite values
  // (±Infinity) to null so "no usable history" takes a single code path.
  let daysSinceLastHardSession = input.daysSinceLastHardSession;
  if (
    typeof daysSinceLastHardSession === "number" &&
    !Number.isFinite(daysSinceLastHardSession)
  ) {
    daysSinceLastHardSession = null;
  }

  // Race is over — nothing to prescribe.
  if (blockState.block === "complete") {
    return {
      sessionType: "recovery",
      title: "Post-race recovery",
      prescription: "Race is complete. Log a debrief and rest.",
      durationMin: 0,
      rationale: `Race was ${Math.abs(blockState.daysToRace)} day(s) ago.`,
      warnings,
      block: blockState.block,
      weekInBlock: blockState.weekInBlock,
      daysToRace: blockState.daysToRace,
    };
  }

  // Pick the weekday template baseline first so rules can "swap" from it.
  const weekday = today.getDay(); // 0..6
  const planned = WEEKDAY_TEMPLATE[blockState.block][weekday];

  const rationaleParts: string[] = [
    `${blockState.block} wk ${blockState.weekInBlock}`,
    `${blockState.daysToRace}d to race`,
  ];

  let chosen: HyroxSessionType = planned;
  let overrideReason: string | null = null;

  // Rule 1: readiness < 50 OR sleep < 5h → recovery
  if (
    (input.readiness !== null && input.readiness < 50) ||
    (input.sleepHours !== null && input.sleepHours < 5)
  ) {
    chosen = "recovery";
    const bits: string[] = [];
    if (input.readiness !== null && input.readiness < 50) {
      bits.push(`readiness ${input.readiness}`);
    }
    if (input.sleepHours !== null && input.sleepHours < 5) {
      bits.push(`sleep ${input.sleepHours.toFixed(1)}h`);
    }
    overrideReason = `forced recovery: ${bits.join(", ")}`;
    warnings.push(
      "Readiness or sleep is below threshold — back off and let the system reset before the next hard session."
    );
  }
  // Rule 2: HRV CV > 10% → downgrade to easy_run
  else if (input.hrvCv !== null && input.hrvCv > 10) {
    if (HARD_SESSION_TYPES.has(planned) || planned === "strength") {
      chosen = "easy_run";
      overrideReason = `HRV CV ${input.hrvCv.toFixed(1)}% → easy_run`;
      warnings.push(
        "HRV CV above 10% suggests accumulating strain. Keep it aerobic today."
      );
    }
  }
  // Rule 3: luteal + planned intervals → swap for tempo
  else if (input.cyclePhase === "luteal" && planned === "intervals") {
    chosen = "tempo";
    overrideReason = "luteal phase → tempo instead of intervals";
    warnings.push(
      "Luteal phase reduces top-end interval tolerance — tempo preserves the stimulus."
    );
  }
  // Rule 4: stale or ≥4 days since last hard session + transmutation → force intervals.
  // null (no history) is treated as stale — there's nothing to recover from, and
  // transmutation demands a high-intensity opener.
  else if (
    blockState.block === "transmutation" &&
    (daysSinceLastHardSession === null || daysSinceLastHardSession >= 4) &&
    !HARD_SESSION_TYPES.has(planned)
  ) {
    chosen = "intervals";
    overrideReason =
      daysSinceLastHardSession === null
        ? "first Hyrox session of this plan → force intervals in transmutation"
        : `${daysSinceLastHardSession}d since hard session in transmutation → force intervals`;
    warnings.push(
      "Transmutation demands frequent high-intensity work — don't stack too many easy days."
    );
  }

  if (overrideReason) {
    rationaleParts.push(overrideReason);
  } else {
    rationaleParts.push(`template: ${planned}`);
  }

  if (input.readiness !== null) {
    rationaleParts.push(`readiness ${input.readiness}`);
  }
  if (input.hrvCv !== null) {
    rationaleParts.push(`HRV CV ${input.hrvCv.toFixed(1)}%`);
  }
  // Skip the tail clause if the override reason already covers the
  // "first Hyrox session" phrasing — otherwise it would render twice.
  const alreadyMentionsFirstSession =
    overrideReason !== null && overrideReason.includes("first Hyrox session");
  if (daysSinceLastHardSession === null) {
    if (!alreadyMentionsFirstSession) {
      rationaleParts.push("first Hyrox session of this plan");
    }
  } else if (daysSinceLastHardSession >= 0) {
    rationaleParts.push(
      `${daysSinceLastHardSession}d since last hard session`
    );
  }

  const shaped = shape(
    chosen,
    blockState.block,
    blockState.volumeMultiplier,
    blockState.intensityMultiplier
  );

  return {
    sessionType: chosen,
    title: shaped.title,
    prescription: shaped.prescription,
    durationMin: shaped.durationMin,
    rationale: rationaleParts.join(" · "),
    warnings,
    block: blockState.block,
    weekInBlock: blockState.weekInBlock,
    daysToRace: blockState.daysToRace,
  };
}
