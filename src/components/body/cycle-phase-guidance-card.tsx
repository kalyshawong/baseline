import type { CyclePhaseGuidance } from "@/lib/training";
import { Cite } from "@/components/science/cite";

/**
 * Cycle phase guidance card — red left border, Bebas headline.
 * Design ref: Baseline Body.html → .cyclecard
 */

export function CyclePhaseGuidanceCard({ guidance }: { guidance: CyclePhaseGuidance }) {
  return (
    <div
      className="panel p-[20px_24px]"
      style={{
        borderLeft: "4px solid var(--color-red)",
      }}
    >
      <p className="ov mb-2">Cycle Phase</p>
      <p
        className="disp text-[26px] tracking-[0.01em]"
        style={{ color: "var(--color-red)" }}
      >
        {guidance.headline}
      </p>
      <p className="mt-[6px] text-[13.5px] leading-relaxed text-[var(--color-text-muted)]">
        {guidance.note}
      </p>
      {guidance.aclWarning && (
        <div
          className="mt-3 p-3 text-xs leading-relaxed"
          style={{
            background: "color-mix(in oklch, var(--color-red), transparent 88%)",
            border: "1px solid color-mix(in oklch, var(--color-red), transparent 70%)",
            color: "var(--color-red)",
          }}
        >
          <p className="font-semibold">Joint awareness</p>
          <p className="mt-1">
            Some studies link the ovulatory window to more ACL injuries; newer reviews call the evidence mixed. Warm up well and keep landings controlled. <Cite ids={["wojtys2002", "hewett2007", "dossantos2023"]} />
          </p>
        </div>
      )}
    </div>
  );
}
