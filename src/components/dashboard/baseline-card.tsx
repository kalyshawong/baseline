import type { HrvBaselineSummary } from "@/lib/training-call";

/**
 * Permanent "Your baseline" reference card. Unlike the calibration prompt
 * (a one-time decision that resolves), this is a standing fact: her HRV
 * set-point and normal range.
 *
 * Framing is deliberate — her HRV runs low next to the general population, but
 * that's her set-point, not a deficit. We state it neutrally and anchor it
 * qualitatively (no fake percentile — there's no normative dataset behind it).
 *
 * Visual: styled as a finding (blue / neutral-reference variant) rather than a
 * plain panel — it's an established read on her, not today's data, and the
 * blue accent keeps it distinct from the good/watch findings on /mind.
 *
 * Built to grow into a multi-metric baseline card (resting HR, temp) later;
 * HRV + sleep are the first two rows.
 */

// Population reference for overnight HRV. A prior we bring in, NOT her data —
// labelled as such in the copy so the two never blur together.
const TYPICAL_LOW_MS = 30;
const TYPICAL_HIGH_MS = 60;

function formatSleep(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function BaselineCard({ hrv }: { hrv: HrvBaselineSummary | null }) {
  if (!hrv) return null;

  const belowFloor = hrv.meanMs < TYPICAL_LOW_MS;
  const gapMs = TYPICAL_LOW_MS - hrv.meanMs;
  const pctBelow = Math.round((gapMs / TYPICAL_LOW_MS) * 100);

  return (
    <section className="insight-card insight-card-b">
      <div className="flex items-center justify-between">
        <p className="ov">Your baseline</p>
        <span className="pill pill-b">your normal</span>
      </div>

      {/* HRV row */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="disp num text-[44px] leading-none">
          {hrv.meanMs}
          <small className="ml-1 font-sans text-sm font-semibold text-[var(--color-text-muted)]">
            ms HRV
          </small>
        </span>
        <span className="text-sm text-[var(--color-text-muted)]">
          your range {hrv.minMs}–{hrv.maxMs} ms · {hrv.nNights} nights
        </span>
      </div>

      {/* Quantified comparison to the population reference */}
      <p className="mt-1.5 text-[13px] font-medium text-[var(--color-text-muted)]">
        {belowFloor ? (
          <>
            <span className="text-[var(--color-blue)]">
              ≈{gapMs} ms ({pctBelow}%) below
            </span>{" "}
            the typical adult floor — reference range ~{TYPICAL_LOW_MS}–
            {TYPICAL_HIGH_MS} ms (population prior, not your data).
          </>
        ) : (
          <>
            Sits inside the typical adult range (~{TYPICAL_LOW_MS}–
            {TYPICAL_HIGH_MS} ms, population prior).
          </>
        )}
      </p>

      {/* Sleep row — same night window */}
      {hrv.avgSleepSeconds != null && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--color-border)] pt-3">
          <span className="disp num text-[30px] leading-none">
            {formatSleep(hrv.avgSleepSeconds)}
            <small className="ml-1 font-sans text-sm font-semibold text-[var(--color-text-muted)]">
              avg sleep
            </small>
          </span>
          <span className="text-sm text-[var(--color-text-muted)]">
            over {hrv.nSleepNights} nights
          </span>
        </div>
      )}

      <p className="mt-3 max-w-[640px] text-sm leading-relaxed text-[var(--color-text-muted)]">
        That low HRV is your set-point, not a deficit. Baseline reads your
        day-to-day against these numbers, not a population average.
      </p>
    </section>
  );
}
