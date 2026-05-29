/**
 * SleepCard — insomnia-priority sleep summary.
 *
 * Design (2026-05-28): for someone with insomnia, the load-bearing
 * sleep metrics are *not* the stage breakdown that generic apps lead
 * with — they're efficiency (% of time in bed that was sleep),
 * latency (how long to fall asleep), and WASO (wake after sleep
 * onset). Those three get the dominant stat grid + traffic-light
 * tint against evidence-based targets. Stages are demoted to a
 * smaller ribbon. Oura score is a small badge top-right (rollup, not
 * headline).
 *
 * Targets cited (from the research the user linked):
 *   - Total sleep:     7-8.5 h
 *   - Efficiency:      ≥ 85% (sleeptracker.com, ouraring.com)
 *   - Latency:         15-20 min ideal; <5 or >40 flags both extremes
 *                      (sleep.hms.harvard.edu)
 *   - WASO:            < 30 min ideal; > 45 disruptive
 *   - Oura score:      85+ green, 70-84 yellow, <70 red
 *
 * Renders nothing if there's no sleep data for the day.
 *
 * WASO is derived rather than queried — DailySleep doesn't store it,
 * but it's computable from the three fields we DO have:
 *   time_in_bed   = total_sleep / (efficiency / 100)
 *   WASO          = time_in_bed - total_sleep - latency
 */

