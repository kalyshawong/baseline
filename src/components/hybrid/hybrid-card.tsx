import Link from "next/link";
import type { LifterToday } from "@/lib/strength/today";
import type { HybridToday } from "@/lib/hybrid";
import { HybridGap } from "@/components/hybrid/hybrid-gap";
import { HybridSwap } from "@/components/hybrid/hybrid-swap";

/**
 * Hybrid mode (runs AND lifts) on the mobile Today — built 2026-09-28 from
 * existing strength-mode classes; layout/styling pending her Claude Design pass.
 *
 * Lifting (data only) · run/legs conflict: facts → flag → "consider a swap?"
 * yes/no (no changes nothing) · swap progress ·
 * the one gap question.
 */
export function HybridCard({ lift, hybrid }: { lift: LifterToday; hybrid: HybridToday }) {
  const c = hybrid.conflict;
  const tone = hybrid.level === "facts" ? "eq" : "dn";
  return (
    <>
      {hybrid.gap && <HybridGap start={hybrid.gap.start} end={hybrid.gap.end} />}

      <section className="st-call nopush">
        <div className="hd"><span className="ov">Lifting · next up</span><span className="sess">{lift.template ?? "First session"}</span></div>
        {lift.muscles.length ? lift.muscles.map((m) => (
          <div className="st-mrow" key={m.id}>
            <div>
              <div className="mn">{m.name}</div>
              <div className="ms">{m.sets} sets this week{m.band ? ` · your band ${m.band[0]}–${m.band[2]}` : ""}{m.sore != null ? ` · soreness ${m.sore}` : ""}</div>
            </div>
          </div>
        )) : (
          <div className="st-mrow"><div><div className="mn">No session on deck</div><div className="ms">Log a lifting session and the next one gets a call per muscle.</div></div></div>
        )}
      </section>

      <section className="panel">
        <div className="ph"><span className="ov">Run + lift</span></div>
        {c ? (
          <>
            <div className="st-in">
              <div className="b">
                <div className="l">Today</div>
                <div className="c" style={{ marginTop: 4 }}>{c.facts}</div>
                {hybrid.level !== "facts" || c.proof.proven ? <div className="c">{c.proof.line}</div> : null}
              </div>
              <span className={`ef ${tone}`}>{hybrid.level === "facts" ? "Facts" : "Conflict"}</span>
            </div>
            {c.swap && c.decision !== "no" && (
              <div className="st-in">
                <div className="b">
                  <div className="l">{c.decision === "yes" ? "Swapped" : "Consider a swap?"}</div>
                  <div className="c" style={{ marginTop: 4 }}>{c.swap}</div>
                  {c.decision == null && <HybridSwap kind={c.kind} swap={c.swap} />}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="st-in"><div className="b"><div className="c">No run and legs within two days of each other.</div></div></div>
        )}
        {hybrid.level !== "swap" && (
          <div className="st-in">
            <div className="b">
              <div className="l">Swap suggestions</div>
              <div className="c">
                After {hybrid.needed} consistent weeks · {Math.min(hybrid.streak, hybrid.needed)} of {hybrid.needed}
                {hybrid.pausedWeeks ? ` · ${hybrid.pausedWeeks} travel week${hybrid.pausedWeeks > 1 ? "s" : ""} paused` : ""}
              </div>
              <div className="c">A week counts with a run, a lift and 5 logged days.</div>
            </div>
          </div>
        )}
      </section>

      {lift.loggedToday ? (
        <Link href={`/body/workout/${lift.loggedToday.id}`} className="st-start done">
          <span className="t">{lift.loggedToday.template ?? "Session"} logged</span>
          <span className="s">{lift.loggedToday.sets} sets{lift.loggedToday.minutes ? ` · ${lift.loggedToday.minutes} min` : ""} · View session</span>
        </Link>
      ) : (
        <Link href={lift.template ? `/body/session?template=${encodeURIComponent(lift.template)}` : "/body/session"} className="st-start">
          <span className="t">Start {lift.template ?? "lifting session"}</span>
          <span className="s">{lift.template ? `${lift.exercises} exercises · ${lift.sets} sets` : "Add exercises as you go"}</span>
        </Link>
      )}
    </>
  );
}
