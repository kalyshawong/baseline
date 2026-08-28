import type { DailySignals } from "@/lib/daily-signals";

/**
 * Daily signals — the honest replacements for vendor scores
 * (daily-signals-plan.md). Renders ONLY the lines that fired; most days this
 * card is short or absent entirely. Measurements and expectations, never
 * verdicts. Lab styling — Kalysha may restyle.
 */
export function DailySignalsCard({ s }: { s: DailySignals }) {
  const lines: { key: string; tone: "warn" | "info"; text: string }[] = [];

  if (s.illness) {
    lines.push({
      key: "illness",
      tone: "warn",
      text: `Unusual for you: temp +${s.illness.tempDev}°C and night RHR +${s.illness.rhrDelta} bpm together. No verdict — if it persists a few nights, worth discussing with a clinician.`,
    });
  }
  if (s.revved) {
    lines.push({
      key: "revved",
      tone: "warn",
      text: `Revved: daytime HR ran ~${s.revved.pctAbove}% above your usual for ${s.revved.hours}+ hours. A measurement, not a stress verdict — tonight's check-in will ask.`,
    });
  }
  if (s.rhrDecomposition) {
    const d = s.rhrDecomposition;
    const sign = (v: number) => `${v > 0 ? "+" : ""}${v}`;
    lines.push({
      key: "rhr",
      tone: "info",
      text:
        `Night RHR ${sign(d.deltaBpm)} bpm vs your median` +
        (d.cycleBpm != null && d.phase
          ? ` — ~${sign(d.cycleBpm)} is typical for your ${d.phase} phase, ${sign(d.unexplainedBpm)} unexplained.`
          : ` — no known component explains it yet.`),
    });
  }
  if (s.recovery) {
    lines.push({
      key: "recovery",
      tone: "info",
      text: s.recovery.stillSuppressedTypical
        ? `Day ${s.recovery.daysSinceHard} after a hard session — for you, recovery typically lands around day ${s.recovery.typicalReturnDay} (from ${s.recovery.n} past sessions). Suppressed numbers today are expected, not a problem.`
        : `Day ${s.recovery.daysSinceHard} after a hard session — you're past your typical return point (~day ${s.recovery.typicalReturnDay}).`,
    });
  }
  if (s.sleepDebt && s.sleepDebt.debtMin >= 45) {
    lines.push({
      key: "debt",
      tone: "info",
      text: `Sleep debt ≈ ${fmtMin(s.sleepDebt.debtMin)} over your last ${s.sleepDebt.nights} nights, vs your own median night of ${fmtMin(s.sleepDebt.needMin)}.`,
    });
  }
  if (s.monotony && s.monotony.monotony >= 2) {
    lines.push({
      key: "monotony",
      tone: "info",
      text: `Training monotony ${s.monotony.monotony} this week (every day similar load). Population guidance flags >2.0 — labeled prior, not your data. Variety, not just rest, brings it down.`,
    });
  }

  if (lines.length === 0) return null;

  return (
    <div className="panel">
      <p className="ov mb-2">Signals · yours only</p>
      <div className="flex flex-col gap-[6px]">
        {lines.map((l) => (
          <p
            key={l.key}
            className="border-l-2 py-[2px] pl-3 text-[12.5px] leading-[1.5] text-[var(--color-text-muted)]"
            style={{ borderColor: l.tone === "warn" ? "var(--color-yellow)" : "var(--color-border)" }}
          >
            {l.text}
          </p>
        ))}
      </div>
      <p className="mt-2 text-[10.5px] leading-snug text-[var(--color-faint)]">
        Open recipes, your baselines only, no vendor scores. Empty lines don&apos;t render — most days this card is short.
      </p>
    </div>
  );
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
