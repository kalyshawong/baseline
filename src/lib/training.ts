/**
 * Body Mode training logic.
 * Research citations in docs/body-mode-research.md
 */

// --- Estimated 1RM (Epley formula) ---
// Research: Epley (1985); used extensively across strength literature
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// --- Volume load ---
export function setVolume(weight: number, reps: number): number {
  return weight * reps;
}

// --- MEV / MAV / MRV zones ---
// Research: Israetel 2021, Schoenfeld 2017
// Intermediate defaults — adjust via UserProfile.experienceLevel
export interface VolumeZone {
  mev: number;
  mav: [number, number];
  mrv: number;
}

export const volumeZones: Record<string, VolumeZone> = {
  quads: { mev: 8, mav: [12, 18], mrv: 22 },
  hamstrings: { mev: 6, mav: [10, 16], mrv: 20 },
  glutes: { mev: 0, mav: [4, 12], mrv: 16 },
  back: { mev: 8, mav: [12, 18], mrv: 22 },
  chest: { mev: 8, mav: [12, 18], mrv: 22 },
  shoulders: { mev: 6, mav: [12, 20], mrv: 26 },
  biceps: { mev: 4, mav: [8, 14], mrv: 20 },
  triceps: { mev: 4, mav: [6, 12], mrv: 18 },
  calves: { mev: 6, mav: [10, 14], mrv: 18 },
  core: { mev: 0, mav: [4, 10], mrv: 14 },
};

export type VolumeStatus =
  | "below_mev"
  | "at_mev"
  | "in_mav"
  | "above_mav"
  | "at_mrv"
  | "above_mrv";

export function classifyVolume(sets: number, zone: VolumeZone): VolumeStatus {
  if (sets < zone.mev) return "below_mev";
  if (sets < zone.mav[0]) return "at_mev";
  if (sets <= zone.mav[1]) return "in_mav";
  if (sets < zone.mrv) return "above_mav";
  if (sets === zone.mrv) return "at_mrv";
  return "above_mrv";
}

export function volumeStatusLabel(status: VolumeStatus): { label: string; color: string } {
  switch (status) {
    case "below_mev":
      return { label: "Below MEV", color: "text-yellow-400" };
    case "at_mev":
      return { label: "At MEV", color: "text-blue-400" };
    case "in_mav":
      return { label: "In MAV (optimal)", color: "text-emerald-400" };
    case "above_mav":
      return { label: "Above MAV", color: "text-amber-400" };
    case "at_mrv":
      return { label: "At MRV (deload)", color: "text-red-400" };
    case "above_mrv":
      return { label: "Above MRV (overreaching)", color: "text-red-500" };
  }
}

// --- RPE autoregulation ---
// Research: Zourdos 2016
export function suggestLoadChange(
  recentRPEs: number[]
): "increase" | "hold" | "decrease" {
  if (recentRPEs.length === 0) return "hold";
  const avg = recentRPEs.reduce((a, b) => a + b, 0) / recentRPEs.length;
  if (avg <= 6.5) return "increase";
  if (avg >= 9.0) return "decrease";
  return "hold";
}

// --- RPE creep detection (fatigue accumulation) ---
// Returns true if RPE has increased 1+ point at similar loads across 2+ sessions
export function detectRpeCreep(
  sessions: Array<{ weight: number; rpe: number | null; date: Date }>
): boolean {
  if (sessions.length < 2) return false;
  const withRpe = sessions.filter((s) => s.rpe != null);
  if (withRpe.length < 2) return false;

  // Group by similar load (within 5%) and compare RPE trends
  const sorted = [...withRpe].sort((a, b) => a.date.getTime() - b.date.getTime());
  const recent = sorted.slice(-3); // last 3 sessions
  if (recent.length < 2) return false;

  const firstRpe = recent[0].rpe!;
  const lastRpe = recent[recent.length - 1].rpe!;
  const firstWeight = recent[0].weight;
  const lastWeight = recent[recent.length - 1].weight;

  const weightChangePct = Math.abs((lastWeight - firstWeight) / firstWeight) * 100;
  return weightChangePct < 5 && lastRpe - firstRpe >= 1;
}

