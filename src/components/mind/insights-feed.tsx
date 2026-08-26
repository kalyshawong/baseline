"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CollectingTag, Insight, InsightMetric } from "@/lib/insights";
import type { TestedFinding } from "@/lib/tested-findings";
import type { HrvCvCalibration } from "@/lib/training-call";

/**
 * Findings feed — implements "Baseline Findings Redesign.html" (2026-08-26),
 * which supersedes the old correlation feed. Principles (baseline-audit.md):
 *
 *  - Cards are DESCRIPTIONS of the past, never verdicts. No causal copy,
 *    no "keep it up".
 *  - Display numbers are raw MEDIANS (outlier-resistant); the stats behind
 *    them ran on detrended, cycle-adjusted residuals with dual (mean+rank)
 *    agreement and FDR correction — surfaced as visible rigor chips.
 *  - The only CTA that changes behavior is "Test this →" (a randomized
 *    experiment). "Archive" hides a card; nothing is deleted.
 *  - Tags below the 14-day evidence floor render as "Collecting" progress
 *    cards — never as claims.
 */

const tierToPill: Record<string, string> = {
  significant: "pill pill-g",
  suggestive: "pill pill-a",
  watching: "pill pill-muted",
};

type Filter = "all" | "patterns" | "collecting" | "tested";

/** Mean paired difference in display units (redesign tested-card headline). */
function testedDelta(t: TestedFinding): string | null {
  if (t.meanDiff == null) return null;
  const d = t.meanDiff;
  const sign = d >= 0 ? "+" : "−";
  if (t.metric === "totalSleepDuration") return `${sign}${Math.round(Math.abs(d) / 60)} min`;
  if (t.metric === "lowestHeartRate") return `${sign}${Math.abs(Math.round(d * 10) / 10)} bpm`;
  if (t.metric === "hrvVsBaseline") return `${sign}${Math.abs(Math.round(d * 10) / 10)} ms`;
  if (t.metric === "temperatureDeviation") return `${sign}${Math.abs(Math.round(d * 100) / 100)}°C`;
  return `${sign}${Math.abs(Math.round(d * 10) / 10)}`;
}

function testedHeadline(t: TestedFinding): { title: React.ReactNode; body: string } {
  const delta = testedDelta(t);
  const felt =
    t.feltDelta == null
      ? "Felt ratings weren't logged."
      : `You rated test blocks ${t.feltDelta > 0 ? "+" : ""}${t.feltDelta} pts vs usual.`;
  const repNote =
    t.replicationOf != null
      ? "This was the replication run."
      : t.replicationStatus === "confirmed"
        ? "Replicated — Coach now uses this as a rule."
        : t.replicationStatus === "running"
          ? "Replication in progress — not a rule until it holds."
          : t.replicationStatus === "not_confirmed"
            ? "The replication didn't confirm it — no rule. One-off effects happen."
            : "One replication before this becomes a Coach rule.";
  switch (t.decision) {
    case "effect_found":
      return {
        title: (
          <>
            &ldquo;{t.label}&rdquo; moved your {t.outcomeLabel}
            {delta && <em className="not-italic text-[var(--color-green)]"> {delta}.</em>}
          </>
        ),
        body: `Randomized ${t.pairsUsed}-pair run. P(effect > worthwhile) = ${Math.round(t.pEffectGtSWC * 100)}%. ${felt} ${repNote}`,
      };
    case "no_effect_at_mde":
      return {
        title: (
          <>
            &ldquo;{t.label}&rdquo;: <em className="not-italic text-[var(--color-green)]">no effect</em> your test could see.
          </>
        ),
        body: `Randomized ${t.pairsUsed}-pair run. P(effect > worthwhile) = ${Math.round(t.pEffectGtSWC * 100)}%. ${felt} A real answer — you can stop wondering about this one at this size.`,
      };
    case "inconclusive_low_adherence":
      return {
        title: <>&ldquo;{t.label}&rdquo;: too few completed days to call.</>,
        body: `Only ${t.pairsUsed} usable pairs of ${t.blocks}. Rerun with better adherence, or let it go.`,
      };
    default:
      return {
        title: <>&ldquo;{t.label}&rdquo;: inconclusive.</>,
        body: `Randomized ${t.pairsUsed}-pair run. P(effect > worthwhile) = ${Math.round(t.pEffectGtSWC * 100)}%. ${felt} The effect, if any, sits below what this design could resolve.`,
      };
  }
}

