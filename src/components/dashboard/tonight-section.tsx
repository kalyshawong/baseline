/**
 * The "TONIGHT" section — the evening anchor of the dashboard.
 *
 * One-line sleep target + a one-line summary of what got captured
 * today. No card chrome, no widgets. Per the brainstorm convergence:
 * the dashboard's third use mode is end-of-day, and the right anchor
 * for that mode is "did today happen as planned + what to optimize
 * tonight" — NOT close-the-day rings, NOT a journal feed.
 *
 * Renders nothing if there's no data on any of the lines, so the
 * section disappears on a brand-new install or a past-date view with
 * nothing logged.
 */

interface Props {
  /** Recommended bedtime as "10:30 PM" — already formatted by parent */
  sleepTargetTime: string | null;
  /** Today's workout: "Hyrox sim (45 min)" — formatted by parent. Null if none. */
  workoutSummary: string | null;
  /** Number of food entries logged today (any source). Null/0 = nothing to show. */
  mealCount: number | null;
  /** Whether the user logged their weight today */
  weightLoggedToday: boolean;
}

export function TonightSection({
  sleepTargetTime,
  workoutSummary,
  mealCount,
  weightLoggedToday,
}: Props) {
  const captured: string[] = [];
  if (workoutSummary) captured.push(workoutSummary);
  if (mealCount && mealCount > 0) {
    captured.push(`${mealCount} meal${mealCount === 1 ? "" : "s"}`);
  }
  if (weightLoggedToday) captured.push("weight ✓");

  // Nothing to say — render nothing rather than show an empty section.
  if (!sleepTargetTime && captured.length === 0) return null;

  return (
    <section className="mt-2 bg-[var(--color-surface-2)] px-6 py-5">
      <div className="flex items-baseline justify-between">
        {/* Left: sleep target */}
        <div>
          {sleepTargetTime ? (
            <p className="disp text-[26px] text-[var(--color-text)]">
              Sleep target{" "}
              <span className="text-[var(--color-gold)] tabular-nums">
                {sleepTargetTime}
              </span>
            </p>
          ) : (
            <p className="disp text-[26px] text-[var(--color-text)]">
              Tonight
            </p>
          )}
        </div>

        {/* Right: captured summary */}
        {captured.length > 0 && (
          <p className="ov text-[11px] font-[700] tracking-[0.12em] uppercase text-[var(--color-text-muted)]">
            {captured.join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}