// --- HRV Coefficient of Variation ---
// Research: Flatt & Esco 2016 — elevated CV signals overreaching
export function hrvCV(values: number[]): number | null {
  const valid = values.filter((v) => v != null && v > 0);
  if (valid.length < 3) return null;
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const stdDev = Math.sqrt(
    valid.reduce((s, v) => s + (v - mean) ** 2, 0) / (valid.length - 1)
  );
  return (stdDev / mean) * 100;
}

// --- Deload composite fatigue score ---
// Research: Pritchard 2024, Cadegiani 2019
export interface FatigueSignals {
  weeksSinceLastDeload: number;
  hrvBelowBaseline: boolean;
  hrvCvElevated: boolean;
  sleepQualityDecline: boolean;
  rhrElevated: boolean;
  rpeCreep: boolean;
  volumeApproachingMRV: boolean;
}

export function computeFatigueScore(signals: FatigueSignals): {
  score: number;
  recommendation: string;
} {
  let score = 0;
  if (signals.weeksSinceLastDeload >= 5) score += 1;
  if (signals.hrvBelowBaseline) score += 1;
  if (signals.hrvCvElevated) score += 1;
  if (signals.sleepQualityDecline) score += 1;
  if (signals.rhrElevated) score += 1;
  if (signals.rpeCreep) score += 2; // strongest subjective marker
  if (signals.volumeApproachingMRV) score += 1;

  let recommendation: string;
  if (score >= 5) recommendation = "Deload strongly recommended this week";
  else if (score >= 3) recommendation = "Deload recommended within 1-2 weeks";
  else if (score >= 1) recommendation = "Monitor fatigue markers";
  else recommendation = "No fatigue accumulation detected";

  return { score, recommendation };
}

// --- Protein target ---
// Research: Morton 2018 meta-analysis — 1.6 g/kg captures 95% of hypertrophy benefit
export function proteinTarget(bodyWeightKg: number): number {
  return Math.round(bodyWeightKg * 1.6);
}

// --- Per-meal protein check ---
// Research: Moore 2009 — MPS maxes out at ~20-25g per meal
export function perMealProteinStatus(grams: number, age = 30): "low" | "good" | "high" {
  const threshold = age >= 65 ? 30 : age >= 45 ? 25 : 20;
  if (grams < threshold) return "low";
  if (grams > 30) return "high";
  return "good";
}

// --- Energy availability ---
// Research: Loucks 2011 — below 30 kcal/kg FFM impairs recovery
export function energyAvailability(
  caloriesConsumed: number,
  exerciseCalories: number,
  ffmKg: number
): number | null {
  if (ffmKg <= 0) return null;
  return (caloriesConsumed - exerciseCalories) / ffmKg;
}

export function ffmFromBodyComposition(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100);
}

// --- Readiness tier mapping ---
// Research: Plews 2013, Kiviniemi 2007
export interface ReadinessTier {
  tier: "go_hard" | "standard" | "moderate" | "light" | "recovery";
  label: string;
  volumeMod: number; // multiplier applied to prescribed volume
  intensityMod: number; // multiplier applied to prescribed load
  recommendation: string;
}

