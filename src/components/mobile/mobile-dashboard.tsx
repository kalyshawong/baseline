import Link from "next/link";
import type { HrvBaselineSummary } from "@/lib/training-call";
import type { TrainingCall } from "@/lib/training";
import { SyncButton } from "@/components/dashboard/sync-button";

/**
 * Mobile "Today" screen — implements the Claude Design "Baseline iOS"
 * dashboard, bound to the SAME live data the desktop dashboard fetches.
 * Rendered only below the md breakpoint; desktop is untouched.
 *
 * Where the prototype showed flourishes that need data we don't fetch on
 * this page (the score sparkline + "vs 7-day avg" delta), those are omitted
 * rather than faked — the rest binds to real values.
 */

type SleepData = {
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

type ActivityData = {
  totalCalories: number | null;
  activeCalories: number | null;
  steps: number | null;
  highActivityTime: number | null;
  mediumActivityTime: number | null;
} | null;

type HyroxData = {
  raceDate: Date;
  targetTimeSeconds: number;
  context: { readiness: number | null; hrvCv: number | null };
  recommendation: { sessionType?: string; prescriptionNotes?: string | null; rationale?: string | null } | null;
} | null;

export type MobileDashboardProps = {
  viewDate: Date;
  isConnected: boolean;
  lastSyncIso: string | null;
  score: { overall: number; color: "green" | "yellow" | "red" } | null;
  scoreSeries: number[];
  scoreDelta: number | null;
  hrv: HrvBaselineSummary | null;
  call: TrainingCall | null;
  readiness: number | null;
  tempDeviationC: number | null;
  sleep: SleepData;
  hyrox: HyroxData;
  cyclePhase: string | null;
  cycleDayNumber: number | null;
  activity: ActivityData;
  caloriesIn: number | null;
  workoutRows: { time: string; name: string; detail: string }[];
  trainingCount: number;
  sleepTargetTime: string | null;
  mealCount: number;
  workoutSummary: string | null;
};

const STATUS_LABEL: Record<string, string> = { green: "Push", yellow: "Caution", red: "Recover" };
const TONE: Record<string, string> = { green: "green", yellow: "", red: "red" };
const TYPICAL_LOW_MS = 30;

function hm(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}H ${m}M`;
}
function hmShort(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
function clock(seconds: number | null): string {
  if (seconds == null) return "—";
  return `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}`;
}
function sparkPoints(series: number[]): string {
  if (series.length < 2) return "";
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const w = 120, h = 40, pad = 4;
  return series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function MobileDashboard(p: MobileDashboardProps) {
  const dateLabel = p.viewDate
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase()
    .replace(",", " ·");
  const lastSyncLabel = p.lastSyncIso
    ? new Date(p.lastSyncIso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  // baseline reference (Your Normal)
  const belowFloor = p.hrv ? p.hrv.meanMs < TYPICAL_LOW_MS : false;
  const pctBelow = p.hrv ? Math.round(((TYPICAL_LOW_MS - p.hrv.meanMs) / TYPICAL_LOW_MS) * 100) : 0;

  // sleep stage flex weights from real durations
  const deepS = p.sleep?.deepSleepDuration ?? 0;
  const remS = p.sleep?.remSleepDuration ?? 0;
  const lightS = p.sleep?.lightSleepDuration ?? 0;

  // hyrox
  const daysToRace = p.hyrox
    ? Math.max(0, Math.ceil((p.hyrox.raceDate.getTime() - p.viewDate.getTime()) / 86_400_000))
    : null;
  const targetMin = p.hyrox ? Math.round(p.hyrox.targetTimeSeconds / 60) : null;

  // activity
  const activeTimeMin = p.activity
    ? Math.round(((p.activity.highActivityTime ?? 0) + (p.activity.mediumActivityTime ?? 0)) / 60)
    : null;

  // calories
  const calOut = p.activity?.totalCalories ?? null;
  const calNet = p.caloriesIn != null && calOut != null ? p.caloriesIn - calOut : null;

  return (
    <div className="bl-m">
      {/* brand + date / sync */}
      <div className="brandbar">
        <div className="brand">BASELINE</div>
        <Link href="/goals" className="iconbtn" aria-label="Goals">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </Link>
      </div>

      <div className="datestrip">
        <div className="datenav">
          <span className="d">{dateLabel}</span>
        </div>
        {p.isConnected ? (
          <SyncButton />
        ) : (
          <a href="/api/auth/oura" className="syncbtn">Connect</a>
        )}
      </div>
      {lastSyncLabel && (
        <div className="wrap" style={{ marginTop: 6 }}>
          <span className="ov">Last sync {lastSyncLabel}</span>
        </div>
      )}

      <div className="wrap" style={{ marginTop: 12 }}>
        <div className="stack-lg">

          {/* Baseline score */}
          {p.score && (
            <div className="blcard">
              <div className="bltop">
                <span className="ov">Baseline Score</span>
                <span className={`pill ${TONE[p.score.color] === "green" ? "g" : TONE[p.score.color] === "red" ? "muted" : "a"}`}>
                  {STATUS_LABEL[p.score.color] ?? "Standard"}
                </span>
              </div>
              <div className="blmain">
                <div className="blscore num">{p.score.overall}</div>
                <div className="blside">
                  {p.scoreDelta != null && (
                    <div className="bldelta num" style={p.scoreDelta < 0 ? { color: "var(--red)" } : undefined}>
                      {p.scoreDelta >= 0 ? "▲" : "▼"} {Math.abs(p.scoreDelta)} <span>vs 7-day avg</span>
                    </div>
                  )}
                  {p.scoreSeries.length >= 2 && (
                    <div className="blspark">
                      <svg viewBox="0 0 120 40" preserveAspectRatio="none">
                        <polyline points={sparkPoints(p.scoreSeries)} fill="none" stroke="var(--gold)" strokeWidth={2.5} />
                      </svg>
                    </div>
                  )}
                  {p.scoreDelta != null && (
                    <div className="blnote">
                      {p.scoreDelta > 1 ? "Trending up" : p.scoreDelta < -1 ? "Trending down" : "Holding steady"}
                    </div>
                  )}
                </div>
              </div>
              <div className="blfoot">
                {p.readiness != null && <>READINESS <b>{p.readiness}</b> · </>}
                {p.sleep?.score != null && <>SLEEP <b>{p.sleep.score}</b> · </>}
                {p.hrv && <>HRV <b>{p.hrv.meanMs} ms</b></>}
              </div>
            </div>
          )}

          {/* Your Normal */}
          {p.hrv && (
            <div className="normcard">
              <div className="nh">
                <span className="ov">Your Baseline</span>
                <span className="normpill">Your Normal</span>
              </div>
              <div className="nstat">
                <div className="nval"><b className="num">{p.hrv.meanMs}</b><span className="u">ms HRV</span></div>
                <div className="nrange">your range <b className="num">{p.hrv.minMs}–{p.hrv.maxMs} ms</b> · {p.hrv.nNights} nights</div>
              </div>
              {belowFloor && (
                <div className="ndesc">
                  <b>≈{TYPICAL_LOW_MS - p.hrv.meanMs} ms ({pctBelow}%) below</b> the typical adult floor — reference range ~30–60 ms (population prior, not your data).
                </div>
              )}
              {p.hrv.avgSleepSeconds != null && (
                <>
                  <div className="ndiv" />
                  <div className="nstat">
                    <div className="nval"><b className="num">{hm(p.hrv.avgSleepSeconds)}</b><span className="u">avg sleep</span></div>
                    <div className="nrange">over {p.hrv.nNights} nights</div>
                  </div>
                </>
              )}
              <div className="nfoot">That low HRV is your set-point, not a deficit. Baseline reads your day-to-day against these numbers, not a population average.</div>
            </div>
          )}

          {/* Today's Call */}
          {p.call && (
            <div className={`call ${TONE[p.call.color]}`}>
              <div className="top">
                <span className="ov">Today&apos;s Call</span>
                <span className="statusflag">{STATUS_LABEL[p.call.color] ?? "Standard"}</span>
              </div>
              <div className="verdict disp">{p.call.verdict.toUpperCase()}</div>
              <div className="read">{p.call.whyLine}</div>
              <div className="rec">{p.call.actionLine}</div>
            </div>
          )}

          {/* Readiness + Sleep mini row */}
          {(p.readiness != null || p.sleep?.totalSleepDuration != null) && (
            <div className="row2">
              <div className="scard g"><span className="ov">Readiness</span><div className="n num">{p.readiness ?? "—"}</div></div>
              <div className="scard"><span className="ov">Sleep</span><div className="n num">{clock(p.sleep?.totalSleepDuration ?? null)}<small> h:m</small></div></div>
            </div>
          )}

          {/* Hyrox taper countdown */}
          {p.hyrox && daysToRace != null && (
            <div className="cd">
              <span className="ov">Hyrox · Taper</span>
              <div className="big num">{daysToRace}</div>
              <div className="lbl">days to race</div>
              <div className="meta">
                {p.hyrox.raceDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
                {targetMin != null && <> · TARGET SUB-{targetMin}</>}
              </div>
            </div>
          )}

          {/* Today's session */}
          {p.hyrox?.recommendation?.sessionType && (
            <div className="panel sess">
              <span className="ov">Today&apos;s Session</span>
              <div className="t">{p.hyrox.recommendation.sessionType.replace(/_/g, " ").toUpperCase()}</div>
              {(p.hyrox.recommendation.prescriptionNotes || p.hyrox.recommendation.rationale) && (
                <div className="d">{p.hyrox.recommendation.prescriptionNotes || p.hyrox.recommendation.rationale}</div>
              )}
              <div className="chips">
                {daysToRace != null && <span className="chip"><b>{daysToRace}D</b> TO RACE</span>}
                {p.hyrox.context.readiness != null && <span className="chip">RDY <b>{p.hyrox.context.readiness}</b></span>}
                {p.hyrox.context.hrvCv != null && <span className="chip">HRV CV <b>{p.hyrox.context.hrvCv.toFixed(1)}%</b></span>}
              </div>
            </div>
          )}

          {/* Cycle + Calories row */}
          <div className="row2">
            {p.cyclePhase && (
              <div className="panel cyc">
                <div className="ph"><span className="ov">Cycle</span></div>
                <div className="state"><span className="d" />{p.cyclePhase.toUpperCase()}</div>
                <div className="two">
                  {p.cycleDayNumber != null && <div><div className="k">Day</div><div className="v num">{p.cycleDayNumber}</div></div>}
                  {p.tempDeviationC != null && <div><div className="k">Temp</div><div className="v num blue">{p.tempDeviationC > 0 ? "+" : "−"}{Math.abs(p.tempDeviationC).toFixed(2)}°</div></div>}
                </div>
              </div>
            )}
            {(p.caloriesIn != null || calOut != null) && (
              <div className="panel">
                <div className="ph"><span className="ov">Calories</span></div>
                <div className="cal3">
                  <div className="c"><div className="k">In</div><div className="v in num">{p.caloriesIn != null ? Math.round(p.caloriesIn) : "—"}</div></div>
                  <div className="c"><div className="k">Out</div><div className="v out num">{calOut != null ? Math.round(calOut) : "—"}</div></div>
                  <div className="c"><div className="k">Net</div><div className="v net num">{calNet != null ? (calNet > 0 ? "+" : "−") + Math.abs(Math.round(calNet)) : "—"}</div></div>
                </div>
                {calNet != null && <div className="calbar">{calNet < 0 ? "Deficit" : "Surplus"} {Math.abs(Math.round(calNet))} kcal</div>}
              </div>
            )}
          </div>

          {/* Activity */}
          {p.activity && (
            <div className="panel">
              <div className="ph"><span className="ov">Activity</span></div>
              <div className="a4">
                <div><div className="k">Total Burn</div><div className="v num">{p.activity.totalCalories ?? "—"}<small> cal</small></div></div>
                <div><div className="k">Active</div><div className="v num">{p.activity.activeCalories ?? "—"}<small> cal</small></div></div>
                <div><div className="k">Steps</div><div className="v num">{p.activity.steps != null ? p.activity.steps.toLocaleString() : "—"}</div></div>
                <div><div className="k">Active Time</div><div className="v num">{activeTimeMin ?? "—"}<small> m</small></div></div>
              </div>
            </div>
          )}

          {/* Sleep detail */}
          {p.sleep?.totalSleepDuration != null && (
            <div className="panel sleep">
              <div className="ph" style={{ alignItems: "flex-start" }}>
                <div><span className="ov">Sleep</span><div className="dur num">{hm(p.sleep.totalSleepDuration)}</div><div className="subt">total time asleep</div></div>
                {p.sleep.score != null && <div className="scorebadge num">{p.sleep.score}</div>}
              </div>
              {(deepS > 0 || remS > 0 || lightS > 0) && (
                <div className="stages">
                  <div className="bar">
                    <i className="deep" style={{ flex: deepS || 1 }} />
                    <i className="rem" style={{ flex: remS || 1 }} />
                    <i className="light" style={{ flex: lightS || 1 }} />
                  </div>
                  <div className="leg">
                    <span>DEEP <b>{hmShort(deepS)}</b></span>
                    <span>REM <b>{hmShort(remS)}</b></span>
                    <span>LIGHT <b>{hmShort(lightS)}</b></span>
                  </div>
                </div>
              )}
              <div className="recov">
                RECOVERY · {p.sleep.averageHrv != null && <>HRV <b>{p.sleep.averageHrv} ms</b></>}
                {p.sleep.lowestHeartRate != null && <> · LOW HR <b>{p.sleep.lowestHeartRate} bpm</b></>}
              </div>
            </div>
          )}

          {/* Workout */}
          <div className="panel wk">
            <span className="ov">Workout</span>
            {p.workoutRows.length === 0 ? (
              <div className="none">No workout synced today yet.</div>
            ) : (
              <>
                {p.trainingCount === 0 && <div className="none">No training workout — just ambient activity.</div>}
                {p.workoutRows.map((w, i) => (
                  <div className="logrow" key={i}>
                    <span className="tm">{w.time}</span>
                    <span className="dt"><b>{w.name}</b> · {w.detail}</span>
                  </div>
                ))}
              </>
            )}
            <Link href="/body/workout/new" className="more">+ Log a workout</Link>
          </div>

          {/* Actions */}
          <div className="stack">
            <Link href="/mind" className="act"><b>LOG FOOD</b><span className="ar">→</span></Link>
            <Link href="/body/workout/new" className="act"><b>LOG WORKOUT</b><span className="ar">→</span></Link>
            <Link href="/coach" className="act"><b>OPEN COACH</b><span className="ar">→</span></Link>
          </div>

          {/* Tonight */}
          {(p.sleepTargetTime || p.workoutSummary || p.mealCount > 0) && (
            <div className="tonight">
              <div className="l">{p.sleepTargetTime ? <>SLEEP TARGET <b>{p.sleepTargetTime}</b></> : "TONIGHT"}</div>
              <div className="r">{[p.workoutSummary, p.mealCount > 0 ? `${p.mealCount} meals` : null].filter(Boolean).join(" · ")}</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
