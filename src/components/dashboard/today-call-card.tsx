import type { TrainingCall } from "@/lib/training";

/**
 * Hero card on the dashboard. Answers the single question the dashboard
 * exists for: "how hard should I train today?" — Push, Standard, Easy, or
 * Recover.
 *
 * Renders the result of `computeTrainingCall(...)` which integrates the
 * Baseline Score, cycle phase, HRV CV (overreaching), fatigue score, and
 * acute stress into one verdict — so this card and the /body page never
 * disagree.
 *
 * When call is null AND the dashboard is viewing today, render the
 * sync-prompt empty state. Past dates: render nothing (parent gates).
 */

const STYLES = {
  green: {
    border: "border-[color-mix(in_srgb,var(--color-green)_35%,transparent)]",
    bg: "bg-[color-mix(in_srgb,var(--color-green)_10%,var(--color-surface-2))]",
    text: "text-[var(--color-green)]",
    dot: "bg-[var(--color-green)]",
    dotRing:
      "shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-green)_25%,transparent)]",
    glow: "shadow-[0_0_24px_color-mix(in_srgb,var(--color-green)_18%,transparent)]",
  },
  yellow: {
    border: "border-[color-mix(in_srgb,var(--color-yellow)_35%,transparent)]",
    bg: "bg-[color-mix(in_srgb,var(--color-yellow)_10%,var(--color-surface-2))]",
    text: "text-[var(--color-yellow)]",
    dot: "bg-[var(--color-yellow)]",
    dotRing:
      "shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-yellow)_25%,transparent)]",
    glow: "shadow-[0_0_24px_color-mix(in_srgb,var(--color-yellow)_18%,transparent)]",
  },
  red: {
    border: "border-[color-mix(in_srgb,var(--color-red)_35%,transparent)]",
    bg: "bg-[color-mix(in_srgb,var(--color-red)_10%,var(--color-surface-2))]",
    text: "text-[var(--color-red)]",
    dot: "bg-[var(--color-red)]",
    dotRing:
      "shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-red)_25%,transparent)]",
    glow: "shadow-[0_0_24px_color-mix(in_srgb,var(--color-red)_18%,transparent)]",
  },
};

export function TodayCallCard({
  call,
  isConnected,
}: {
  call: TrainingCall | null;
  isConnected: boolean;
}) {
  if (!call) {
    return (
      <div className="card-enter panel p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Today&apos;s call
        </p>
        <p className="mt-3 text-[var(--color-text-muted)]">
          {isConnected
            ? "Sync to see today's call."
            : "Connect your Oura ring to see today's call."}
        </p>
        {!isConnected && (
          <a
            href="/api/auth/oura"
            className="mt-4 inline-block bg-white/10 px-4 py-2 text-sm font-medium transition duration-150 ease-out-strong hover:bg-white/20 active:scale-[0.97]"
          >
            Connect Oura
          </a>
        )}
      </div>
    );
  }

  const s = STYLES[call.color];

  return (
    <div
      className={`card-enter border ${s.border} ${s.bg} p-8 ${s.glow}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Today&apos;s call
        </p>
        <span
          className={`h-2 w-2 rounded-full ${s.dot} ${s.dotRing}`}
          aria-hidden="true"
        />
      </div>
      <p
        className={`mt-2 text-4xl font-bold leading-none tracking-tight sm:text-6xl ${s.text}`}
      >
        {call.verdict}
      </p>
      <p className="mt-5 text-base leading-relaxed text-[var(--color-text)]">
        {call.whyLine}
      </p>
      <p className={`mt-1 text-sm leading-relaxed ${s.text}`}>
        {call.actionLine}
      </p>
      <a
        href="/body"
        className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-muted)] transition duration-150 ease-out-strong hover:text-[var(--color-text)] active:scale-[0.97]"
      >
        See full training breakdown
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 6h6M6 3l3 3-3 3" />
        </svg>
      </a>
    </div>
  );
}
