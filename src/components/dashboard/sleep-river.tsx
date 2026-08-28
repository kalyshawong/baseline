/**
 * Sleep river (her pick, option B, 2026-08-28): each of the last 14 nights
 * drawn as a horizontal span on a shared clock axis — WHEN you slept, not a
 * vendor score. Drift and irregularity become visible shapes; color encodes
 * duration vs HER OWN median band. Server-rendered SVG, no client JS.
 */

export interface RiverNight {
  dayStr: string; // wake-day YYYY-MM-DD
  startIso: string;
  endIso: string;
  tstSec: number | null;
}

const BAND_MIN = 45; // ± minutes around her median that counts as "her band"

function hoursSinceNoon(iso: string, tz: string): number {
  // Clock position in HER timezone, on a noon→noon axis so nights never wrap.
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const clock = h + m / 60;
  return clock >= 12 ? clock - 12 : clock + 12; // 0 = noon, 12 = midnight, 24 = next noon
}

function fmtHourTick(hSinceNoon: number): string {
  const clock = (hSinceNoon + 12) % 24;
  const h12 = clock % 12 === 0 ? 12 : clock % 12;
  return `${h12}${clock < 12 ? "am" : "pm"}`;
}

function fmtDur(sec: number | null): string {
  if (sec == null) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export function SleepRiver({ nights, tz }: { nights: RiverNight[]; tz: string }) {
  if (nights.length < 3) return null;
  const rows = [...nights].sort((a, b) => (a.dayStr < b.dayStr ? -1 : 1)).slice(-14);

  const medTst = median(rows.map((r) => r.tstSec).filter((v): v is number => v != null));

  const spans = rows.map((r) => ({
    ...r,
    x1: hoursSinceNoon(r.startIso, tz),
    x2: hoursSinceNoon(r.endIso, tz),
  }));
  const lo = Math.floor(Math.min(...spans.map((s) => s.x1)) - 0.5);
  const hi = Math.ceil(Math.max(...spans.map((s) => s.x2)) + 0.5);
  const range = Math.max(hi - lo, 4);

  const W = 600;
  const LABEL_W = 44;
  const DUR_W = 44;
  const plotW = W - LABEL_W - DUR_W;
  const ROW_H = 17;
  const TOP = 16;
  const H = TOP + rows.length * ROW_H + 6;
  const x = (v: number) => LABEL_W + ((v - lo) / range) * plotW;

  const tone = (tst: number | null): string => {
    if (tst == null || medTst == null) return "var(--color-text-muted)";
    const d = (tst - medTst) / 60; // minutes vs her median
    if (d < -90) return "var(--color-red)";
    if (d < -BAND_MIN) return "var(--color-yellow)";
    if (d > BAND_MIN) return "#4a90d9";
    return "var(--color-green)";
  };

  // regularity: spread of bedtime clock positions, last 7 nights
  const last7Starts = spans.slice(-7).map((s) => s.x1 * 60);
  const startMean = last7Starts.reduce((a, b) => a + b, 0) / last7Starts.length;
  const startSd = Math.round(
    Math.sqrt(last7Starts.reduce((a, b) => a + (b - startMean) ** 2, 0) / last7Starts.length),
  );

  // hour ticks every 2h
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / 2) * 2; t <= hi; t += 2) ticks.push(t);

  return (
    <div className="panel">
      <div className="flex items-baseline justify-between">
        <p className="ov">Sleep · when, not a score</p>
        {medTst != null && (
          <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--color-faint)]">
            your median {fmtDur(medTst)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" style={{ display: "block" }}>
        {/* hour grid */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={TOP - 4} x2={x(t)} y2={H - 4} stroke="var(--color-border)" strokeWidth={1} strokeDasharray={t === 12 ? undefined : "2 4"} />
            <text x={x(t)} y={9} textAnchor="middle" fontSize={8} fill="var(--color-faint)" fontFamily="monospace">
              {fmtHourTick(t)}
            </text>
          </g>
        ))}
        {/* nights */}
        {spans.map((s, i) => {
          const y = TOP + i * ROW_H;
          const c = tone(s.tstSec);
          const label = new Date(s.dayStr + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
          const isLast = i === spans.length - 1;
          return (
            <g key={s.dayStr} opacity={isLast ? 1 : 0.82}>
              <text x={LABEL_W - 6} y={y + 9} textAnchor="end" fontSize={8.5} fill={isLast ? "var(--color-text)" : "var(--color-faint)"} fontFamily="monospace">
                {label}
              </text>
              <rect x={x(s.x1)} y={y + 2} width={Math.max(2, x(s.x2) - x(s.x1))} height={9} rx={4.5} fill={c} fillOpacity={isLast ? 0.95 : 0.65} />
              <text x={W - 2} y={y + 9} textAnchor="end" fontSize={8.5} fill="var(--color-faint)" fontFamily="monospace">
                {fmtDur(s.tstSec)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-[10.5px] leading-snug text-[var(--color-faint)]">
        Color = duration vs your own median (±{BAND_MIN}m band) · green in band · yellow/red short · blue long.
        Bedtime spread last 7 nights: ±{startSd}m{startSd > 60 ? " — drifting" : ""}.
      </p>
    </div>
  );
}
