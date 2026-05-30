import { TIER_MODS, type TrainingCall } from "@/lib/training";

/**
 * Displays the FINAL integrated training tier — same answer as
 * TodayCallCard, with the Volume/Intensity modifiers and the score-
 * band context shown alongside.
 *
 * Bug history (2026-05-28): this card previously consumed the
 * score-only `readinessTier(score)` tier, which says "Go Hard" for
 * any score ≥ 85 regardless of HRV CV or cycle phase. When the
 * integrated call downgraded to "Easy" due to overreaching + menstrual
 * phase, the two cards on /body contradicted each other. This version
 * uses the integrated call's final tier so the page never disagrees
 * with itself.
 */

const tierStyles: Record<string, { bg: string; border: string; text: string }> = {
  go_hard: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
  },
  standard: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
  },
  moderate: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-400",
  },
  light: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
  },
  recovery: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-400",
  },
};

export function ReadinessTierCard({
  call,
  baselineScore,
  hrvCv,
  hrvCvElevated,
}: {
  /** The integrated training call from computeTrainingCall(). Source
   *  of truth for the verdict + final tier. When null, the card
   *  renders a "no data" fallback. */
  call: TrainingCall | null;
  baselineScore: number | null;
  hrvCv?: number | null;
  /** Whether the CV is elevated relative to HER baseline (personalized),
   *  not a flat 10%. When omitted, no amber emphasis is applied. */
  hrvCvElevated?: boolean;
}) {
  if (!call) {
    return (
      <div className="panel p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Today&apos;s Training Tier
        </p>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">
          No readiness data — sync to compute today&apos;s training call.
        </p>
      </div>
    );
  }

  const finalTier = call.tier;
  const baseTier = call.baseTier;
  const wasDowngraded = finalTier !== baseTier;

  const style = tierStyles[finalTier];
  const finalMods = TIER_MODS[finalTier];
  const baseMods = TIER_MODS[baseTier];

  return (
    <div className={`border ${style.border} ${style.bg} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Today&apos;s Training Tier
          </p>
          {/* Use the call's verdict ("Easy", "Push", etc.) instead of
           *  the tier label ("Moderate", "Go Hard") so this headline
           *  matches the TodayCallCard above + the dashboard hero
           *  verbatim. The Volume/Intensity % below still surface the
           *  granular tier (moderate vs light) so no information is
           *  lost. */}
          <p className={`mt-1 text-2xl font-bold ${style.text}`}>
            {call.verdict}
          </p>
          {baselineScore != null && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Baseline Score: {baselineScore}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-[var(--color-text-muted)]">
          <p>Volume: {Math.round(finalMods.volumeMod * 100)}%</p>
          <p>Intensity: {Math.round(finalMods.intensityMod * 100)}%</p>
          {hrvCv != null && (
            <p
              className={
                hrvCvElevated ? "text-amber-400 font-medium" : ""
              }
            >
              HRV CV: {hrvCv.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      {/* When the score-only tier differs from the final tier, surface
       * the downgrade explicitly. Avoids the confusion of "Baseline 87
       * → Easy" without an explanation. */}
      {wasDowngraded && (
        <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
          Score alone would suggest{" "}
          <span className="font-medium text-[var(--color-text)]">
            {baseMods.label}
          </span>
          {call.downgrades.length > 0 ? (
            <>
              {" "}
              — downgraded due to{" "}
              <span className="font-medium text-[var(--color-text)]">
                {call.downgrades.join(", ")}
              </span>
              .
            </>
          ) : (
            "."
          )}
        </p>
      )}
    </div>
  );
}
