"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CollectingTag, Insight } from "@/lib/insights";
import type { TestedFinding } from "@/lib/tested-findings";
import type { HrvCvCalibration } from "@/lib/training-call";
import type { MealGiResult } from "@/lib/meal-gi";
import {
  CalibrationCard,
  FeaturedFinding,
  deltaLabel,
  fmtP,
  formatMetricValue,
  testThisHref,
  testedHeadline,
} from "@/components/mind/insights-feed";

/**
 * Desktop Mind handoff (2026-09-23) — the Findings column: filter chips and the
 * compact "tuned to you" banner, the Tested card as the page's focal point,
 * then patterns / collecting (incl. pre-workout meal → GI) in a 2-up grid, and
 * every explainer folded into "How this works". Same data and actions as
 * InsightsFeed + GiPatternsCard; only the arrangement changed.
 */

type Filter = "all" | "patterns" | "collecting" | "tested";

const TIER: Record<string, [string, string]> = {
  significant: ["pill g", "Strong"],
  suggestive: ["pill a", "Moderate"],
  watching: ["pill muted", "Weak"],
};
const GI_TIER: Record<string, [string, string]> = {
  significant: ["pill g", "Strong"],
  suggestive: ["pill a", "Trend"],
  watching: ["pill muted", "Watching"],
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function MindFindings({
  insights,
  collecting,
  tested,
  calibration,
  mealGi,
  alerts,
}: {
  insights: Insight[];
  collecting: CollectingTag[];
  tested: TestedFinding[];
  calibration: HrvCvCalibration | null;
  mealGi: MealGiResult | null;
  /** Flags + Diagnose: dormant most days, shown under the filter bar when live. */
  alerts?: ReactNode;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [saving, setSaving] = useState(false);

  // Per-finding archive (localStorage), same key as InsightsFeed.
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("bl_hidden_findings") ?? "[]");
      if (Array.isArray(v)) setHiddenTags(v.filter((x) => typeof x === "string"));
    } catch {
      /* ignore */
    }
  }, []);
  function toggleHide(tag: string) {
    setHiddenTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      try {
        localStorage.setItem("bl_hidden_findings", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }
  const isHidden = (tag: string) => hiddenTags.includes(tag);
  const pool = showHidden ? insights : insights.filter((i) => !isHidden(i.tag));

  async function chooseCalibration(choice: "personalized" | "standard") {
    setSaving(true);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hrvBaselineChoice: choice }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const gi = mealGi && mealGi.analyzedSessions > 0 ? mealGi : null;
  const giPatterns = gi && gi.sufficient ? gi.patterns : [];
  const giCollecting = gi && (!gi.sufficient || gi.patterns.length === 0);

  const counts: Record<Filter, number> = {
    patterns: pool.length + giPatterns.length,
    collecting: collecting.length + (giCollecting ? 1 : 0),
    tested: tested.length,
    all: 0,
  };
  counts.all = counts.patterns + counts.collecting + counts.tested;
  const show = (f: Filter) => filter === "all" || filter === f;

  const featured = show("patterns") ? pool[0] : undefined;
  const cards: ReactNode[] = [];
  if (show("patterns")) {
    for (const i of pool.slice(1)) cards.push(<PatternCard key={`p-${i.tag}-${i.direction}`} i={i} hidden={isHidden(i.tag)} onToggle={() => toggleHide(i.tag)} />);
    for (const p of giPatterns) cards.push(<GiPatternCard key={`gi-${p.factor}`} p={p} />);
  }
  if (show("collecting")) {
    for (const c of collecting) cards.push(<CollectingCard key={`c-${c.tag}`} c={c} />);
    if (gi && giCollecting) cards.push(<GiCollectingCard key="gi-c" gi={gi} />);
  }

  const calibrated = calibration && calibration.choice !== "pending";
  const personalized = calibration?.choice === "personalized";

  return (
    <div className="col">
      <div className="colhead">
        Findings
        <span className="r">
          <span className="fsort">
            Sort: <b>Pattern strength</b>
          </span>
        </span>
      </div>

      {calibration && !calibrated && <CalibrationCard c={calibration} />}

      <div className="fbar">
        <div className="ffilters">
          {(
            [
              ["all", "All"],
              ["patterns", "Patterns"],
              ["collecting", "Collecting"],
              ["tested", "Tested"],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={`fchip${filter === id ? " on" : ""}`} onClick={() => setFilter(id)}>
              {label} <span className="ct">{counts[id]}</span>
            </button>
          ))}
        </div>
        {calibrated && (
          <div className="tuned" style={{ padding: "9px 14px", fontSize: 12.5 }}>
            <span className="k">{personalized ? "Tuned to you" : "Standard"}</span>
            Overtraining warning
            <button type="button" disabled={saving} onClick={() => chooseCalibration(personalized ? "standard" : "personalized")}>
              {saving ? "Saving…" : personalized ? "Switch to standard" : "Recalibrate to me"}
            </button>
          </div>
        )}
      </div>

      {alerts}

      {show("tested") && tested.map((t) => <TestedCard key={t.id} t={t} />)}

      {featured && (
        <FeaturedFinding insight={featured} hidden={isHidden(featured.tag)} onToggleHide={() => toggleHide(featured.tag)} />
      )}

      {cards.length > 0 && <div className="fgrid">{cards}</div>}

      {counts.all === 0 && (
        <div className="fc">
          <div className="body" style={{ marginTop: 0 }}>
            Keep tagging — a pattern needs at least 14 logged days on each side before it earns a card. Nothing is
            shown before then, because a few days of noise can fake a large swing.
          </div>
        </div>
      )}

      {hiddenTags.length > 0 && (
        <button type="button" className="archived" onClick={() => setShowHidden((v) => !v)}>
          {showHidden ? "Conceal archived" : `${hiddenTags.length} archived · show`}
        </button>
      )}

      <details className="how">
        <summary>
          <span className="i">i</span>How this works<span className="car">▶</span>
        </summary>
        <div className="in">
          <div className="full">
            Patterns your data noticed — <b>descriptions of your past, not verdicts.</b> Every card stays a hypothesis
            until you test it.
          </div>
          <div>
            <h4>Context, everywhere</h4>
            Things you won&apos;t randomize — a partner staying over, travel, a visit week — are treated{" "}
            <b>like your cycle phase</b>: a context, never an intervention. Findings and experiments are balanced across
            them, so &ldquo;he was here&rdquo; can&apos;t masquerade as a supplement effect.
          </div>
          <div>
            <h4>Forecast, not verdict</h4>
            When a context has a measured pattern, it becomes an <b>adjusted expectation</b> for those days — and Coach
            can flag a collision (a visit landing on a taper week) <b>before</b> it happens. No behavior change asked of
            you.
          </div>
          <div className="full">
            <h4>How Findings works</h4>
            Cards describe your logged past using medians and rank statistics, detrending, cycle-phase adjustment, and
            false-discovery correction across everything tested — on logged days within each tag&apos;s tracking era
            only. Outcomes are limited to device-reliable metrics; sleep-stage minutes are never used as evidence. No card
            claims cause and effect — the only path from a pattern to a rule is a randomized test.
          </div>
          <div className="full">
            Backward analysis — finds suspects, doesn&apos;t prove cause. &ldquo;Test this&rdquo; runs a forward
            experiment to convict one.
          </div>
        </div>
      </details>
    </div>
  );
}

/** The page's focal card (handoff .tested): verdict left, the two numbers right. */
function TestedCard({ t }: { t: TestedFinding }) {
  const router = useRouter();
  const [replicating, setReplicating] = useState(false);
  const { title, body } = testedHeadline(t);
  const measuredPositive = t.decision === "effect_found";
  const agree = t.feltDelta != null && measuredPositive === t.feltDelta > 0;

  async function startReplication() {
    setReplicating(true);
    try {
      const res = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replicationOf: t.id }),
      });
      if (res.ok) router.push(`/mind/experiments/${(await res.json()).id}`);
      else setReplicating(false);
    } catch {
      setReplicating(false);
    }
  }

  return (
    <article className="tested">
      <div className="l">
        <div className="ey">
          <span className="pill g">Tested ✓</span>
          <span className="what">
            {t.label} → {cap(t.outcomeLabel)}
            {t.replicationOf != null && " · replication"}
          </span>
        </div>
        <h2>{title}</h2>
        <div className="body">{body}</div>
        <div className="meta">
          Randomized · {t.blocks} pairs · P {t.randTestP < 0.001 ? "<0.001" : t.randTestP}
          {t.feltDelta != null && ` · Measured + felt ${agree ? "agree" : "disagree"}`}
          {t.replicationStatus === "confirmed" && <b style={{ color: "var(--green)" }}> · Replicated ✓ · coach rule</b>}
          {t.source === "diagnose" && " · from Diagnose"}
        </div>
        <div className="acts">
          {t.href && (
            <Link href={t.href} className="btn ghost">
              View result
            </Link>
          )}
          {t.replicationStatus === "none" && (
            <button type="button" className="btn" disabled={replicating} onClick={startReplication}>
              {replicating ? "Scheduling…" : "Run replication →"}
            </button>
          )}
        </div>
      </div>
      <div className="stats">
        <div className="s">
          <span className="k">P(effect &gt; worthwhile)</span>
          <span className="n num">{Math.round(t.pEffectGtSWC * 100)}%</span>
          <span className="d">Measured {t.outcomeLabel}</span>
        </div>
        <div className="s">
          <span className="k">Felt</span>
          <span className="n w num">
            {t.feltDelta == null ? "—" : `${t.feltDelta > 0 ? "+" : ""}${t.feltDelta}`}
            {t.feltDelta != null && <small>pts</small>}
          </span>
          <span className="d">{t.feltDelta == null ? "Felt ratings weren’t logged" : "Your rating, test blocks vs usual"}</span>
        </div>
      </div>
    </article>
  );
}

