/**
 * Diagnose candidate library — the plug-in point (DIAGNOSE-ENGINE-SPEC.md
 * §5.1, seeded verbatim 2026-08-26). Add entries here; the engine handles
 * ranking, proposing, testing, and learning without further wiring.
 *
 * Class semantics (§5.2 — the engine's honesty rules):
 *   crossover  — fast on/off, no lasting adaptation → full randomized
 *                experiment; the ONLY class that can produce "confirmed".
 *   one_way    — washout too long for A/B (creatine) → interrupted-time-
 *                series note only, capped at "weak — not randomized".
 *   trend_only — acts through slow adaptation (protein) → 28-day trend
 *                display, never an experiment.
 *   context    — unrandomizable / user-unwilling → balanced across all
 *                experiments, never proposed. Candidates DECLINED TWICE are
 *                reclassified to context for this user (§8).
 */

export type CandidateClass = "crossover" | "one_way" | "trend_only" | "context";

/** [GUARD] The ONLY metrics allowed as primary outcomes (audit §2.2). */
export const APPROVED_OUTCOMES = [
  "volume_load_at_prescribed_rpe",
  "e1rm_estimate",
  "pace_at_fixed_hr",
  "total_sleep_time",
  "nocturnal_rhr",
  "hrv_vs_7day_baseline",
  "temp_deviation",
] as const;
export type OutcomeMetric = (typeof APPROVED_OUTCOMES)[number];

export interface ExperimentTemplate {
  armA: string;
  armB: string;
  assignmentUnit: "session" | "day" | "night";
  /** >= 6 always [GUARD: p-floor 1/2^k — with 4 blocks significance is
   *  mathematically impossible]. */
  minBlocks: number;
  blockPairing: "randomized_pairs"; // fixed — never alternating ABAB [GUARD]
  washoutDiscardDays: number;
  primaryOutcome: OutcomeMetric;
  /** Smallest worthwhile change, in outcome units (fraction for ratios). */
  swc: number;
  balanceOver: ("cyclePhase" | "partnerPresent" | "dayOfWeek")[];
  /** >= 3; default 5 [GUARD: regression to the mean — never start on the
   *  streak]. */
  startDelayDays: number;
}

export interface CandidateDef {
  id: string;
  label: string;
  class: CandidateClass;
  evidenceTags: string[];
  prior: number; // 0..1 seed; per-user learning overrides via DiagnoseCandidateState
  template?: ExperimentTemplate; // iff class === "crossover"
  trendMetric?: string; // iff class === "trend_only"
}

export const CANDIDATE_LIBRARY: CandidateDef[] = [
  {
    id: "fasted_training",
    label: "Long fasting window before training",
    class: "crossover",
    evidenceTags: ["trained fasted", "skipped meal", "fasted"],
    prior: 0.55,
    template: {
      armA: "Meal with carbs 2–3h pre-session",
      armB: "Usual (fasted allowed)",
      assignmentUnit: "session",
      minBlocks: 6,
      blockPairing: "randomized_pairs",
      washoutDiscardDays: 0,
      primaryOutcome: "volume_load_at_prescribed_rpe",
      swc: 0.05,
      balanceOver: ["cyclePhase", "dayOfWeek"],
      startDelayDays: 5,
    },
  },
  {
    id: "hydration",
    label: "Under-hydration",
    class: "crossover",
    evidenceTags: ["low water", "no water bottle"],
    prior: 0.45,
    template: {
      armA: "Assigned intake: 500ml on waking + 500ml pre-session",
      armB: "Usual intake",
      assignmentUnit: "day",
      minBlocks: 6,
      blockPairing: "randomized_pairs",
      washoutDiscardDays: 0,
      primaryOutcome: "volume_load_at_prescribed_rpe",
      swc: 0.05,
      balanceOver: ["cyclePhase", "dayOfWeek"],
      startDelayDays: 5,
    },
  },
  {
    id: "late_caffeine",
    label: "Caffeine after 2pm hurting sleep, then sessions",
    class: "crossover",
    evidenceTags: ["caffeine", "coffee", "espresso", "matcha", "pre-workout"],
    prior: 0.4,
    template: {
      armA: "No caffeine after 2pm",
      armB: "Usual",
      assignmentUnit: "day",
      minBlocks: 6,
      blockPairing: "randomized_pairs",
      washoutDiscardDays: 1,
      primaryOutcome: "total_sleep_time",
      swc: 20 * 60, // 20 min in seconds
      balanceOver: ["cyclePhase", "partnerPresent"],
      startDelayDays: 5,
    },
  },
  {
    id: "alcohol",
    label: "Alcohol within 48h of sessions",
    class: "crossover",
    evidenceTags: ["alcohol", "spirits", "wine", "beer"],
    prior: 0.4,
    template: {
      armA: "No alcohol within 48h of session",
      armB: "Usual",
      assignmentUnit: "day",
      minBlocks: 6,
      blockPairing: "randomized_pairs",
      washoutDiscardDays: 1,
      primaryOutcome: "volume_load_at_prescribed_rpe",
      swc: 0.05,
      balanceOver: ["cyclePhase", "partnerPresent"],
      startDelayDays: 5,
    },
  },
  {
    id: "protein_intake",
    label: "Insufficient protein",
    class: "trend_only",
    evidenceTags: ["low protein"],
    prior: 0.3,
    trendMetric: "protein_g_vs_target_28day",
  },
  {
    id: "creatine_dose",
    label: "Creatine dose change",
    class: "one_way",
    evidenceTags: ["creatine", "preworkout and creatine"],
    prior: 0.15,
  },
  {
    id: "sleep_timing",
    label: "Late/irregular bedtime",
    class: "crossover",
    evidenceTags: ["late night", "went out", "Went Out"],
    prior: 0.35,
    template: {
      armA: "Bedtime anchor 23:15",
      armB: "Usual",
      assignmentUnit: "night",
      minBlocks: 6,
      blockPairing: "randomized_pairs",
      washoutDiscardDays: 0,
      primaryOutcome: "total_sleep_time",
      swc: 20 * 60,
      balanceOver: ["cyclePhase", "partnerPresent"],
      startDelayDays: 5,
    },
  },
];

export const FEASIBILITY: Record<CandidateClass, number> = {
  crossover: 1.0,
  one_way: 0.2,
  trend_only: 0.15,
  context: 0,
};
