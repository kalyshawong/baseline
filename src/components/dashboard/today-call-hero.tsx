import Link from "next/link";
import type { TrainingCall } from "@/lib/training";

interface EvidenceItem {
  label: string;
  value: string | number;
  unit?: string;
  valueColor?: string;
  icon?: React.ReactNode;
}

const STATUS_LABEL: Record<string, string> = {
  green: "Push",
  yellow: "Caution",
  red: "Recover",
};

export function TodayCallHero({
  call,
  isConnected,
  evidence,
  flagPointer,
  actions,
}: {
  /** Desktop grid handoff (2026-09-21): the three main actions ride in the
   *  hero row as a third column so they sit above the fold. */
  actions?: { href: string; label: string }[];
  call: TrainingCall | null;
  isConnected: boolean;
  evidence?: EvidenceItem[];
  /** Compact pointer to the Flags feed when something about today's inputs
   *  doesn't add up. The reasoning lives in /mind; this is just the nudge. */
  flagPointer?: { count: number; topTitle: string } | null;
}) {
  if (!call) {
    return (
      <section className="panel px-8 py-7">
        <p className="ov">Today&apos;s Call</p>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--color-text-muted)]">
          {isConnected
            ? "Sync to see today's call."
            : "Connect your Oura ring to see today's call."}
        </p>
        {!isConnected && (
          <a href="/api/auth/oura" className="btn mt-5 inline-block">
            Connect Oura
          </a>
        )}
      </section>
    );
  }

  // Determine if any evidence item is score-colored green
  const hasGreenScore = evidence?.some((e) =>
    e.valueColor?.includes("green"),
  );

  return (
    <div
      className={
        actions?.length
          ? "grid grid-cols-[minmax(0,1fr)_260px_240px] gap-[14px] max-[1200px]:grid-cols-[minmax(0,1fr)_220px_210px] max-[900px]:grid-cols-[minmax(0,1fr)_200px]"
          : "grid grid-cols-[1fr_320px] gap-[14px]"
      }
    >
      {/* Left: amber gradient call band */}
      <div
        className={`relative flex flex-col overflow-hidden border-l-[6px] border-[var(--color-yellow)] ${actions?.length ? "px-7 py-[22px]" : "px-8 py-7"}`}
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklch, var(--color-yellow), var(--color-surface) 78%), var(--color-surface))",
          boxShadow:
            "0 0 60px -22px var(--color-yellow), inset 0 1px 0 oklch(1 0 0 / 0.05)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="ov">Today&apos;s Call</span>
          <span className="pill-a angled-clip px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em]">
            {STATUS_LABEL[call.color] ?? "Standard"}
          </span>
        </div>

        {/* The verdict — massive Bebas Neue */}
        <p
          className={`disp mt-2 leading-[0.82] text-[var(--color-yellow)] ${actions?.length ? "text-[clamp(88px,9.5vw,124px)]" : "text-[140px]"}`}
        >
          {call.verdict.toUpperCase()}
        </p>

        {/* Why line */}
        <p className="mt-2 max-w-[560px] text-lg font-medium">
          {call.whyLine}
        </p>

        {/* Action line */}
        <p className="mt-2.5 text-base font-bold uppercase tracking-[0.02em] text-[var(--color-yellow)]">
          {call.actionLine}
        </p>

        {/* Link to full breakdown */}
        <Link href="/body" className="linklike mt-5 inline-block">
          See full training breakdown →
        </Link>

        {/* Flag pointer — only when something about today's inputs is worth
            a look. One line; the detail lives in the Flags feed on /mind. */}
        {flagPointer && flagPointer.count > 0 && (
          <Link
            href="/mind"
            className="mt-4 flex items-center gap-2 border-t border-[var(--color-border)] pt-3 text-sm text-[var(--color-yellow)] transition duration-150 ease-out-strong hover:brightness-110 active:scale-[0.99]"
          >
            <span aria-hidden="true">⚐</span>
            <span className="font-medium">
              {flagPointer.count === 1
                ? flagPointer.topTitle
                : `${flagPointer.count} flags — ${flagPointer.topTitle}`}
            </span>
            <span className="ml-auto" aria-hidden="true">→</span>
          </Link>
        )}
      </div>

      {/* Right: score stack — 3 stacked cards */}
      <div className="grid grid-rows-3 gap-[14px]">
        {(evidence ?? []).map((item, i) => {
          const isGreen =
            item.valueColor?.includes("green") || hasGreenScore;
          return (
            <div
              key={i}
              className={`flex flex-col justify-center border-l-4 bg-[var(--color-surface)] px-5 py-4 ${
                isGreen
                  ? "border-[var(--color-green)]"
                  : "border-[var(--color-border)]"
              }`}
              style={{
                backgroundImage:
                  "linear-gradient(160deg, oklch(1 0 0 / 0.032), transparent 42%)",
                boxShadow:
                  "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 12px 30px -16px #000",
              }}
            >
              <span className="ov mb-0.5">{item.label}</span>
              <span
                className={`disp num ${actions?.length ? "text-[44px]" : "text-[52px]"} leading-[0.9] ${
                  isGreen
                    ? "text-[var(--color-green)]"
                    : "text-[var(--color-text)]"
                }`}
              >
                {item.value}
                {item.unit && (
                  <small className="ml-1 font-sans text-[15px] font-semibold text-[var(--color-faint)]">
                    {item.unit}
                  </small>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Action stack — Log food / Log workout / Open coach */}
      {actions && actions.length > 0 && (
        <div className="grid grid-rows-3 gap-[14px] max-[900px]:col-span-full max-[900px]:grid-cols-3 max-[900px]:grid-rows-none">
          {actions.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="panel flex items-center justify-between border-l-4 border-[var(--color-gold)] !px-5 !py-0 transition duration-150 ease-out-strong hover:bg-[var(--color-surface-2)] active:scale-[0.98] max-[900px]:!py-4"
            >
              <b className="disp text-[26px] font-normal tracking-[0.02em]">{a.label.toUpperCase()}</b>
              <span className="text-xl text-[var(--color-gold)]" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