function PatternCard({ i, hidden, onToggle }: { i: Insight; hidden: boolean; onToggle: () => void }) {
  const m = i.metrics[0];
  const [cls, label] = TIER[i.significance] ?? TIER.watching;
  return (
    <article className="fc pat">
      <div className="ey">
        <span className="pill a" style={{ background: "var(--gold)" }}>
          Pattern
        </span>
        <span className={cls}>{label}</span>
      </div>
      <h3>
        Days with &ldquo;{i.tag}&rdquo;: {m ? `${deltaLabel(m)} ${m.metricLabel}` : i.direction}
      </h3>
      <div className="body">{i.recommendation}</div>
      {m && (
        <div className="meta">
          {formatMetricValue(m.taggedMedian, m.metric)} vs {formatMetricValue(m.untaggedMedian, m.metric)} (medians) ·{" "}
          {fmtP(m.pValue)} · n={i.taggedN} vs {i.untaggedN}
        </div>
      )}
      <div className="acts">
        <a href={testThisHref(i)} className="btn">
          Test this →
        </a>
        <button type="button" className="btn ghost" onClick={onToggle}>
          {hidden ? "Unarchive" : "Archive"}
        </button>
      </div>
    </article>
  );
}

function CollectingCard({ c }: { c: CollectingTag }) {
  return (
    <article className="fc">
      <div className="ey">
        <span className="pill muted">Collecting</span>
        <span className="what">{c.tag}</span>
      </div>
      <h3>Too early to say.</h3>
      <div className="body">
        {c.have} logged day{c.have === 1 ? "" : "s"} so far — a pattern needs at least <b>{c.need} on each side</b>{" "}
        before it earns a card.
      </div>
      <div className="prog">
        <div className="bar">
          <i style={{ width: `${Math.min(100, (c.have / c.need) * 100)}%` }} />
        </div>
        <div className="k">
          <span>
            {c.have} / {c.need} days logged
          </span>
        </div>
      </div>
    </article>
  );
}

