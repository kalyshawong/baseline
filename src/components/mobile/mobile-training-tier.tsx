import { TIER_MODS, type TrainingCall } from "@/lib/training";

/**
 * Mobile training-tier band — the design's .rband (78px verdict, full-width
 * read line, 2×2 mods grid). Same inputs as the desktop ReadinessTierCard, but
 * sized for a phone so the text isn't crammed into a narrow column.
 */
export function MobileTrainingTier({
  call,
  baselineScore,
  hrvCv,
  hrvCvElevated,
}: {
  call: TrainingCall | null;
  baselineScore: number | null;
  hrvCv?: number | null;
  hrvCvElevated?: boolean;
}) {
  if (!call) {
    return (
      <div className="panel">
        <span className="ov">Training Tier · Today</span>
        <p style={{ marginTop: 8, fontSize: 13, color: "var(--dim)" }}>
          No readiness data — sync to compute today&apos;s training call.
        </p>
      </div>
    );
  }

  const finalMods = TIER_MODS[call.tier];
  const baseMods = TIER_MODS[call.baseTier];
  const wasDowngraded = call.tier !== call.baseTier;
  const statusFlag = call.color === "red" ? "Alert" : call.color === "yellow" ? "Caution" : "Ready";

  return (
    <div className="rband">
      <div className="top">
        <span className="ov">Training Tier · Today</span>
        <span className="statusflag">{statusFlag}</span>
      </div>
      <div className="verdict">{call.verdict}</div>
      <div className="read">{call.whyLine}</div>
      <div className="rec">{call.actionLine}</div>
      {wasDowngraded && (
        <div className="down">
          Score alone would suggest <b>{baseMods.label}</b>
          {call.downgrades.length > 0 && <> — downgraded due to <b>{call.downgrades.join(" and ")}</b></>}.
        </div>
      )}
      <div className="mods">
        <div className="mrow"><span className="mk">Volume</span><span className="mv num">{Math.round(finalMods.volumeMod * 100)}%</span></div>
        <div className="mrow"><span className="mk">Intensity</span><span className="mv num">{Math.round(finalMods.intensityMod * 100)}%</span></div>
        {hrvCv != null && (
          <div className="mrow"><span className="mk">HRV CV</span><span className={`mv num ${hrvCvElevated ? "warn" : ""}`}>{hrvCv.toFixed(1)}%</span></div>
        )}
        {baselineScore != null && (
          <div className="mrow"><span className="mk">Baseline</span><span className="mv num g">{baselineScore}</span></div>
        )}
      </div>
    </div>
  );
}
