import Link from "next/link";
import type { LifterBodyData, LiftTrend, SorenessMap, SoreTileId } from "@/lib/strength/body";
import { SORE_TILES, TILES_BACK, TILES_FRONT } from "@/lib/strength/body";

/**
 * Lifter Body tab — design_handoff_baseline_ios_strength, screen 2, as drawn.
 * Weekly sets vs band · e1RM 12 weeks · Soreness map · Fatigue · Garmin context.
 * Server component; all numbers come from src/lib/strength/body.ts.
 */

const pc = (v: number) => `${(Math.min(v, 24) / 24) * 100}%`;
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");

function Spark({ d }: { d: number[] }) {
  const mn = Math.min(...d), mx = Math.max(...d), rg = mx - mn || 1;
  const pts = d.map((v, i) => `${((i / (d.length - 1)) * 120).toFixed(1)},${(30 - ((v - mn) / rg) * 26).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 120 34" preserveAspectRatio="none">
      <polyline fill="none" stroke="var(--gold)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" points={pts} />
    </svg>
  );
}

function E1Tile({ l }: { l: LiftTrend }) {
  if (!l.series) {
    return (
      <div className="mcard st-e1 empty">
        <div className="k">{l.name}</div>
        <div className="v">Not enough data</div>
        <div className="t">{l.empty}</div>
      </div>
    );
  }
  const d = l.series[11] - l.series[0];
  return (
    <div className="mcard st-e1">
      <div className="k">{l.name}</div>
      <div className="v num">{f1(l.series[11])}<small> kg</small></div>
      <div className="t">{d > 0 ? <><b>+{f1(d)}</b> in 12 wks</> : <>Flat · {d >= 0 ? "+" : ""}{f1(d)} in 12 wks</>}</div>
      <Spark d={l.series} />
    </div>
  );
}

export function SorenessFigure({ cap, tiles, levels, editable, picked }: { cap: string; tiles: [SoreTileId, number, number, number, number][]; levels: SorenessMap["levels"]; editable?: boolean; picked?: string | null }) {
  const meta = Object.fromEntries(SORE_TILES.map((t) => [t.id, t]));
  return (
    <div className="st-fig">
      <div className="cap">{cap}</div>
      <div className="st-fg">
        {tiles.map((x, i) => {
          const v = levels[x[0]] ?? 0;
          return (
            <button
              key={i}
              type="button"
              className={`st-tile s${v}${editable && picked === x[0] ? " pick" : ""}`}
              data-m={x[0]}
              style={{ gridColumn: `${x[1]} / span ${x[2]}`, gridRow: `${x[3]} / span ${x[4]}` }}
              tabIndex={editable ? 0 : -1}
              aria-label={`${meta[x[0]].n} soreness ${v}`}
            >
              {meta[x[0]].a}<b>{v}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SorenessLegend() {
  return (
    <div className="st-slegend">
      <span><i />0 None</span>
      <span><i style={{ background: "color-mix(in oklch,var(--amber) 30%,var(--surf2))" }} />1 Mild</span>
      <span><i style={{ background: "color-mix(in oklch,var(--amber) 62%,var(--surf2))" }} />2 Moderate</span>
      <span><i style={{ background: "var(--red)" }} />3 Severe</span>
    </div>
  );
}

export function LifterBody({ data, blockHref }: { data: LifterBodyData; blockHref?: string }) {
  const { bands, weeksLogged, lifts, soreness, fatigue, garmin } = data;
  const fvColor = fatigue.state === "Fresh" ? "var(--green)" : fatigue.state === "High" ? "var(--red)" : "var(--amber)";
  const lastCheck = soreness.lastLoggedAt
    ? soreness.lastLoggedAt.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
    : "No check-in yet";
  const anySore = Object.values(soreness.levels).some((v) => v > 0);

  return (
    <>
      <div className="g-sec">Weekly sets vs your band</div>
      <div className="wrap"><div className="panel">
        <div className="st-blegend">
          <span><i style={{ background: "color-mix(in oklch,var(--blue),transparent 70%)" }} />Your band · min–max</span>
          <span><i style={{ width: 2, background: "var(--blue)" }} />Adaptive</span>
          <span><i style={{ height: 5, background: "var(--green)" }} />This week</span>
          <span><i style={{ height: 5, background: "repeating-linear-gradient(90deg,var(--gold) 0 3px,transparent 3px 5px)" }} />Today&apos;s plan</span>
        </div>
        <div>
          {bands.map((m) => {
            if (!m.band) {
              return (
                <div className="st-band" key={m.id}>
                  <span className="n">{m.name}</span>
                  <span className="emp">{m.sets === 0 ? `No ${m.name.toLowerCase()} sets logged` : m.empty}</span>
                  <span className="v num">{m.sets}<small> sets</small></span>
                </div>
              );
            }
            const st = m.sets < m.band[0] ? "low" : m.sets > m.band[2] ? "over" : "in";
            return (
              <div className={`st-band ${st}`} key={m.id}>
                <span className="n">{m.name}</span>
                <span className="st-track">
                  <i className="bd" style={{ left: pc(m.band[0]), width: pc(m.band[2] - m.band[0]) }} />
                  <i className="ad" style={{ left: pc(m.band[1]) }} />
                  <i className="cur" style={{ width: pc(m.sets) }} />
                  {m.today ? <i className="td" style={{ left: pc(m.sets), width: pc(m.today) }} /> : null}
                </span>
                <span className="v num">{m.sets}<small> / {m.band[0]}–{m.band[2]}</small></span>
              </div>
            );
          })}
        </div>
        <div className="st-scale"><span /><div><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div><span /></div>
        <div className="st-dnote">
          {weeksLogged >= 6
            ? "Bands learned from your last 14 weeks of logged sets and how you recovered from them."
            : `Textbook bands until 6 weeks of your sets are logged · ${weeksLogged} of 6 weeks.`}
        </div>
      </div></div>

      <div className="g-sec">Estimated 1RM · 12 weeks</div>
      <div className="wrap"><div className="mgrid">{lifts.map((l) => <E1Tile key={l.name} l={l} />)}</div></div>

      <div className="g-sec">Soreness</div>
      <div className="wrap"><div className="panel" style={{ paddingLeft: 12, paddingRight: 12 }}>
        <div className="ph"><span className="ov">Last check-in</span><span className="st-k">{lastCheck}</span></div>
        <div className="st-map">
          <SorenessFigure cap="Front" tiles={TILES_FRONT} levels={soreness.levels} />
          <SorenessFigure cap="Back" tiles={TILES_BACK} levels={soreness.levels} />
        </div>
        <SorenessLegend />
        {!anySore && !soreness.lastLoggedAt ? <div className="st-dnote" style={{ textAlign: "center" }}>Soreness comes from the evening check-in.</div> : null}
      </div></div>

      <div className="g-sec">Fatigue</div>
      <div className="wrap"><div className="panel">
        <div className="ph"><span className="ov">Baseline signal</span><span className="st-k">{fatigue.inputs} of 3 inputs</span></div>
        <div className="st-fv" style={{ color: fvColor }}>{fatigue.state}</div>
        <div className="st-gauge">
          <span className="on1" />
          <span className={fatigue.state === "Building" || fatigue.state === "High" ? "on2" : ""} />
          <span className={fatigue.state === "High" ? "on3" : ""} />
        </div>
        <div className="st-gl">
          <span className={fatigue.state === "Fresh" ? "on" : ""} style={fatigue.state === "Fresh" ? { color: "var(--green)" } : undefined}>Fresh</span>
          <span className={fatigue.state === "Building" ? "on" : ""}>Building</span>
          <span className={fatigue.state === "High" ? "on" : ""} style={fatigue.state === "High" ? { color: "var(--red)" } : undefined}>High</span>
        </div>
        <div className="st-kv" style={{ marginTop: 12 }}>
          <span className="n">Resting HR · 7-day avg<span>{fatigue.rhrNormal != null ? `Your 60-day normal ${f1(fatigue.rhrNormal)}` : "Normal needs 14 days of resting HR"}</span></span>
          <span className="v num">
            {fatigue.rhr7 != null ? f1(fatigue.rhr7) : "—"}
            {fatigue.rhr7 != null && fatigue.rhrNormal != null ? <small className={fatigue.rhr7 - fatigue.rhrNormal >= 2 ? "st-a" : ""}>{fatigue.rhr7 - fatigue.rhrNormal >= 0 ? "+" : ""}{f1(fatigue.rhr7 - fatigue.rhrNormal)}</small> : null}
          </span>
        </div>
        <div className="st-kv">
          <span className="n">Bench reps at RPE 8<span>{fatigue.benchNote}</span></span>
          <span className={`v ${fatigue.benchReps === "Down" ? "st-a" : ""}`}>{fatigue.benchReps ?? "—"}</span>
        </div>
        <div className="st-kv">
          <span className="n">Muscles at soreness 2+ for 48 h<span>{fatigue.sore48.length ? fatigue.sore48.join(" · ") : "None"}</span></span>
          <span className={`v num ${fatigue.sore48.length >= 2 ? "st-a" : ""}`}>{fatigue.sore48.length}</span>
        </div>
      </div></div>

      {garmin ? (
        <>
          <div className="g-sec">Garmin</div>
          <div className="wrap"><div className="panel">
            <div className="ph"><span className="ov">{garmin.day === new Date().toISOString().slice(0, 10) ? "Last night" : garmin.day}</span><span className="st-src">Context</span></div>
            <div className="st-gar">
              <div className="c"><span className="k">Body Battery</span><span className="v num">{garmin.bodyBattery ?? "—"}</span><span className="t">Garmin model · context</span></div>
              <div className="c"><span className="k">Sleep score</span><span className="v num">{garmin.sleepScore ?? "—"}</span><span className="t">Garmin model · context</span></div>
              <div className="c"><span className="k">Resting HR</span><span className="v num">{garmin.restingHr ?? "—"}{garmin.restingHr != null ? <small> bpm</small> : null}</span><span className="t">{garmin.rhrNormal != null ? `Your normal ${Math.round(garmin.rhrNormal)}` : "Normal after 14 days"}</span></div>
            </div>
          </div></div>
        </>
      ) : null}

      {blockHref ? (
        <div className="wrap" style={{ marginTop: 14 }}>
          <Link href={blockHref} className="st-link"><span className="k">Block</span><span className="t">This block</span><span className="s">Volume ramp and deload signals</span></Link>
        </div>
      ) : null}
    </>
  );
}
