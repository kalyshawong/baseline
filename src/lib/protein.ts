/**
 * Daily protein target. Pure — safe for client components (onboarding).
 *
 * Everyone: 1.6 g/kg (Morton 2018 — breakpoint 1.62 g/kg, 95% CI up to 2.2).
 * Bodybuilding / strength goal: scaled by phase inside Morton's 1.6–2.2 range,
 * highest in a cut where the job is keeping muscle in a deficit (Helms 2014).
 */
export type Phase = "gain" | "maintain" | "lose";

export function proteinPerKg(opts?: { bodybuilding?: boolean; phase?: string | null }): number {
  if (!opts?.bodybuilding) return 1.6;
  if (opts.phase === "lose") return 2.2;
  if (opts.phase === "gain") return 1.8;
  return 2.0;
}

export function proteinTargetG(
  bodyWeightKg: number | null | undefined,
  opts?: { bodybuilding?: boolean; phase?: string | null },
): number | null {
  if (bodyWeightKg == null || bodyWeightKg <= 0) return null;
  return Math.round(bodyWeightKg * proteinPerKg(opts));
}
