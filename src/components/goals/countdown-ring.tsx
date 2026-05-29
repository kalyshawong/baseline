"use client";

interface CountdownRingProps {
  deadline: string;
  createdAt?: string;
  size?: number;
  color?: string;
}

export function CountdownRing({
  deadline,
  createdAt,
  size = 48,
  color = "var(--color-text-muted)",
}: CountdownRingProps) {
  const now = Date.now();
  const end = new Date(deadline).getTime();
  const start = createdAt ? new Date(createdAt).getTime() : end - 90 * 86400000;
  const total = end - start;
  const elapsed = now - start;
  const pct = total > 0 ? Math.min(Math.max(elapsed / total, 0), 1) : 1;
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));

  const strokeWidth = size >= 100 ? 5 : 3;
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  const fontSize = size >= 100 ? size * 0.28 : size * 0.22;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span
        className="disp absolute leading-none"
        style={{ fontSize, color }}
      >
        {daysLeft}
      </span>
    </div>
  );
}