const GI_MIN_EVENTS = 6; // lib/meal-gi MIN_EVENTS

function GiCollectingCard({ gi }: { gi: MealGiResult }) {
  const watching = !gi.sufficient;
  return (
    <article className="fc">
      <div className="ey">
        <span className="pill muted">Collecting</span>
        <span className="what">Pre-workout meal → GI</span>
      </div>
      <h3>{watching ? "Watching — not enough GI events yet." : "No clear meal factor yet."}</h3>
      <div className="body">
        {watching ? (
          <>
            {gi.positiveEvents} GI failure{gi.positiveEvents === 1 ? "" : "s"} across {gi.analyzedSessions} fueled
            session{gi.analyzedSessions === 1 ? "" : "s"}. Need ~{GI_MIN_EVENTS} before I&apos;ll call a pattern — keep
            logging the outcome in your workout notes.
          </>
        ) : (
          <>
            {gi.positiveEvents} GI failures logged, but no single pre-workout factor separates your failure days from
            clean ones.
          </>
        )}
      </div>
      {watching && (
        <div className="prog">
          <div className="bar">
            <i style={{ width: `${Math.min(100, (gi.positiveEvents / GI_MIN_EVENTS) * 100)}%` }} />
          </div>
          <div className="k">
            <span>
              {gi.positiveEvents} / ~{GI_MIN_EVENTS} GI events
            </span>
            <span>{gi.analyzedSessions} sessions</span>
          </div>
        </div>
      )}
    </article>
  );
}

function GiPatternCard({ p }: { p: MealGiResult["patterns"][number] }) {
  const [cls, label] = GI_TIER[p.significance] ?? GI_TIER.watching;
  const href = `/mind/experiments/new?${new URLSearchParams(p.experimentPrefill).toString()}`;
  return (
    <article className="fc pat">
      <div className="ey">
        <span className={cls}>{label}</span>
        <span className="what">Pre-workout meal → GI</span>
      </div>
      <h3>
        {cap(p.factor)}: {Math.round(p.withRate * 100)}% vs {Math.round(p.withoutRate * 100)}% GI failures
      </h3>
      <div className="body">{p.recommendation}</div>
      <div className="meta">
        {p.withFailures}/{p.withN} with vs {p.withoutFailures}/{p.withoutN} without ·{" "}
        {p.pValue < 0.001 ? "p<0.001" : `p=${p.pValue}`}
        {p.confounders.length > 0 && ` · confounded with ${p.confounders.join(", ")}`}
      </div>
      <div className="acts">
        <Link href={href} className="btn">
          Test this →
        </Link>
      </div>
    </article>
  );
}