/** Tested result card (redesign .fcard.tested — green border, verdict copy). */
function TestedCard({ t }: { t: TestedFinding }) {
  const router = useRouter();
  const [replicating, setReplicating] = useState(false);
  const { title, body } = testedHeadline(t);
  const measuredPositive = t.decision === "effect_found";
  const feltPositive = t.feltDelta != null && t.feltDelta > 0;
  const agree = t.feltDelta != null && measuredPositive === feltPositive;

  async function startReplication() {
    setReplicating(true);
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replicationOf: t.id }),
      });
      if (res.ok) {
        const exp = await res.json();
        router.push(`/mind/experiments/${exp.id}`);
      } else {
        setReplicating(false);
      }
    } catch {
      setReplicating(false);
    }
  }

  return (
    <div
      className="flex flex-col bg-[var(--color-surface)] p-[20px_22px]"
      style={{ borderLeft: "4px solid var(--color-green)", boxShadow: "inset 0 1px 0 oklch(1 0 0/.05), 0 12px 30px -16px #000" }}
    >
      <div className="mb-[11px] flex items-center gap-[11px]">
        <span
          className="px-3 py-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] angled-clip"
          style={{ background: "var(--color-green)", color: "var(--color-bg)" }}
        >
          Tested ✓
        </span>
        <span className="text-[11.5px] font-bold tracking-[0.04em] text-[var(--color-faint)]">
          {t.label} → {t.outcomeLabel}
          {t.replicationOf != null && " · replication"}
        </span>
      </div>
      <h3 className="disp text-[25px] leading-[0.95]">{title}</h3>
      <p className="mt-[9px] flex-1 text-[12.5px] leading-[1.55] text-[var(--color-text-muted)]">{body}</p>
      <p className="num mt-[11px] text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-faint)]">
        Randomized · {t.blocks} pairs · p {t.randTestP < 0.001 ? "<0.001" : t.randTestP}
        {t.feltDelta != null && ` · measured + felt ${agree ? "agree" : "disagree"}`}
        {t.replicationStatus === "confirmed" && (
          <b className="text-[var(--color-green)]"> · replicated ✓ · coach rule</b>
        )}
        {t.source === "diagnose" && " · from Diagnose"}
      </p>
      <div className="mt-[14px] flex gap-2">
        {t.replicationStatus === "none" && (
          <button
            type="button"
            disabled={replicating}
            onClick={startReplication}
            className="cursor-pointer border-none px-[14px] py-[9px] text-[11px] font-extrabold uppercase tracking-[0.07em] angled-clip disabled:opacity-50"
            style={{ background: "var(--color-green)", color: "var(--color-bg)" }}
          >
            {replicating ? "Scheduling…" : "Run replication →"}
          </button>
        )}
        {t.href && (
          <a
            href={t.href}
            className="inline-block bg-[var(--color-surface-2)] px-[14px] py-[9px] text-[11px] font-extrabold uppercase tracking-[0.07em] text-[var(--color-text-muted)]"
          >
            View result
          </a>
        )}
      </div>
    </div>
  );
}

/** AUDIT §2.1.5: no p-value is zero — floor the display at <0.001. */
function fmtP(p: number | undefined | null): string {
  if (p == null) return "—";
  return p < 0.001 ? "q<0.001" : `q=${p}`;
}

