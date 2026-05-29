import Link from "next/link";
import type { HyroxTodayResult } from "@/lib/hyrox-today";
import { formatKmPace, computePaceBudget } from "@/lib/hyrox-pace";

interface Props {
  today: HyroxTodayResult;
}

const BLOCK_LABELS: Record<string, string> = {
  accumulation: "Base building",
  transmutation: "Intensification",
  realization: "Peak prep",
  taper: "Taper",
  complete: "Post-race",
};

export function HyroxCountdownCard({ today }: Props) {
  const { recommendation, raceDate, targetTimeSeconds } = today;
  const blockLabel = BLOCK_LABELS[recommendation.block] ?? recommendation.block;
  const paceBudget = computePaceBudget(targetTimeSeconds);
  const targetMin = Math.floor(targetTimeSeconds / 60);
  const targetSec = targetTimeSeconds % 60;
  const targetStr = targetSec === 0 ? `${targetMin}` : `${targetMin}:${String(targetSec).padStart(2, "0")}`;

  const daysToRace = recommendation.daysToRace;
  const isPastRace = daysToRace < 0;

  const raceDateStr = raceDate
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();

  return (
    <div className="grid grid-cols-[300px_1fr] gap-[14px]">
      {/* Left: gold countdown block */}
      <div
        className="flex flex-col justify-center px-6 py-6"
        style={{
          background: "var(--color-gold)",
          color: "var(--color-bg)",
          boxShadow: "0 0 50px -10px var(--color-gold)",
        }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "color-mix(in oklch, var(--color-bg), transparent 35%)" }}
        >
          Hyrox · {blockLabel}
        </span>
        {isPastRace ? (
          <div className="disp mt-3 text-[104px] leading-[0.8]">Done</div>
        ) : daysToRace === 0 ? (
          <div className="disp mt-3 text-[104px] leading-[0.8]">0</div>
        ) : (
          <div className="disp num mt-3 text-[104px] leading-[0.8]">{daysToRace}</div>
        )}
        <div className="mt-1 text-[15px] font-extrabold uppercase tracking-[0.04em]">
          {isPastRace
            ? `race was ${Math.abs(daysToRace)}d ago`
            : daysToRace === 0
              ? "race day"
              : `day${daysToRace === 1 ? "" : "s"} to race`}
        </div>
        <div className="mt-3.5 text-[13px] font-semibold" style={{ opacity: 0.8 }}>
          {raceDateStr} · TARGET SUB-{targetStr} · {formatKmPace(paceBudget.kmPaceSeconds)}/KM
        </div>
      </div>

      {/* Right: today's session */}
      <div
        className="flex flex-col justify-center px-6 py-6"
        style={{
          background: "var(--color-surface)",
          backgroundImage: "linear-gradient(160deg, oklch(1 0 0 / 0.032), transparent 42%)",
          boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 12px 30px -16px #000",
        }}
      >
        <span className="ov">Today&apos;s Session</span>
        <div className="disp mt-2 text-[40px] leading-[0.95]">
          {recommendation.title.toUpperCase()}
        </div>
        <p className="mt-1.5 text-base text-[var(--color-text-muted)]">
          {recommendation.prescription}
        </p>

        {/* Chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {recommendation.durationMin > 0 && (
            <span className="bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--color-text-muted)]">
              ~<b className="text-[var(--color-gold)]">{recommendation.durationMin}</b> MIN
            </span>
          )}
          <span className="bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--color-text-muted)]">
            {blockLabel.toUpperCase()} <b className="text-[var(--color-gold)]">WK {recommendation.weekInBlock ?? 1}</b>
          </span>
          <span className="bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--color-text-muted)]">
            <b className="text-[var(--color-gold)]">{daysToRace}D</b> TO RACE
          </span>
        </div>

        {/* Warnings */}
        {recommendation.warnings.length > 0 && (
          <div className="mt-3 space-y-1">
            {recommendation.warnings.map((w, i) => (
              <p key={i} className="text-xs text-[var(--color-red)]">⚠ {w}</p>
            ))}
          </div>
        )}

        <Link href="/body/hyrox" className="linklike mt-4 inline-block">
          See full plan →
        </Link>
      </div>
    </div>
  );
}
