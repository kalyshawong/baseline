import Link from "next/link";
import { Suspense } from "react";
import { MobileDateNav } from "@/components/mobile/mobile-date-nav";
import { fmtMin, type LifterToday as TodayData } from "@/lib/strength/today";

/**
 * Today, lifter version — design_handoff_baseline_ios_strength, screen 3.
 * Call card (Push / Hold / Deload per muscle on deck) · What made the call
 * (four inputs vs own normal, no HRV) · Start · Morning / Evening / Block links.
 */

const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");

export function LifterToday({ data, dateLabel, blockLabel }: { data: TodayData; dateLabel: string; blockLabel?: string }) {
  const d = data;
  const sessionLabel = d.template ?? "First session";
  const cu = (kg: number) => (d.unit === "lb" ? kg * 2.2046226218 : kg);
  return (
    <div className="bl-m">
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
        <Suspense fallback={<div className="datenav"><span className="d">{dateLabel}</span></div>}>
          <MobileDateNav basePath="/" />
        </Suspense>
        <span className="st-phase">Strength</span>
      </div>

      <div className="wrap" style={{ marginTop: 14 }}><div className="stack-lg">
        <section className={`st-call${d.anyPush ? "" : " nopush"}`}>
          <div className="hd"><span className="ov">Today&apos;s call</span><span className="sess">{sessionLabel}</span></div>
          {d.muscles.length ? d.muscles.map((m) => (
            <div className="st-mrow" key={m.id}>
              <div>
                <div className="mn">{m.name}</div>
                <div className="ms">
                  {m.sets} sets this week{m.band ? ` · your band ${m.band[0]}–${m.band[2]}` : ""}{m.sore != null ? ` · soreness ${m.sore}` : ""}
                </div>
              </div>
              <div className={`vd ${m.verdict.toLowerCase()}`}>{m.verdict}</div>
            </div>
          )) : (
            <div className="st-mrow"><div><div className="mn">No session on deck</div><div className="ms">Log your first session and the next one gets a call per muscle.</div></div></div>
          )}
          <div className="st-legend">
            <span><b className="push">Push</b>add load or a set vs last session</span>
            <span><b className="hold">Hold</b>repeat last session</span>
            <span><b className="deload">Deload</b>half the sets, −10% load</span>
          </div>
        </section>

        <section className="panel">
          <div className="ph"><span className="ov">What made the call</span><span className="st-k">vs your 60-day normal</span></div>
          <div className="st-in">
            <div className="b">
              <div className="l">Sleep last night</div>
              <div className="v num">{d.sleep.minutes != null ? fmtMin(d.sleep.minutes) : "—"}<small>{d.sleep.normalMinutes != null ? `your ${fmtMin(d.sleep.normalMinutes)}` : "normal after 14 nights"}</small></div>
              <div className="c">{d.sleep.score != null ? `Garmin sleep score ${d.sleep.score} · context` : d.sleep.source ? `From ${d.sleep.source}` : "No sleep data for last night"}</div>
            </div>
            <span className={`ef ${d.sleep.effect.tone}`}>{d.sleep.effect.text}</span>
          </div>
          <div className="st-in">
            <div className="b">
              <div className="l">Resting HR</div>
              <div className="v num">{d.rhr.value ?? "—"}<small>{d.rhr.value != null ? "bpm" : ""}{d.rhr.normal != null ? ` · your ${Math.round(d.rhr.normal)}` : ""}</small></div>
              <div className="c">{d.rhr.source ? `Overnight, from ${d.rhr.source}` : "No resting HR for last night"}</div>
            </div>
            <span className={`ef ${d.rhr.effect.tone}`}>{d.rhr.effect.text}</span>
          </div>
          <div className="st-in">
            <div className="b">
              <div className="l">Soreness · last check-in</div>
              {d.soreness.present && d.soreness.lines.length ? (
                <div className="v">{d.soreness.lines[0]}<small>{d.soreness.lines.slice(1).join(" · ").toLowerCase()}</small></div>
              ) : (
                <div className="c" style={{ marginTop: 4 }}>{d.soreness.present ? "Nothing sore in today's muscles" : "No check-in last night — soreness left out of today's call"}</div>
              )}
            </div>
            <span className={`ef ${d.soreness.effect.tone}`}>{d.soreness.effect.text}</span>
          </div>
          <div className="st-in">
            <div className="b">
              <div className="l">Sets this week vs your band</div>
              <div className="v num">{d.volume.headline}<small>{d.volume.sub}</small></div>
              {d.muscles.length > 1 ? <div className="c">{d.muscles.slice(1).map((m) => `${m.name} ${m.sets}${m.band ? ` of ${m.band[0]}–${m.band[2]}` : ""}`).join(" · ")}</div> : null}
            </div>
            <span className={`ef ${d.volume.effect.tone}`}>{d.volume.effect.text}</span>
          </div>
        </section>

        {d.loggedToday ? (
          <Link href={`/body/workout/${d.loggedToday.id}`} className="st-start done">
            <span className="t">{d.loggedToday.template ?? "Session"} logged</span>
            <span className="s">{d.loggedToday.sets} sets{d.loggedToday.minutes ? ` · ${d.loggedToday.minutes} min` : ""} · View session</span>
          </Link>
        ) : (
          <Link href={d.template ? `/body/session?template=${encodeURIComponent(d.template)}` : "/body/session"} className="st-start">
            <span className="t">Start {d.template ?? "session"}</span>
            <span className="s">{d.template ? `${d.exercises} exercises · ${d.sets} sets${d.lastDurationMin ? ` · last time ${d.lastDurationMin} min` : ""}` : "Add exercises as you go · today becomes the reference"}</span>
          </Link>
        )}

        <div className="st-links">
          <Link href="/body/checkin?mode=morning" className={`st-link${d.weight?.today ? " done" : ""}`}>
            <span className="k">Morning</span><span className="t">Weigh in</span>
            <span className="s">{d.weight ? `${d.weight.today ? "Today" : "Last"} ${f1(cu(d.weight.latestKg))} ${d.unit}${d.weight.avg7 != null ? ` · 7-day avg ${f1(cu(d.weight.avg7))}` : ""}` : "No weigh-ins yet"}</span>
          </Link>
          <Link href="/body/checkin?mode=evening" className={`st-link${d.eveningDone ? " done" : ""}`}>
            <span className="k">Evening</span><span className="t">Check-in</span>
            <span className="s">{d.eveningDone ? "Logged tonight" : "Session RPE · soreness · protein · tags"}</span>
          </Link>
          <Link href="/body/block" className="st-link">
            <span className="k">Block</span><span className="t">{blockLabel ?? "This block"}</span>
            <span className="s">Volume ramp and deload signals</span>
          </Link>
        </div>
      </div></div>
    </div>
  );
}
