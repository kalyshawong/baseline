import type { CyclePhaseGuidance } from "@/lib/training";

const phaseColors: Record<string, { bg: string; border: string; text: string }> = {
  menstrual: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400" },
  follicular: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  ovulation: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
  luteal: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
};

export function CyclePhaseGuidanceCard({ guidance }: { guidance: CyclePhaseGuidance }) {
  const style = phaseColors[guidance.phase];
  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Cycle Phase Guidance
          </p>
          <p className={`mt-1 text-lg font-bold ${style.text}`}>{guidance.headline}</p>
        </div>
        {guidance.aclWarning && (
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
            ACL caution
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">
        {guidance.note}
      </p>
      {guidance.volumeMod < 1 && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Volume adjustment: {Math.round((1 - guidance.volumeMod) * 100)}% reduction
        </p>
      )}
    </div>
  );
}
