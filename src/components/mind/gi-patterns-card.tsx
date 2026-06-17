import Link from "next/link";
import type { MealGiResult, GiPattern } from "@/lib/meal-gi";

/**
 * Pre-workout meal -> GI patterns. Mirrors the insights-feed card styling.
 * Each pattern offers a "Test this" deep-link into a pre-filled Mind
 * experiment (forward test to convict the suspect the backward analyzer found).
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function pct(x: number): number {
  return Math.round(x * 100);
}

function PatternCard({ p }: { p: GiPattern }) {
  const href = `/mind/experiments/new?${new URLSearchParams(p.experimentPrefill).toString()}`;
  return (
    <div className={`${tierToCard[p.significance]} p-[20px_22px]`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-medium">{cap(p.factor)}</p>
        <span className={tierToPill[p.significance]}>{tierLabel[p.significance]}</span>
      </div>
      <div className="mt-[11px]">
        <span className="disp num text-[26px] leading-none text-[var(--color-text)]">{pct(p.withRate)}%</span>{" "}
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">vs</span>{" "}
        <span className="disp num text-[26px] leading-none">{pct(p.withoutRate)}%</span>{" "}
        <span className="text-[11px] text-[var(--color-text-muted)]">GI-failure rate</span>
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--color-faint)] italic">
        {p.withFailures}/{p.withN} with vs {p.withoutFailures}/{p.withoutN} without · p={p.pValue}
      </p>
      {p.confounders.length > 0 && (
        <p className="mt-2 text-[11.5px] text-[var(--color-text-muted)]">
          Confounded with: {p.confounders.join(", ")} — overlapping, can&apos;t isolate yet.
        </p>
      )}
      <p className="mt-2 text-[14px] text-[var(--color-text-muted)]">{p.recommendation}</p>
      <Link href={href} className="linklike mt-3 inline-block text-[13px] font-semibold">
        Test this in Mind &rarr;
      </Link>
    </div>
  );
}

export function GiPatternsCard({ result }: { result: MealGiResult }) {
  if (result.analyzedSessions === 0) return null;

  return (
    <div className="mt-[14px]">
      <p className="ov mb-3">Pre-workout meal &rarr; GI</p>

      {!result.sufficient ? (
        <div className="insight-card insight-card-muted p-[20px_22px]">
          <p className="text-[14px] font-medium">Watching &mdash; not enough GI events yet</p>
          <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">
            {result.positiveEvents} GI failure{result.positiveEvents === 1 ? "" : "s"} across{" "}
            {result.analyzedSessions} fueled session{result.analyzedSessions === 1 ? "" : "s"}. Need
            ~6 before I&apos;ll call a pattern &mdash; keep logging the outcome in your workout notes.
          </p>
        </div>
      ) : result.patterns.length === 0 ? (
        <div className="insight-card insight-card-muted p-[20px_22px]">
          <p className="text-[14px] font-medium">No clear meal factor yet</p>
          <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">
            {result.positiveEvents} GI failures logged, but no single pre-workout factor separates
            your failure days from clean ones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[14px]">
          {result.patterns.map((p) => (
            <PatternCard key={p.factor} p={p} />
          ))}
        </div>
      )}

      <p className="mt-3 text-[12px] text-[var(--color-faint)] leading-relaxed">
        Backward analysis &mdash; finds suspects, doesn&apos;t prove cause. &ldquo;Test this&rdquo;
        runs a forward experiment to convict one.
      </p>
    </div>
  );
}
