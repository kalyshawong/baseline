import { TIER_MODS, type TrainingCall } from "@/lib/training";

/**
 * Body-page hero band — the "Command Deck" readiness verdict.
 *
 * Combines what was previously TodayCallCard + a separate tier card
 * into a single amber-accented hero band: huge Bebas verdict on the
 * left, Volume/Intensity/HRV-CV/Baseline mods on the right.
 *
 * Design ref: Baseline Body.html → .rband
 */

export function ReadinessTierCard({
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
      <div className="panel p-8">
        <p className="ov">Training Tier · Today</p>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          No readiness data — sync to compute today&apos;s training call.
        </p>
      </div>
    );
  }

  const finalTier = call.tier;
  const baseTier = call.baseTier;
  const wasDowngraded = finalTier !== baseTier;
  const finalMods = TIER_MODS[finalTier];
  const baseMods = TIER_MODS[baseTier];

  // Status flag text
  const statusFlag =
    call.color === "red"
      ? "Alert"
      : call.color === "yellow"
        ? "Caution"
        : "Ready";

  return (
    <div
      className="grid grid-cols-[1fr_300px]"
      style={{
        borderLeft: "6px solid var(--color-yellow)",
        background: "var(--color-surface)",
        backgroundImage:
          "linear-gradient(135deg, color-mix(in oklch, var(--color-yellow), transparent 80%), transparent 55%)",
        boxShadow:
          "0 0 60px -22px var(--color-yellow), inset 0 1px 0 oklch(1 0 0 / 0.05)",
      }}
    >
      {/* Left — verdict area */}
      <div className="p-[26px_30px]">
        <div className="flex items-center justify-between">
          <span className="ov">Training Tier · Today</span>
          <span
            className="angled-clip px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em]"
            style={{
              background:
                call.color === "red"
                  ? "var(--color-red)"
                  : call.color === "yellow"
                    ? "var(--color-yellow)"
                    : "var(--color-green)",
              color: "var(--color-bg)",
            }}
          >
            {statusFlag}
          </span>
        </div>
        <p
          className="disp leading-[0.82] mt-[6px] mb-[2px]"
          style={{
            fontSize: "108px",
            color: "var(--color-yellow)",
          }}
        >
          {call.verdict}
        </p>
        <p className="text-[17px] font-medium max-w-[520px]">
          {call.whyLine}
        </p>
        <p
          className="mt-[9px] text-[15px] font-bold uppercase tracking-[0.02em]"
          style={{ color: "var(--color-yellow)" }}
        >
          {call.actionLine}
        </p>
        {wasDowngraded && (
          <p className="mt-[14px] text-[13px] leading-relaxed text-[var(--color-text-muted)] max-w-[520px]">
            Score alone would suggest{" "}
            <span className="font-bold text-[var(--color-text)]">
              {baseMods.label}
            </span>
            {call.downgrades.length > 0 && (
              <>
                {" "}— downgraded due to{" "}
                <span className="font-bold text-[var(--color-text)]">
                  {call.downgrades.join(" and ")}
                </span>
              </>
            )}
            .
          </p>
        )}
      </div>

      {/* Right — mods panel */}
      <div
        className="flex flex-col justify-center gap-4 p-[22px_24px]"
        style={{ background: "var(--color-surface-2)" }}
      >
        <div className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
            Volume
          </span>
          <span className="disp text-[34px] leading-[0.85] num">
            {Math.round(finalMods.volumeMod * 100)}%
          </span>
        </div>
        <div className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
            Intensity
          </span>
          <span className="disp text-[34px] leading-[0.85] num">
            {Math.round(finalMods.intensityMod * 100)}%
          </span>
        </div>
        {hrvCv != null && (
          <div className="flex items-baseline justify-between border-b border-[var(--color-border)] pb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
              HRV CV
            </span>
            <span
              className="disp text-[34px] leading-[0.85] num"
              style={{
                color: hrvCvElevated ? "var(--color-yellow)" : undefined,
              }}
            >
              {hrvCv.toFixed(1)}%
            </span>
          </div>
        )}
        {baselineScore != null && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
              Baseline
            </span>
            <span
              className="disp text-[34px] leading-[0.85] num"
              style={{ color: "var(--color-green)" }}
            >
              {baselineScore}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
