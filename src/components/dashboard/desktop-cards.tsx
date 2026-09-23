import Link from "next/link";
import type { DailySignals } from "@/lib/daily-signals";
import {
  zoneOf,
  toKm,
  fmtPace,
  workoutKind,
  type WorkoutBaseline,
  type StrengthSummary,
  type RunDetail,
  type RunZones,
} from "@/lib/dashboard-desktop";
import { WorkoutNotesBlock } from "@/components/dashboard/workout-notes-block";
import { RouteMap } from "@/components/dashboard/workout-card";

/**
 * Desktop-only dashboard cards from the Claude Design "desktop grid" handoff
 * (2026-09-21). Markup and class names follow the handoff HTML one-to-one;
 * the styles live in src/app/dashboard-desktop.css, scoped under `.dd`.
 * Everything here is a server component except the embedded notes editor.
 *
 * Cards render only what the data supports. A block with no data behind it
 * (no HR curve, too little history for a comparison, no logged sets) is
 * left out rather than filled in.
 */

// ---------------------------------------------------------------------------
// Signals — amber tiles: a number, what it is, what it's read against
// ---------------------------------------------------------------------------

interface SignalTile {
  key: string;
  value: string;
  unit?: string;
  k: string;
  txt: React.ReactNode;
}

const sign = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}H ${m}M` : `${m}M`;
}
function fmtMinLower(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function SignalsTiles({ s }: { s: DailySignals }) {
  const tiles: SignalTile[] = [];
  if (s.illness) {
    tiles.push({
      key: "illness",
      value: `+${s.illness.tempDev}`,
      unit: "°C",
      k: "Temp + night RHR · unusual together",
      txt: (
        <>
          Night RHR <b>+{s.illness.rhrDelta} bpm</b> alongside it. No verdict — if it persists a few nights,
          worth discussing with a clinician.
        </>
      ),
    });
  }
  if (s.revved) {
    tiles.push({
      key: "revved",
      value: `+${s.revved.pctAbove}%`,
      k: `Daytime HR · ${s.revved.hours}+ hours above your usual`,
      txt: <>A measurement, not a stress verdict — tonight&apos;s check-in will ask.</>,
    });
  }
  if (s.rhrDecomposition) {
    const d = s.rhrDecomposition;
    tiles.push({
      key: "rhr",
      value: sign(d.deltaBpm),
      unit: "bpm",
      k: "Night RHR · vs your median",
      txt:
        d.cycleBpm != null && d.phase ? (
          <>
            ~{sign(d.cycleBpm)} is typical for your {d.phase} phase, <b>{sign(d.unexplainedBpm)} unexplained</b>.
          </>
        ) : (
          <>No known component explains it yet.</>
        ),
    });
  }
  if (s.recovery) {
    tiles.push({
      key: "recovery",
      value: `DAY ${s.recovery.daysSinceHard}`,
      k: "After a hard session",
      txt: s.recovery.stillSuppressedTypical ? (
        <>
          For you, recovery typically lands around <b>day {s.recovery.typicalReturnDay}</b> (from {s.recovery.n} past
          sessions). Suppressed numbers today are expected.
        </>
      ) : (
        <>
          You&apos;re past your typical return point (<b>~day {s.recovery.typicalReturnDay}</b>).
        </>
      ),
    });
  }
  if (s.sleepDebt && s.sleepDebt.debtMin >= 45) {
    tiles.push({
      key: "debt",
      value: fmtMin(s.sleepDebt.debtMin),
      k: `Sleep debt · last ${s.sleepDebt.nights} nights`,
      txt: (
        <>
          vs your own median night of <b>{fmtMinLower(s.sleepDebt.needMin)}</b>.
        </>
      ),
    });
  }
  if (s.monotony && s.monotony.monotony >= 2) {
    tiles.push({
      key: "monotony",
      value: `${s.monotony.monotony}`,
      k: "Training monotony · this week",
      txt: <>Every day similar load. Population guidance flags &gt;2.0 — labeled prior, not your data.</>,
    });
  }
  if (tiles.length === 0) return null;
  return (
    <section className="panel signals">
      <div className="ph">
        <span className="ov">Signals · Yours only</span>
        <span className="note">
          Open recipes, your baselines only, no vendor scores. Empty lines don&apos;t render — most days this card is
          short.
        </span>
      </div>
      <div className="sigs" style={tiles.length === 1 ? { gridTemplateColumns: "1fr" } : undefined}>
        {tiles.map((t) => (
          <div className="sig" key={t.key}>
            <div className="v num">
              {t.value}
              {t.unit && <small> {t.unit}</small>}
            </div>
            <div>
              <div className="k">{t.k}</div>
              <div className="txt">{t.txt}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sleep — compact evidence card
// ---------------------------------------------------------------------------

interface SleepData {
  score: number | null;
  totalSleepDuration: number | null;
  remSleepDuration: number | null;
  deepSleepDuration: number | null;
  lightSleepDuration: number | null;
  sleepEfficiency: number | null;
  latency: number | null;
  averageHrv: number | null;
  lowestHeartRate: number | null;
}

function durUpper(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h === 0 ? `${m}M` : `${h}H ${m}M`;
}
function durLower(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

/** Same bands as SleepCard: 10–25 min healthy, 5–40 watch, outside = flag. */
function latencyColor(seconds: number): string {
  const min = seconds / 60;
  if (min >= 10 && min <= 25) return "var(--green)";
  if (min >= 5 && min <= 40) return "var(--amber)";
  return "var(--red)";
}
function scoreColor(score: number): string {
  return score >= 85 ? "var(--green)" : score >= 70 ? "var(--gold)" : "var(--red)";
}

export function SleepCompact({ sleep }: { sleep: SleepData | null }) {
  if (!sleep || (sleep.totalSleepDuration == null && sleep.score == null)) return null;
  const deep = sleep.deepSleepDuration ?? 0;
  const rem = sleep.remSleepDuration ?? 0;
  const light = sleep.lightSleepDuration ?? 0;
  const hasStages = deep + rem + light > 0;
  // Derived, not stored: time in bed = sleep / efficiency; awake = the rest minus latency.
  const awakeSec =
    sleep.totalSleepDuration != null && sleep.sleepEfficiency != null && sleep.sleepEfficiency > 0
      ? Math.max(0, Math.round(sleep.totalSleepDuration / (sleep.sleepEfficiency / 100) - sleep.totalSleepDuration - (sleep.latency ?? 0)))
      : null;
  const lc = sleep.latency != null ? latencyColor(sleep.latency) : null;
  return (
    <div className="panel tight sleep">
      <div className="ph" style={{ alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <span className="ov">Sleep</span>
          <div className="dur num">{sleep.totalSleepDuration != null ? durUpper(sleep.totalSleepDuration) : "—"}</div>
          <div className="sub">total time asleep</div>
        </div>
        {sleep.score != null && (
          <span
            className="scorebadge num"
            style={{ background: scoreColor(sleep.score), boxShadow: `0 0 22px -6px ${scoreColor(sleep.score)}` }}
          >
            {sleep.score}
          </span>
        )}
      </div>
      {sleep.latency != null && lc && (
        <div
          className="sm"
          style={{ borderTopColor: lc, background: `color-mix(in oklch, ${lc}, var(--surf) 90%)` }}
        >
          <span className="k">Latency</span>
          <span className="v num" style={{ color: lc }}>
            {Math.round(sleep.latency / 60)}M
          </span>
          <span className="t">TARGET 15–20M</span>
        </div>
      )}
      {hasStages && (
        <div className="stages">
          <div className="bar">
            <i className="deep" style={{ flex: deep }} />
            <i className="rem" style={{ flex: rem }} />
            <i className="light" style={{ flex: light }} />
          </div>
          <div className="leg">
            <span>DEEP <b>{durLower(deep)}</b></span>
            <span>REM <b>{durLower(rem)}</b></span>
            <span>LIGHT <b>{durLower(light)}</b></span>
          </div>
          <div className="note">
            Stage estimates are rough — rings misread stages by ±25–70 min vs lab measurement.
            {sleep.sleepEfficiency != null && <> Efficiency {sleep.sleepEfficiency}%.</>}
            {awakeSec != null && <> Est. awake time {durLower(awakeSec)}.</>}
          </div>
        </div>
      )}
      {(sleep.averageHrv != null || sleep.lowestHeartRate != null) && (
        <div className="recov">
          RECOVERY
          {sleep.averageHrv != null && <> · HRV <b>{sleep.averageHrv} ms</b></>}
          {sleep.lowestHeartRate != null && <> · LOW HR <b>{sleep.lowestHeartRate} bpm</b></>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workout card
// ---------------------------------------------------------------------------

const ZONES = [
  { id: "Z1", cls: "z1", lo: 0.5, hi: 0.6, color: "var(--blue)" },
  { id: "Z2", cls: "z2", lo: 0.6, hi: 0.7, color: "var(--green)" },
  { id: "Z3", cls: "z3", lo: 0.7, hi: 0.8, color: "var(--gold)" },
  { id: "Z4", cls: "z4", lo: 0.8, hi: 0.9, color: "oklch(0.74 0.17 55)" },
  { id: "Z5", cls: "z5", lo: 0.9, hi: 1.0, color: "var(--red)" },
] as const;

/** HR curve as zone-coloured runs of one continuous line (handoff reference).
 *  Without an observed max there are no zones, so the whole curve is red. */
function HrCurve({ pts, maxHr }: { pts: { bpm: number }[]; maxHr: number | null }) {
  const W = 600, H = 64, TOP = 6, BOTTOM = 58;
  const bpms = pts.map((p) => p.bpm);
  const lo = Math.min(...bpms), hi = Math.max(...bpms);
  const span = hi - lo || 1;
  const xy = pts.map((p, i) => ({
    x: (i / (pts.length - 1)) * W,
    y: BOTTOM - ((p.bpm - lo) / span) * (BOTTOM - TOP),
    z: maxHr ? zoneOf(p.bpm, maxHr) : 4,
  }));
  // Split into runs of the same zone; each run ends on the first point of the
  // next so the line stays unbroken.
  const runs: { z: number; from: number; to: number }[] = [];
  let start = 0;
  for (let i = 1; i <= xy.length; i++) {
    if (i === xy.length || xy[i].z !== xy[start].z) {
      runs.push({ z: xy[start].z, from: start, to: Math.min(i, xy.length - 1) });
      start = i;
    }
  }
  const f = (n: number) => n.toFixed(1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {runs.map((r, i) => {
        const seg = xy.slice(r.from, r.to + 1);
        if (seg.length < 2) return null;
        const line = seg.map((p, j) => `${j === 0 ? "M" : "L"}${f(p.x)} ${f(p.y)}`).join(" ");
        const color = ZONES[r.z].color;
        return (
          <g key={i}>
            <path d={`${line} L${f(seg[seg.length - 1].x)} ${H} L${f(seg[0].x)} ${H} Z`} fill={color} opacity={0.22} />
            <path d={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}

const VOLUME_PILL: Record<string, { cls: string; label: string }> = {
  below_mev: { cls: "r", label: "below MEV" },
  at_mev: { cls: "a", label: "at MEV" },
  in_mav: { cls: "g", label: "in MAV" },
  above_mav: { cls: "a", label: "above MAV" },
  at_mrv: { cls: "r", label: "at MRV" },
  above_mrv: { cls: "r", label: "above MRV" },
};

export interface DesktopWorkout {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  activeCalories: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
  distance: number | null;
  distanceUnit: string | null;
}

export function WorkoutCardDesktop({
  workout: w,
  tz,
  hrChart,
  zoneMaxHr,
  fuelLine,
  baseline,
  strength,
  weeklyRunKm,
  runDetail,
  runZones,
  route,
  single,
}: {
  workout: DesktopWorkout;
  tz: string;
  hrChart: { t: number; bpm: number }[];
  zoneMaxHr: number | null;
  fuelLine: string | null;
  baseline: WorkoutBaseline | null;
  strength: StrengthSummary | null;
  weeklyRunKm: number | null;
  /** Splits + walk breaks when the workout carries them (demo today; real
   *  users once the native sync walks HealthKit segments backwards). */
  runDetail?: RunDetail | null;
  /** Weekly run-volume landmarks from the profile; null → plain weekly km. */
  runZones?: RunZones | null;
  /** GPS route [[lat,lng],...] from the native module. Null → no map. */
  route?: [number, number][] | null;
  /** Only workout of the day → span both columns. */
  single?: boolean;
}) {
  const kind = workoutKind(w.name);
  const t = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  const hasCurve = hrChart.length > 1;
  const counts = [0, 0, 0, 0, 0];
  if (zoneMaxHr && hasCurve) for (const p of hrChart) counts[zoneOf(p.bpm, zoneMaxHr)]++;
  const km = toKm(w.distance, w.distanceUnit);
  const mins = Math.round(w.durationSeconds / 60);
  const durStr = mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  const coachHref = `/coach?workout=${encodeURIComponent(w.id)}&source=healthkit`;
  const toneCls = { ink: "", amber: " a", red: " r" } as const;

  return (
    <div className="panel wk" style={single ? { gridColumn: "1 / -1" } : undefined}>
      <div className="ph">
        <span className="ov">Workout</span>
        <span className="when">
          {t(w.startedAt)} – {t(w.endedAt)}
        </span>
      </div>
      <div className="ttl">{w.name.toUpperCase()}</div>

      {w.avgHeartRate != null && (
        <>
          <div className="k">Avg heart rate</div>
          <div className="hr">
            <div className="v num">
              {w.avgHeartRate}
              <small> bpm</small>
            </div>
            {w.minHeartRate != null && w.maxHeartRate != null && (
              <span className="rng">
                range <b>{w.minHeartRate}–{w.maxHeartRate}</b>
              </span>
            )}
          </div>
        </>
      )}
      {hasCurve && <HrCurve pts={hrChart} maxHr={zoneMaxHr} />}
      {zoneMaxHr && hasCurve && (
        <>
          <div className="zbar">
            {ZONES.map((z, i) => (counts[i] > 0 ? <i key={z.id} className={z.cls} style={{ flex: counts[i] }} /> : null))}
          </div>
          <div className="zleg">
            {ZONES.map((z, i) => (
              <span key={z.id}>
                <b className={z.cls}>{z.id}</b> {Math.round(z.lo * zoneMaxHr)}–{Math.round(z.hi * zoneMaxHr)} ·{" "}
                {Math.round((counts[i] / hrChart.length) * 100)}%
              </span>
            ))}
          </div>
          <div className="note">Zones vs your observed max ({zoneMaxHr} bpm), not an age formula.</div>
        </>
      )}

      {route && route.length >= 2 && <RouteMap route={route} />}

      {baseline && (
        <div className="vsb">
          <div className="k">vs your baseline · last 60 days · {baseline.n} sessions</div>
          <div className="vsg" style={{ gridTemplateColumns: `repeat(${baseline.stats.length}, 1fr)` }}>
            {baseline.stats.map((s) => (
              <div key={s.label}>
                <div className="k">{s.label}</div>
                <div className={`v num${toneCls[s.tone]}`}>
                  {s.value}
                  {s.unit && <small> {s.unit}</small>}
                </div>
                <div className="sub">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {baseline?.flag && (
        <div className="flag">
          <div>
            <div className="k">Did something happen?</div>
            <div className="txt">
              {baseline.flag.paceStr}/km at avg {baseline.flag.avgHr} bpm — <b>{baseline.flag.pctSlower}% slower</b>{" "}
              than your usual {baseline.flag.usualPaceStr}/km. Fill out your notes and discuss with coach.
            </div>
          </div>
          <div className="acts">
            <a href={`#notes-${w.id}`} className="btn ghost">
              Add notes
            </a>
            <Link href={coachHref} className="btn">
              Discuss with coach
            </Link>
          </div>
        </div>
      )}

      <div className="tiles">
        <div className="tile">
          <div className="k">Duration</div>
          <div className="v num">{durStr}</div>
        </div>
        {km != null && (
          <div className="tile">
            <div className="k">Distance</div>
            <div className="v num">
              {km.toFixed(2)}
              <small> km</small>
            </div>
          </div>
        )}
        <div className="tile">
          <div className="k">Active cal</div>
          <div className="v num">
            {w.activeCalories != null ? Math.round(w.activeCalories) : "—"}
            {w.activeCalories != null && <small> cal</small>}
          </div>
        </div>
      </div>

      {kind === "strength" && strength && (
        <div className="sess">
          <div className="k">What you did</div>
          <ul className="exl">
            {strength.exercises.map((e) => (
              <li key={e.name}>
                <span className="n">{e.name}</span>
                <span className="s num">{e.scheme}</span>
                <span className="w num">{e.load ?? "BW"}</span>
              </li>
            ))}
          </ul>
          {strength.weekly.length > 0 && (
            <>
              <div className="k" style={{ marginTop: 10 }}>
                Weekly volume · vs MEV / MAV / MRV
              </div>
              <div className="vol">
                {strength.weekly.map((v) => (
                  <span key={v.group} className={`pill ${VOLUME_PILL[v.status].cls}`}>
                    {v.group} {v.sets} · {VOLUME_PILL[v.status].label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {kind === "run" && km != null && (
        <div className="sess">
          <div className="k">What you did</div>
          <div className="ex">
            {runDetail?.walkBreakCount ? "Run with walk breaks" : "Steady run"} · {km.toFixed(2)} km at{" "}
            {fmtPace(w.durationSeconds / km)}/km
            {runDetail?.walkBreakCount ? (
              <>
                {" "}· {runDetail.walkBreakCount} walk {runDetail.walkBreakCount === 1 ? "break" : "breaks"}
                {runDetail.walkBreakSeconds != null && (
                  <> ({Math.floor(runDetail.walkBreakSeconds / 60)}m {runDetail.walkBreakSeconds % 60}s)</>
                )}
              </>
            ) : null}
            {runDetail?.splits && runDetail.splits.length > 0 && (
              <> · splits {runDetail.splits.map((s) => fmtPace(s)).join(" / ")}</>
            )}
          </div>
          {weeklyRunKm != null && (
            <>
              <div className="k" style={{ marginTop: 10 }}>
                Weekly run volume{runZones ? " · vs your MEV / MAV / MRV" : ""}
              </div>
              <div className="vol">
                {runZones ? (
                  <>
                    <span className={`pill ${VOLUME_PILL[runZones.status].cls}`}>
                      {weeklyRunKm} km · {VOLUME_PILL[runZones.status].label} ({
                        runZones.status === "below_mev" || runZones.status === "at_mev"
                          ? `${runZones.mev} km`
                          : runZones.status === "in_mav"
                            ? `${runZones.mav} km`
                            : `${runZones.mrv} km`
                      })
                    </span>
                    <span className="pill muted">
                      MAV {runZones.mav} km · MRV {runZones.mrv} km
                    </span>
                  </>
                ) : (
                  <span className="pill muted">{weeklyRunKm} km this week</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {fuelLine && (
        <div className="meta">
          <div>
            <div className="k">{kind === "run" ? "Pre-run fuel" : "Pre-workout fuel"}</div>
            <div className="txt">{fuelLine}</div>
          </div>
        </div>
      )}
      <div id={`notes-${w.id}`} style={{ scrollMarginTop: 24 }}>
        <WorkoutNotesBlock source="healthkit" workoutId={w.id} />
      </div>

      <div className="foot">
        <Link href={coachHref} className="more">
          Discuss with coach →
        </Link>
      </div>
    </div>
  );
}
