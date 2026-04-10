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

  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3} className="opacity-10" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-[10px] font-mono font-bold">{daysLeft}d</span>
    </div>
  );
}
