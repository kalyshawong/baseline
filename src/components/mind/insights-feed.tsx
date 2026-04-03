import type { Insight } from "@/lib/insights";

const sigStyles: Record<string, string> = {
  significant: "border-emerald-500/30 bg-emerald-500/5",
  suggestive: "border-yellow-500/30 bg-yellow-500/5",
  not_significant: "border-[var(--color-border)] bg-[var(--color-surface)]",
};

const sigBadge: Record<string, string> = {
  significant: "bg-emerald-500/20 text-emerald-400",
  suggestive: "bg-yellow-500/20 text-yellow-400",
  not_significant: "bg-neutral-500/20 text-neutral-400",
};

const sigLabel: Record<string, string> = {
  significant: "Strong signal",
  suggestive: "Suggestive trend",
  not_significant: "Weak signal",
};

function formatMetricValue(value: number, metric: string): string {
  if (metric === "deepSleepDuration" || metric === "totalSleepDuration" || metric === "remSleepDuration") {
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (metric === "sleepEfficiency") return `${Math.round(value)}%`;
  if (metric === "averageHrv") return `${Math.round(value)} ms`;
  return String(Math.round(value));
}

export function InsightsFeed({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Insights
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Keep tagging activities — insights will appear once patterns emerge
          (5+ tags of the same type needed).
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Insights
      </h2>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div
            key={`${insight.tag}-${insight.metric}-${i}`}
            className={`rounded-2xl border p-5 ${sigStyles[insight.significance]}`}
          >
            {/* Finding */}
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm">
                Days with <span className="font-semibold">&ldquo;{insight.tag}&rdquo;</span>:{" "}
                avg {insight.metricLabel}{" "}
                <span className="font-mono font-semibold">
                  {formatMetricValue(insight.taggedMean, insight.metric)}
                </span>{" "}
                vs without:{" "}
                <span className="font-mono font-semibold">
                  {formatMetricValue(insight.untaggedMean, insight.metric)}
                </span>
              </p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${sigBadge[insight.significance]}`}>
                {sigLabel[insight.significance]}
              </span>
            </div>

            {/* Stats */}
            <div className="mt-2 flex gap-4 text-xs text-[var(--color-text-muted)]">
              <span>
                {insight.percentDiff}% {insight.direction}
              </span>
              <span>p={insight.pValue}</span>
              <span>
                n={insight.taggedN} tagged, {insight.untaggedN} control
              </span>
            </div>

            {/* Recommendation */}
            <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
              {insight.recommendation}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">
        Correlations are personal observations, not medical advice. Limited sample sizes
        mean these should be treated as hypotheses.
      </p>
    </div>
  );
}