export function readinessTier(score: number | null): ReadinessTier {
  if (score == null) {
    return {
      tier: "standard",
      label: "No readiness data",
      volumeMod: 1.0,
      intensityMod: 1.0,
      recommendation: "No baseline score available. Train by feel.",
    };
  }
  if (score >= 85)
    return {
      tier: "go_hard",
      label: "Go Hard",
      volumeMod: 1.0,
      intensityMod: 1.0,
      recommendation: "Peak readiness — push today. PR attempts allowed.",
    };
  if (score >= 70)
    return {
      tier: "standard",
      label: "Standard",
      volumeMod: 1.0,
      intensityMod: 1.0,
      recommendation: "Solid day — execute the program.",
    };
  if (score >= 55)
    return {
      tier: "moderate",
      label: "Moderate",
      volumeMod: 0.8,
      intensityMod: 0.95,
      recommendation: "Reduce volume ~20%. Swap heavy compounds for moderate accessories.",
    };
  if (score >= 40)
    return {
      tier: "light",
      label: "Light",
      volumeMod: 0.55,
      intensityMod: 0.85,
      recommendation: "Light day — technique work or mobility. Reduce volume 40-50%.",
    };
  return {
    tier: "recovery",
    label: "Recovery",
    volumeMod: 0,
    intensityMod: 0,
    recommendation: "Skip strength training. Active recovery only — walk, stretch, mobility.",
  };
}

// --- Cycle phase guidance ---
export interface CyclePhaseGuidance {
  phase: string;
  headline: string;
  note: string;
  aclWarning: boolean;
  volumeMod: number;
}

export function cyclePhaseGuidance(phase: string | null): CyclePhaseGuidance | null {
  if (!phase) return null;
  switch (phase) {
    case "menstrual":
      return {
        phase: "menstrual",
        headline: "Menstrual — listen to your body",
        note: "Intensity is okay if readiness supports it. Technique focus on low days.",
        aclWarning: false,
        volumeMod: 1.0,
      };
    case "follicular":
      return {
        phase: "follicular",
        headline: "Follicular — peak strength window",
        note: "Rising estrogen. Push intensity, heavy compounds, PR attempts allowed.",
        aclWarning: false,
        volumeMod: 1.0,
      };
    case "ovulation":
      return {
        phase: "ovulation",
        headline: "Ovulation — high power, watch joints",
        note: "Peak power output, but 3-6x higher ACL injury risk (Hewett 2007). Extra warm-up, controlled landings, knee sleeves for heavy squats.",
        aclWarning: true,
        volumeMod: 1.0,
      };
    case "luteal":
      return {
        phase: "luteal",
        headline: "Luteal — RPE runs higher",
        note: "Progesterone elevates RPE 0.5-1 point at same load (Sung 2014). Maintain loads, reduce volume 10-15%.",
        aclWarning: false,
        volumeMod: 0.87,
      };
    default:
      return null;
  }
}

// --- Common barbell exercises that count toward multiple muscle groups ---
export const compoundContributions: Record<string, string[]> = {
  "Bench Press": ["chest", "triceps"],
  "Incline Bench Press": ["chest", "triceps", "shoulders"],
  "Overhead Press": ["shoulders", "triceps"],
  "Dumbbell Bench Press": ["chest", "triceps"],
  "Dumbbell Shoulder Press": ["shoulders", "triceps"],
  "Dip": ["chest", "triceps"],
  "Push-Up": ["chest", "triceps"],
  "Back Squat": ["quads", "glutes"],
  "Front Squat": ["quads"],
  "Goblet Squat": ["quads", "glutes"],
  "Bulgarian Split Squat": ["quads", "glutes"],
  "Conventional Deadlift": ["hamstrings", "back", "glutes"],
  "Sumo Deadlift": ["quads", "glutes", "back"],
  "Romanian Deadlift": ["hamstrings", "glutes"],
  "Hip Thrust": ["glutes", "hamstrings"],
  "Barbell Row": ["back", "biceps"],
  "Pendlay Row": ["back", "biceps"],
  "Dumbbell Row": ["back", "biceps"],
  "Pull-Up": ["back", "biceps"],
  "Chin-Up": ["back", "biceps"],
  "Lat Pulldown": ["back", "biceps"],
  "Seated Cable Row": ["back", "biceps"],
  "Inverted Row": ["back", "biceps"],
};