function formatMetricValue(value: number, metric: string): string {
  if (metric === "totalSleepDuration") {
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (metric === "lowestHeartRate") return `${Math.round(value)} bpm`;
  if (metric === "hrvVsBaseline") return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10} ms`;
  if (metric === "temperatureDeviation") return `${value > 0 ? "+" : ""}${Math.round(value * 100) / 100}°C`;
  return String(Math.round(value));
}

function deltaLabel(m: InsightMetric): string {
  const diff = m.taggedMedian - m.untaggedMedian;
  if (m.metric === "totalSleepDuration") {
    const min = Math.round(Math.abs(diff) / 60);
    return `${diff >= 0 ? "+" : "−"}${min}m`;
  }
  if (m.metric === "hrvVsBaseline" || m.metric === "temperatureDeviation" || m.metric === "lowestHeartRate") {
    return `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round(diff * 10) / 10)}`;
  }
  return `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round(diff))}`;
}

function testThisHref(insight: Insight): string {
  const m = insight.metrics[0];
  const params = new URLSearchParams({
    title: `Does "${insight.tag}" move my ${m?.metricLabel ?? "metrics"}?`,
    hypothesis: `On days with "${insight.tag}" my ${m?.metricLabel ?? "outcome"} runs ${insight.direction}. Randomizing will tell whether the tag drives it.`,
    independentVariable: insight.tag,
    dependentVariable: m?.metricLabel ?? "",
    dependentMetric: m?.metric ?? "",
  });
  return `/mind/experiments/new?${params.toString()}`;
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
            {saving ? "Saving..." : personalized ? "Switch to standard" : "Recalibrate to me"}
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
        Your overnight HRV averages <span className="font-medium text-[var(--color-text)]">~{c.hrvMeanMs} ms</span>
        {" "}&mdash; below the typical adult range (~30-60 ms). A real pattern in your data, not a glitch.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3">
        <span className="text-xs font-medium text-[var(--color-text)]">Recalibrate to your baseline?</span>
        <div className="ml-auto flex gap-2">
          <button type="button" disabled={saving != null} onClick={() => choose("personalized")}
            className="border border-[var(--color-border)] bg-white/10 px-3 py-1 text-xs font-medium transition hover:bg-white/20 disabled:opacity-50">
            {saving === "personalized" ? "Saving..." : "Confirm"}
          </button>
          <button type="button" disabled={saving != null} onClick={() => choose("standard")}
            className="px-3 py-1 text-xs text-[var(--color-text-muted)] transition hover:text-[var(--color-text)] disabled:opacity-50">
            {saving === "standard" ? "Saving..." : "Keep standard"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Rigor chips row (redesign .checks). */
function Checks({ items }: { items: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-[7px]">
      {items.map((c) => (
        <span key={c} className="inline-flex items-center gap-[7px] bg-[var(--color-surface-2)] px-[11px] py-[6px] text-[11px] font-bold tracking-[0.03em] text-[var(--color-text-muted)]">
          <span className="font-extrabold text-[var(--color-green)]">✓</span>
          {c}
        </span>
      ))}
    </div>
  );
}

/** "What else differed" confounder bundle (redesign .bundle). */
function Bundle({ tag, lines }: { tag: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="mt-[18px] max-w-[560px] border border-[var(--color-border)] p-[16px_18px]"
      style={{ borderLeft: "4px solid var(--color-yellow)", background: "color-mix(in oklch, var(--color-yellow), var(--color-surface) 92%)" }}>
      <p className="mb-[9px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-yellow)]">
        ⚠ What else differed on those days
      </p>
      <p className="text-[13px] leading-[1.55] text-[var(--color-text-muted)]">
        &ldquo;{tag}&rdquo; days bundle other habits — any of these could carry the difference:
      </p>
      <ul className="mt-[9px] flex flex-col gap-[5px]">
        {lines.map((l) => (
          <li key={l} className="flex items-baseline gap-[9px] text-[12.5px] text-[var(--color-text-muted)]">
            <span className="flex-none text-[var(--color-yellow)]">▸</span>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function InsightsFeed({
  insights,
  collecting = [],
  tested = [],
  calibration,
}: {
  insights: Insight[];
  collecting?: CollectingTag[];
  tested?: TestedFinding[];
  calibration?: HrvCvCalibration | null;
}) {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  // Per-finding archive (localStorage), carried over from the previous feed.
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("bl_hidden_findings") ?? "[]");
      if (Array.isArray(v)) setHiddenTags(v.filter((x) => typeof x === "string"));
    } catch { /* ignore */ }
  }, []);
  function toggleHide(tag: string) {
    setHiddenTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      try { localStorage.setItem("bl_hidden_findings", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }
  const isHidden = (tag: string) => hiddenTags.includes(tag);
  const pool = showHidden ? insights : insights.filter((i) => !isHidden(i.tag));

  const counts = {
    all: pool.length + collecting.length + tested.length,
    patterns: pool.length,
    collecting: collecting.length,
    tested: tested.length,
  };
  const showPatterns = activeFilter === "all" || activeFilter === "patterns";
  const showCollecting = activeFilter === "all" || activeFilter === "collecting";
  const showTested = activeFilter === "all" || activeFilter === "tested";

  if (insights.length === 0 && collecting.length === 0 && tested.length === 0) {
    return (
      <div>
        {calibration && <CalibrationCard c={calibration} />}
        <div className="empty-state">
          <p className="text-sm">
            Keep tagging — a pattern needs at least 14 logged days on each side
            before it earns a card. Nothing is shown before then, because a few
            days of noise can fake a large swing.
          </p>
        </div>
      </div>
    );
  }

  const featured = showPatterns ? pool[0] : undefined;
  const rest = showPatterns ? pool.slice(1) : [];

  return (
    <div>
      {calibration && <CalibrationCard c={calibration} />}

      {/* Sub head — the redesign's framing line */}
      <p className="mb-[14px] text-[13px] text-[var(--color-text-muted)]">
        Patterns your data noticed — <b className="text-[var(--color-gold)]">descriptions of your past, not verdicts.</b>{" "}
        Every card stays a hypothesis until you test it.
      </p>

      {/* Filter bar */}
      <div className="mb-[14px] flex flex-wrap items-center justify-between gap-[10px]">
        <div className="flex gap-[7px]">
          {([
            ["all", "All"],
            ["patterns", "Patterns"],
            ["collecting", "Collecting"],
            ...(tested.length > 0 ? ([["tested", "Tested"]] as [Filter, string][]) : []),
          ] as [Filter, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveFilter(id)}
              className="inline-flex cursor-pointer items-center gap-[6px] border-none px-3 py-[7px] text-[11px] font-bold uppercase tracking-[0.04em]"
              style={{
                background: activeFilter === id ? "var(--color-gold)" : "var(--color-surface-2)",
                color: activeFilter === id ? "var(--color-bg)" : "var(--color-text-muted)",
              }}
            >
              {label}
              <span style={{ opacity: 0.7 }}>{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="text-xs font-semibold text-[var(--color-text-muted)]">
          Sort: <b className="text-[var(--color-text)]">Pattern strength</b>
        </div>
      </div>

      {/* ── Featured pattern (redesign .ffeat) ── */}
      {featured && <FeaturedFinding insight={featured} hidden={isHidden(featured.tag)} onToggleHide={() => toggleHide(featured.tag)} />}

      {/* ── Smaller pattern cards ── */}
      {rest.length > 0 && (
        <div className="mt-[14px] grid grid-cols-1 gap-[14px] md:grid-cols-2">
          {rest.map((insight) => {
            const m = insight.metrics[0];
            return (
              <div key={`${insight.tag}-${insight.direction}`}
                className="flex flex-col bg-[var(--color-surface)] p-[20px_22px]"
                style={{ borderLeft: "4px solid var(--color-gold)", boxShadow: "inset 0 1px 0 oklch(1 0 0/.05), 0 12px 30px -16px #000" }}>
                <div className="mb-[11px] flex items-center gap-[11px]">
                  <span className="px-3 py-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] angled-clip"
                    style={{ background: "var(--color-gold)", color: "var(--color-bg)" }}>Pattern</span>
                  <span className={tierToPill[insight.significance]}>{insight.significance === "significant" ? "Strong" : insight.significance === "suggestive" ? "Moderate" : "Weak"}</span>
                </div>
                <h3 className="disp text-[25px] leading-[0.95]">
                  Days with <em className="not-italic text-[var(--color-gold)]">&ldquo;{insight.tag}&rdquo;</em>:{" "}
                  {m ? `${deltaLabel(m)} ${m.metricLabel}` : insight.direction}
                </h3>
                <p className="mt-[9px] flex-1 text-[12.5px] leading-[1.55] text-[var(--color-text-muted)]">
                  {insight.recommendation}
                </p>
                {m && (
                  <p className="num mt-[11px] text-[11px] font-semibold tracking-[0.02em] text-[var(--color-faint)]">
                    {formatMetricValue(m.taggedMedian, m.metric)} vs {formatMetricValue(m.untaggedMedian, m.metric)} (medians) · {fmtP(m.pValue)} · n={insight.taggedN} vs {insight.untaggedN}
                  </p>
                )}
                <div className="mt-[14px] flex gap-2">
                  <a href={testThisHref(insight)}
                    className="px-[14px] py-[9px] text-[11px] font-extrabold uppercase tracking-[0.07em] angled-clip"
                    style={{ background: "var(--color-gold)", color: "var(--color-bg)" }}>
                    Test this →
                  </a>
                  <button type="button" onClick={() => toggleHide(insight.tag)}
                    className="bg-[var(--color-surface-2)] px-[14px] py-[9px] text-[11px] font-extrabold uppercase tracking-[0.07em] text-[var(--color-text-muted)]">
                    {isHidden(insight.tag) ? "Unarchive" : "Archive"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tested result cards (redesign .fcard.tested) ── */}
      {showTested && tested.length > 0 && (
        <div className="mt-[14px] grid grid-cols-1 gap-[14px] md:grid-cols-2">
          {tested.map((t) => (
            <TestedCard key={t.id} t={t} />
          ))}
        </div>
      )}

      {/* ── Collecting cards (redesign .fcard.collect) ── */}
      {showCollecting && collecting.length > 0 && (
        <div className="mt-[14px] grid grid-cols-1 gap-[14px] md:grid-cols-3">
          {collecting.map((c) => (
            <div key={c.tag} className="bg-[var(--color-surface)] p-[20px_22px]"
              style={{ borderLeft: "4px solid var(--color-faint, var(--color-text-muted))", boxShadow: "inset 0 1px 0 oklch(1 0 0/.05), 0 12px 30px -16px #000" }}>
              <div className="mb-[11px] flex items-center gap-[11px]">
                <span className="bg-[var(--color-surface-2)] px-3 py-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Collecting</span>
                <span className="text-[11.5px] font-bold tracking-[0.04em] text-[var(--color-faint)]">{c.tag}</span>
              </div>
              <h3 className="disp text-[25px] leading-[0.95]">Too early to say.</h3>
              <p className="mt-[9px] text-[12.5px] leading-[1.55] text-[var(--color-text-muted)]">
                {c.have} logged day{c.have === 1 ? "" : "s"} so far — a pattern needs at least <b className="text-[var(--color-text)]">{c.need} on each side</b> before it earns a card.
              </p>
              <div className="mt-3">
                <div className="relative h-[6px] bg-[var(--color-surface-2)]">
                  <i className="absolute inset-y-0 left-0 block bg-[var(--color-text-muted)]" style={{ width: `${Math.min(100, (c.have / c.need) * 100)}%` }} />
                </div>
                <p className="mt-[6px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--color-faint)]">
                  {c.have} / {c.need} days logged
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {hiddenTags.length > 0 && (
        <button type="button" onClick={() => setShowHidden((v) => !v)}
          className="mt-3 w-full cursor-pointer border-none bg-transparent py-2 text-center text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-faint)] hover:text-[var(--color-text)]">
          {showHidden ? "Conceal archived" : `${hiddenTags.length} archived · show`}
        </button>
      )}

      {/* Context strip (redesign .testflow): partner presence, travel and the
          like are CONTEXTS — balanced and forecast-adjusted, never proposed
          as experiments, because you won't (and shouldn't have to) randomize
          your life. */}
      <div className="mt-[14px] grid grid-cols-1 gap-[18px] bg-[var(--color-surface)] p-[20px_22px] md:grid-cols-2"
        style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0/.05), 0 12px 30px -16px #000" }}>
        <div>
          <p className="mb-[7px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-gold)]">
            Context, everywhere
          </p>
          <p className="text-[12.5px] leading-[1.55] text-[var(--color-text-muted)]">
            Things you won&apos;t randomize — a partner staying over, travel, a visit week — are treated{" "}
            <b className="text-[var(--color-text)]">like your cycle phase</b>: a context, never an intervention.
            Findings and experiments are balanced across them, so &ldquo;he was here&rdquo; can&apos;t masquerade
            as a supplement effect.
          </p>
        </div>
        <div>
          <p className="mb-[7px] text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[var(--color-gold)]">
            Forecast, not verdict
          </p>
          <p className="text-[12.5px] leading-[1.55] text-[var(--color-text-muted)]">
            When a context has a measured pattern, it becomes an{" "}
            <b className="text-[var(--color-text)]">adjusted expectation</b> for those days — and Coach can flag a
            collision (a visit landing on a taper week) <b className="text-[var(--color-text)]">before</b> it
            happens. No behavior change asked of you.
          </p>
        </div>
      </div>

      {/* Method footer (redesign .foot) */}
      <p className="mt-4 max-w-[900px] border-t border-[var(--color-border)] pt-4 text-[12px] leading-[1.6] text-[var(--color-faint)]">
        <b className="text-[var(--color-text-muted)]">How Findings works:</b> cards describe your logged past using medians
        and rank statistics, detrending, cycle-phase adjustment, and false-discovery correction across everything tested —
        on logged days within each tag&apos;s tracking era only. Outcomes are limited to device-reliable metrics; sleep-stage
        minutes are never used as evidence. No card claims cause and effect — the only path from a pattern to a rule is a
        randomized test.
      </p>
    </div>
  );
}

/** Featured pattern hero (redesign .ffeat). */
function FeaturedFinding({
  insight,
  hidden,
  onToggleHide,
}: {
  insight: Insight;
  hidden?: boolean;
  onToggleHide?: () => void;
}) {
  const m = insight.metrics[0];
  if (!m) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_300px]"
      style={{
        borderLeft: "5px solid var(--color-gold)",
        background: "var(--color-surface)",
        backgroundImage: "linear-gradient(150deg, color-mix(in oklch, var(--color-gold), transparent 86%), transparent 55%)",
        boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 12px 30px -16px #000",
      }}>
      {/* Left */}
      <div className="p-[24px_26px]">
        <div className="mb-[14px] flex items-center gap-[11px]">
          <span className="px-3 py-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.14em] angled-clip"
            style={{ background: "var(--color-gold)", color: "var(--color-bg)" }}>Pattern</span>
          <span className="text-[11.5px] font-bold tracking-[0.04em] text-[var(--color-faint)]">
            &ldquo;{insight.tag}&rdquo; · vs · {insight.controlLabel}
          </span>
          {onToggleHide && (
            <button type="button" onClick={onToggleHide}
              className="ml-auto cursor-pointer border-none bg-transparent text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-faint)] hover:text-[var(--color-text)]">
              {hidden ? "Unarchive" : "Archive"}
            </button>
          )}
        </div>
        <h2 className="disp max-w-[520px] text-[42px] leading-[0.9] tracking-[0.01em]">
          On &ldquo;{insight.tag}&rdquo; days, {m.metricLabel} ran{" "}
          <em className="not-italic text-[var(--color-gold)]">{deltaLabel(m)} ({insight.direction}).</em>
        </h2>
        <p className="mt-[13px] max-w-[520px] text-[14px] leading-[1.55] text-[var(--color-text-muted)]">
          Across <b className="text-[var(--color-text)]">{insight.taggedN} tagged vs {insight.untaggedN} control days</b>,
          your median {m.metricLabel} was{" "}
          <b className="text-[var(--color-text)]">{formatMetricValue(m.taggedMedian, m.metric)} vs {formatMetricValue(m.untaggedMedian, m.metric)}</b>.
          {" "}That&apos;s a fact about your past — it doesn&apos;t yet say the tag is the reason.
        </p>

        <Checks items={insight.checks} />
        <Bundle tag={insight.tag} lines={insight.confounders} />
      </div>

      {/* Right stat block */}
      <div className="flex flex-col justify-center p-[24px]"
        style={{ background: "var(--color-gold)", color: "var(--color-bg)", boxShadow: "0 0 46px -14px var(--color-gold)" }}>
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] opacity-70">
          {m.metricLabel} · median
        </p>
        <p className="disp num mb-0 mt-1 text-[76px] leading-[0.8]">{deltaLabel(m)}</p>
        <p className="num text-[13px] font-semibold opacity-85">
          {formatMetricValue(m.taggedMedian, m.metric)} vs {formatMetricValue(m.untaggedMedian, m.metric)}
        </p>
        <p className="mt-3 text-[11px] font-semibold leading-[1.5] opacity-60">
          Outcome: {m.metricLabel} (device-reliable). Sleep stages excluded — stage error exceeds effects this size. {fmtP(m.pValue)}.
        </p>
        <div className="mt-[18px] flex flex-col gap-2">
          <a href={testThisHref(insight)}
            className="px-[18px] py-3 text-center text-[12.5px] font-extrabold uppercase tracking-[0.08em] angled-clip"
            style={{ background: "var(--color-bg)", color: "var(--color-gold)" }}>
            Test this →
          </a>
        </div>
      </div>
    </div>
  );
}
