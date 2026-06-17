/**
 * Small sleep-quality ring for the hero evidence strip.
 *
 * Iconic enough to read at a glance, informative enough to be more
 * than decoration: the stroke fills proportionally to the sleep score
 * (0–100), and the color picks up the Oura-style band (green ≥ 85,
 * yellow ≥ 70, red below). 14px so it sits inline with body text
 * without disrupting the line height.
 *
 * Renders nothing if score is null — the evidence strip simply omits
 * the icon when we don't have a number to ring.
 */

const STROKE = 2;
const SIZE = 14;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

export function SleepRing({ score }: { score: number | null }) {
  if (score == null) return null;

  const pct = Math.max(0, Math.min(100, score));
  const color =
    score >= 85
      ? "var(--color-green)"
      : score >= 70
        ? "var(--color-yellow)"
        : "var(--color-red)";
  const dashOffset = CIRC * (1 - pct / 100);

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="inline-block shrink-0 align-[-0.18em]"
      aria-label={`Sleep score ${score}`}
      role="img"
    >
      {/* Track */}
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={STROKE}
      />
      {/* Fill arc — rotated -90deg so it grows from 12 o'clock clockwise */}
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeDasharray={CIRC}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        style={{
          transition: `stroke-dashoffset 400ms var(--ease-out-strong)`,
        }}
      />
    </svg>
  );
}
