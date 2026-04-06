import type { ReadinessTier } from "@/lib/training";

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
  tier,
  baselineScore,
}: {
  tier: ReadinessTier;
  baselineScore: number | null;
}) {
  const style = tierStyles[tier.tier];
  return (
    <div className={`rounded-2xl border ${style.border} ${style.bg} p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Today&apos;s Training Tier
          </p>
          <p className={`mt-1 text-2xl font-bold ${style.text}`}>{tier.label}</p>
          {baselineScore != null && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Baseline Score: {baselineScore}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-[var(--color-text-muted)]">
          <p>Volume: {Math.round(tier.volumeMod * 100)}%</p>
          <p>Intensity: {Math.round(tier.intensityMod * 100)}%</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-[var(--color-text-muted)] leading-relaxed">
        {tier.recommendation}
      </p>
    </div>
  );
}
