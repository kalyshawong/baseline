"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Insight, InsightMetric } from "@/lib/insights";
import type { HrvCvCalibration } from "@/lib/training-call";

/**
 * Insights feed — filter bar, featured top finding hero, 2-col grid.
 * Design ref: Baseline Mind.html → .findbar, .ffeat, .findgrid
 */

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

const filterDefs: { id: Filter; label: string }[] = [
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
    <div className="mt-[11px]">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--color-faint)]">
        {m.metricLabel}
      </span>
      {" "}
      <span className="disp num text-[26px] leading-none text-[var(--color-text)]">
        {formatMetricValue(m.taggedMean, m.metric)}
      </span>
      {" "}
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
        vs
      </span>
      {" "}
      <span className="disp num text-[26px] leading-none">
        {formatMetricValue(m.untaggedMean, m.metric)}
      </span>
    </div>
  );
}

function CalibrationCard({ c }: { c: HrvCvCalibration }) {
  const router = useRouter();
  const [saving, setSaving] = useState<null | "personalized" | "standard">(null);

  async function choose(choice: "personalized" | "standard") {
    setSaving(choice);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hrvBaselineChoice: choice }),
      });
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  if (c.choice !== "pending") {
    const personalized = c.choice === "personalized";
    return (
      <div className="insight-card insight-card-muted mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {personalized
              ? "Overtraining warning is tuned to you"
              : "Using the standard overtraining warning"}
          </p>
          <button
            type="button"
            disabled={saving != null}
            onClick={() => choose(personalized ? "standard" : "personalized")}
            className="text-xs text-[var(--color-text-muted)] underline-offset-2 transition duration-150 hover:text-[var(--color-text)] disabled:opacity-50"
          >
            {saving
              ? "Saving..."
              : personalized
                ? "Switch to standard"
                : "Recalibrate to me"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="insight-card insight-card-a mb-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">Your HRV runs low — want me to recalibrate?</p>
        <span className="pill pill-muted">Finding</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text)]">Finding:</span> your
        overnight HRV averages{" "}
        <span className="font-medium text-[var(--color-text)]">~{c.hrvMeanMs} ms</span>
        {" "}&mdash; that&apos;s below the typical adult range (~30-60 ms). A real
        pattern in your data, not a glitch.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        The standard overtraining warning trips almost every night. I&apos;d retune
        it to your baseline so it only speaks up when your HRV is unusually jumpy{" "}
        <span className="font-medium text-[var(--color-text)]">for you</span>.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
        <span className="text-xs font-medium text-[var(--color-text)]">
          Recalibrate to your baseline?
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={saving != null}
            onClick={() => choose("personalized")}
            className="border border-[var(--color-border)] bg-white/10 px-3 py-1 text-xs font-medium transition hover:bg-white/20 disabled:opacity-50"
          >
            {saving === "personalized" ? "Saving..." : "Confirm"}
          </button>
          <button
            type="button"
            disabled={saving != null}
            onClick={() => choose("standard")}
            className="px-3 py-1 text-xs text-[var(--color-text-muted)] transition hover:text-[var(--color-text)] disabled:opacity-50"
          >
            {saving === "standard" ? "Saving..." : "Deny - keep standard"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InsightsFeed({
  insights,
  calibration,
}: {
  insights: Insight[];
  calibration?: HrvCvCalibration | null;
}) {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [showArchived, setShowArchived] = useState(false);

  const counts = {
    all: insights.length,
    significant: insights.filter((i) => i.significance === "significant").length,
    suggestive: insights.filter((i) => i.significance === "suggestive").length,
    watching: insights.filter((i) => i.significance === "watching").length,
  };

  const filtered =
    activeFilter === "all"
      ? insights
      : insights.filter((i) => i.significance === activeFilter);

  if (insights.length === 0) {
    return (
      <div>
        {calibration && <CalibrationCard c={calibration} />}
        <div className="empty-state">
          <p className="text-sm">
            Keep tagging activities — insights will appear once patterns emerge
            (5+ tags of the same type needed).
          </p>
        </div>
      </div>
    );
  }

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div>
      {calibration && <CalibrationCard c={calibration} />}

      {/* Filter bar — design: .findbar */}
      <div className="flex items-center justify-between flex-wrap gap-[10px] mb-[14px]">
        <div className="flex gap-[7px]">
          {filterDefs.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className="text-[11px] font-bold uppercase tracking-[0.04em] px-3 py-[7px] inline-flex items-center gap-[6px] cursor-pointer border-none"
              style={{
                background: activeFilter === f.id ? "var(--color-gold)" : "var(--color-surface-2)",
                color: activeFilter === f.id ? "var(--color-bg)" : "var(--color-text-muted)",
              }}
            >
              {f.label}
              <span
                style={{
                  color: activeFilter === f.id ? "var(--color-bg)" : "var(--color-faint)",
                  opacity: activeFilter === f.id ? 0.7 : 1,
                }}
              >
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>
        <div className="text-xs font-semibold text-[var(--color-text-muted)] flex items-center gap-[7px]">
          Sort: <b className="text-[var(--color-text)]">Strength</b>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">
          No insights match this filter yet.
        </p>
      )}

      {/* Featured top finding — design: .ffeat */}
      {featured && (
        <FeaturedFinding insight={featured} />
      )}

      {/* 2-column grid — design: .findgrid */}
      {rest.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px] mt-[14px]">
          {rest.map((insight) => (
            <div
              key={`${insight.tag}-${insight.direction}`}
              className={`${tierToCard[insight.significance]} p-[20px_22px]`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14px] font-medium">
                  Days with <b>&ldquo;{insight.tag}&rdquo;</b>: {insight.direction}
                </p>
                <span className={tierToPill[insight.significance]}>
                  {tierLabel[insight.significance]}
                </span>
              </div>
              {insight.metrics.map((m) => (
                <MetricLine key={m.metric} m={m} />
              ))}
              <p className="mt-2 text-[11.5px] text-[var(--color-faint)] italic">
                {insight.metrics[0]?.percentDiff}%, p={insight.metrics[0]?.pValue} · n={insight.taggedN} vs {insight.untaggedN}
              </p>
              <p className="mt-2 text-[14px] text-[var(--color-text-muted)]">
                {insight.recommendation}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Show archived — design: .findmore */}
      <button
        type="button"
        onClick={() => setShowArchived((v) => !v)}
        className="mt-[14px] w-full text-center py-[13px] text-[13px] font-semibold text-[var(--color-text-muted)] cursor-pointer transition-colors hover:text-[var(--color-gold)] hover:border-[var(--color-gold)]"
        style={{
          border: "1px dashed var(--color-border)",
          background: "transparent",
        }}
      >
        {showArchived
          ? "Hide archived signals"
          : `Show archived & low-confidence signals (${insights.length}) \u2192`}
      </button>

      <p className="mt-4 text-[12.5px] text-[var(--color-faint)] leading-relaxed">
        Correlations are personal observations, not medical advice &mdash; limited sample sizes
        mean these are hypotheses.
      </p>
    </div>
  );
}

/** Featured top finding hero card — design: .ffeat */
function FeaturedFinding({ insight }: { insight: Insight }) {
  const m = insight.metrics[0];
  if (!m) return null;

  // Compute the delta percentage
  const delta = m.percentDiff;
  const deltaSign = insight.direction === "higher" ? "+" : "-";

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[1fr_232px]"
      style={{
        borderLeft: "5px solid var(--color-green)",
        background: "var(--color-surface)",
        backgroundImage: "linear-gradient(150deg, color-mix(in oklch, var(--color-green), transparent 84%), transparent 55%)",
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 12px 30px -16px #000",
      }}
    >
      {/* Left content */}
      <div className="p-[24px_26px]">
        <div className="flex items-center gap-[11px] mb-3">
          <span className="ov" style={{ color: "var(--color-green)" }}>Top finding</span>
          <span className="pill pill-g">Strong signal</span>
        </div>
        <h2 className="disp text-[42px] leading-[0.88] tracking-[0.01em] max-w-[430px]">
          Days with <em className="not-italic" style={{ color: "var(--color-green)" }}>
            &ldquo;{insight.tag}&rdquo;
          </em>: {insight.direction} {m.metricLabel.toLowerCase()}.
        </h2>
        <p className="mt-[13px] text-[14px] text-[var(--color-text-muted)] max-w-[430px]">
          {insight.recommendation}
        </p>
        <p className="mt-[9px] text-[11.5px] text-[var(--color-faint)] italic">
          n={insight.taggedN} tagged vs n={insight.untaggedN} {insight.controlLabel}
        </p>
      </div>

      {/* Right delta block */}
      <div
        className="flex flex-col justify-center p-[22px_24px]"
        style={{
          background: "var(--color-green)",
          color: "var(--color-bg)",
          boxShadow: "0 0 46px -14px var(--color-green)",
        }}
      >
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] opacity-70">
          {m.metricLabel}
        </p>
        <p className="disp num text-[78px] leading-[0.78] mt-1 mb-0">
          {deltaSign}{Math.abs(delta)}%
        </p>
        <p className="disp num text-[22px] tracking-[0.02em]">
          {formatMetricValue(m.taggedMean, m.metric)}{" "}
          <small
            className="text-[12px] font-bold opacity-70"
            style={{ fontFamily: "var(--font-sans, 'Archivo', system-ui, sans-serif)" }}
          >
            vs {formatMetricValue(m.untaggedMean, m.metric)} · p={m.pValue}
          </small>
        </p>
      </div>
    </div>
  );
}
