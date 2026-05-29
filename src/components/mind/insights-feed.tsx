"use client";

import { useState } from "react";
import type { Insight, InsightMetric } from "@/lib/insights";

const tierToCard: Record<string, string> = {
  significant: "insight-card insight-card-g",
  suggestive: "insight-card insight-card-a",
  watching: "insight-card insight-card-muted",
};

const tierToPill: Record<string, string> = {
  significant: "pill pill-g",
  suggestive: "pill pill-a",
  watching: "pill pill-muted",
};

const tierLabel: Record<string, string> = {
  significant: "Strong",
  suggestive: "Trend",
  watching: "Watching",
};

type Filter = "all" | "significant" | "suggestive" | "watching";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "significant", label: "Strong" },
  { id: "suggestive", label: "Trends" },
  { id: "watching", label: "Watching" },
];

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

function MetricLine({ m }: { m: InsightMetric }) {
  return (
    <span className="text-sm">
      {m.metricLabel}{" "}
      <span className="disp num text-[22px] leading-none">
        {formatMetricValue(m.taggedMean, m.metric)}
      </span>
      {" "}vs{" "}
      <span className="disp num text-[22px] leading-none">
        {formatMetricValue(m.untaggedMean, m.metric)}
      </span>
      {" "}
      <span className="text-[var(--color-text-muted)] text-xs">
        ({m.percentDiff}%, p={m.pValue})
      </span>
    </span>
  );
}

export function InsightsFeed({ insights }: { insights: Insight[] }) {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const filtered =
    activeFilter === "all"
      ? insights
      : insights.filter((i) => i.significance === activeFilter);

  if (insights.length === 0) {
    return (
      <div>
        <div className="empty-state">
          <p className="text-sm">
            Keep tagging activities — insights will appear once patterns emerge
            (5+ tags of the same type needed).
          </p>
        </div>
      </div>
    );
  }

  // Pick the top finding for the featured slot
  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`tagchip ${activeFilter === f.id ? "on" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">
          No insights match this filter yet.
        </p>
      )}

      {/* Featured top finding */}
      {featured && (
        <div className={`${tierToCard[featured.significance]} mb-4`}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">
              Days with <span className="font-semibold">&ldquo;{featured.tag}&rdquo;</span>:{" "}
              {featured.direction}
            </p>
            <span className={tierToPill[featured.significance]}>
              {tierLabel[featured.significance]}
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {featured.metrics.map((m) => (
              <li key={m.metric}>
                <MetricLine m={m} />
              </li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-[var(--color-text-muted)]">
            n={featured.taggedN} tagged vs n={featured.untaggedN}{" "}
            <span className="italic">{featured.controlLabel}</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {featured.recommendation}
          </p>
        </div>
      )}

      {/* 2-column grid of remaining cards */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rest.map((insight) => (
            <div
              key={`${insight.tag}-${insight.direction}`}
              className={tierToCard[insight.significance]}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">
                  <span className="font-semibold">&ldquo;{insight.tag}&rdquo;</span>:{" "}
                  {insight.direction}
                </p>
                <span className={tierToPill[insight.significance]}>
                  {tierLabel[insight.significance]}
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {insight.metrics.map((m) => (
                  <li key={m.metric}>
                    <MetricLine m={m} />
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-xs text-[var(--color-text-muted)]">
                n={insight.taggedN} vs n={insight.untaggedN}{" "}
                <span className="italic">{insight.controlLabel}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                {insight.recommendation}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Show archived link */}
      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="linklike"
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-[var(--color-text-muted)]">
        Correlations are personal observations, not medical advice. Limited sample sizes
        mean these should be treated as hypotheses.
      </p>
    </div>
  );
}