interface Props {
  daySleep: {
    score: number | null;
    totalSleepDuration: number | null;
    remSleepDuration: number | null;
    deepSleepDuration: number | null;
    lightSleepDuration: number | null;
    sleepEfficiency: number | null;
    latency: number | null;
    averageHrv: number | null;
    lowestHeartRate: number | null;
  } | null;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}M`;
  return `${h}H ${m}M`;
}

function deriveWasoSeconds(
  totalSleep: number | null,
  efficiencyPct: number | null,
  latencySec: number | null,
): number | null {
  if (totalSleep == null || efficiencyPct == null || efficiencyPct <= 0) {
    return null;
  }
  const timeInBed = totalSleep / (efficiencyPct / 100);
  const waso = timeInBed - totalSleep - (latencySec ?? 0);
  return waso > 0 ? Math.round(waso) : 0;
}

// Traffic-light bands. Each metric maps current value → tint color.
type Tone = "green" | "yellow" | "red" | "neutral";

function efficiencyTone(pct: number | null): Tone {
  if (pct == null) return "neutral";
  if (pct >= 85) return "green";
  if (pct >= 75) return "yellow";
  return "red";
}

function latencyTone(seconds: number | null): Tone {
  if (seconds == null) return "neutral";
  const min = seconds / 60;
  // 10-25 min = healthy. <5 = exhaustion (likely accumulated sleep debt).
  // 25-40 = sluggish onset. >40 = clear insomnia.
  if (min >= 10 && min <= 25) return "green";
  if (min >= 5 && min <= 40) return "yellow";
  return "red";
}

function wasoTone(seconds: number | null): Tone {
  if (seconds == null) return "neutral";
  const min = seconds / 60;
  if (min < 30) return "green";
  if (min < 45) return "yellow";
  return "red";
}

function scoreTone(score: number | null): Tone {
  if (score == null) return "neutral";
  if (score >= 85) return "green";
  if (score >= 70) return "yellow";
  return "red";
}

const TONE_BORDER: Record<Tone, string> = {
  green: "border-t-[4px] border-[var(--color-green)] bg-[color-mix(in_srgb,var(--color-green)_8%,transparent)]",
  yellow: "border-t-[4px] border-[var(--color-yellow)] bg-[color-mix(in_srgb,var(--color-yellow)_8%,transparent)]",
  red: "border-t-[4px] border-[var(--color-red)] bg-[color-mix(in_srgb,var(--color-red)_8%,transparent)]",
  neutral: "border-t-[4px] border-[var(--color-border)] bg-[var(--color-surface-2)]",
};

const TONE_TEXT: Record<Tone, string> = {
  green: "text-[var(--color-green)]",
  yellow: "text-[var(--color-yellow)]",
  red: "text-[var(--color-red)]",
  neutral: "text-[var(--color-text)]",
};

const SCORE_BG: Record<Tone, string> = {
  green: "bg-[var(--color-green)] text-[var(--color-bg)]",
  yellow: "bg-[var(--color-yellow)] text-[var(--color-bg)]",
  red: "bg-[var(--color-red)] text-[var(--color-bg)]",
  neutral: "bg-[var(--color-surface-2)] text-[var(--color-text)]",
};

const SCORE_GLOW: Record<Tone, React.CSSProperties> = {
  green: { boxShadow: "0 0 20px -6px var(--color-green)" },
  yellow: { boxShadow: "0 0 20px -6px var(--color-yellow)" },
  red: { boxShadow: "0 0 20px -6px var(--color-red)" },
  neutral: {},
};

export function SleepCard({ daySleep }: Props) {
  // Render nothing when we have no usable sleep data at all. (Hero
  // evidence strip handles the "no sleep yet today" state separately.)
  if (
    daySleep == null ||
    (daySleep.totalSleepDuration == null && daySleep.score == null)
  ) {
    return null;
  }

  const wasoSec = deriveWasoSeconds(
    daySleep.totalSleepDuration,
    daySleep.sleepEfficiency,
    daySleep.latency,
  );

  const sTone = scoreTone(daySleep.score);

  // Stages bar — proportional widths of deep/REM/light against total.
  const deep = daySleep.deepSleepDuration ?? 0;
  const rem = daySleep.remSleepDuration ?? 0;
  const light = daySleep.lightSleepDuration ?? 0;
  const stagesTotal = deep + rem + light;
  const hasStages = stagesTotal > 0;

  return (
    <div className="panel">
      {/* Header: label + Oura score badge */}
      <div className="flex items-start justify-between">
        <p className="ov">Sleep</p>
        {daySleep.score != null && (
          <span
            className={`disp num text-[30px] px-4 py-1.5 angled-clip ${SCORE_BG[sTone]}`}
            style={SCORE_GLOW[sTone]}
            title="Oura sleep score (rollup of all metrics)"
          >
            {daySleep.score}
          </span>
        )}
      </div>

      {/* Total sleep — visual anchor */}
      <p className="disp num text-[84px] leading-[0.8] mt-4 text-[var(--color-text)]">
        {formatDuration(daySleep.totalSleepDuration)}
      </p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        total time asleep
      </p>

      {/* Insomnia trinity: efficiency · latency · WASO */}
      <div className="mt-6 grid grid-cols-3 gap-2">
        <StatCell
          label="Efficiency"
          value={daySleep.sleepEfficiency != null ? `${daySleep.sleepEfficiency}%` : "—"}
          target="target ≥ 85%"
          tone={efficiencyTone(daySleep.sleepEfficiency)}
        />
        <StatCell
          label="Latency"
          value={
            daySleep.latency != null
              ? `${Math.round(daySleep.latency / 60)}m`
              : "—"
          }
          target="target 15–20m"
          tone={latencyTone(daySleep.latency)}
        />
        <StatCell
          label="WASO"
          value={wasoSec != null ? `${Math.round(wasoSec / 60)}m` : "—"}
          target="target < 30m"
          tone={wasoTone(wasoSec)}
        />
      </div>

      {/* Stages — horizontal colored blocks + legend */}
      {hasStages && (
        <div className="mt-6">
          <div className="flex h-3 w-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-blue)]"
              style={{ width: `${(deep / stagesTotal) * 100}%` }}
            />
            <div
              className="h-full bg-[var(--color-gold)]"
              style={{ width: `${(rem / stagesTotal) * 100}%` }}
            />
            <div
              className="h-full bg-[var(--color-border)]"
              style={{ width: `${(light / stagesTotal) * 100}%` }}
            />
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 bg-[var(--color-blue)]" />
              Deep <span className="disp num text-[var(--color-text)]">{formatDuration(deep)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 bg-[var(--color-gold)]" />
              REM <span className="disp num text-[var(--color-text)]">{formatDuration(rem)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 bg-[var(--color-border)]" />
              Light <span className="disp num text-[var(--color-text)]">{formatDuration(light)}</span>
            </span>
          </div>
        </div>
      )}

      {/* Recovery tail — HRV + low HR */}
      {(daySleep.averageHrv != null || daySleep.lowestHeartRate != null) && (
        <div className="mt-5 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-text-muted)] uppercase tracking-[0.12em]">
          Recovery{" "}
          {daySleep.averageHrv != null && (
            <>
              · HRV{" "}
              <span className="disp num text-[var(--color-text)]">
                {daySleep.averageHrv} ms
              </span>
            </>
          )}
          {daySleep.lowestHeartRate != null && (
            <>
              {" "}· Low HR{" "}
              <span className="disp num text-[var(--color-text)]">
                {daySleep.lowestHeartRate} bpm
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatCell({
  label,
  value,
  target,
  tone,
}: {
  label: string;
  value: string;
  target: string;
  tone: Tone;
}) {
  return (
    <div className={`${TONE_BORDER[tone]} px-3 py-3`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className={`disp num mt-1 text-2xl ${TONE_TEXT[tone]}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
        {target}
      </p>
    </div>
  );
}
