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
}: {
  call: TrainingCall | null;
  isConnected: boolean;
  evidence?: EvidenceItem[];
}) {
  if (!call) {
    return (
      <section className="panel mb-6 px-8 py-7">
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
    <div className="mb-6 grid grid-cols-[1fr_320px] gap-[14px]">
      {/* Left: amber gradient call band */}
      <div
        className="relative overflow-hidden border-l-[6px] border-[var(--color-yellow)] px-8 py-7"
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
        <p className="disp mt-2 text-[140px] leading-[0.82] text-[var(--color-yellow)]">
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
                className={`disp num text-[52px] leading-[0.9] ${
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
    </div>
  );
}
