import Link from "next/link";
import { redirect } from "next/navigation";
import { getIntakeStatus } from "@/lib/intake";
import { blockData } from "@/lib/strength/block";
import "@/app/strength.css";

export const dynamic = "force-dynamic";

const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");

/** /body/block — Block view (strength mode, screen 5). Pushed screen: ‹ Body back link, tab bar stays. */
export default async function BlockPage() {
  const { needsOnboarding } = await getIntakeStatus();
  if (needsOnboarding) redirect("/onboarding");
  const b = await blockData();

  return (
    <div className="bl-m">
      <Link href="/body" className="st-back">‹ Body</Link>
      {!b ? (
        <>
          <div className="appbar" style={{ paddingTop: 0 }}><div><h1>BLOCK</h1><div className="sub">No sessions yet</div></div></div>
          <div className="wrap"><div className="panel"><div className="st-dnote" style={{ margin: 0 }}>Your first block starts with your first logged session and runs until you take 7+ days off.</div></div></div>
        </>
      ) : (
        <>
          <div className="appbar" style={{ paddingTop: 0 }}>
            <div><h1>BLOCK {b.number}</h1><div className="sub">Since {b.start} · week {b.currentWeek}</div></div>
          </div>
          <div className="wrap"><div className="stack-lg">
            <div className="panel">
              <div className="ph"><span className="ov">Week</span><span className="st-k">Week {b.currentWeek} · {b.daysLeftInWeek === 1 ? "ends today" : `${b.daysLeftInWeek} days left`}</span></div>
              <div className="st-wk">
                {b.weeks.map((w) => <span key={w.index} className={w.state === "cur" ? "cur" : "done"}>{w.label}</span>)}
              </div>
              {(() => {
                const mx = Math.max(1, ...b.weeks.map((w) => Math.max(w.prev ?? 0, w.done + w.today)));
                return (
                  <div className="st-ramp">
                    {b.weeks.map((w) => {
                      const top = Math.max(w.prev ?? 0, w.done + w.today);
                      const H = (top / mx) * 96;
                      const donePct = top ? (w.done / top) * 100 : 0;
                      const todayPct = top ? (w.today / top) * 100 : 0;
                      return (
                        <div key={w.index} className={`c ${w.state === "cur" ? "cur" : ""}`}>
                          <span className="n num">
                            {w.done}{w.today ? `+${w.today}` : ""}
                            <small>{w.prev != null ? `vs ${w.prev}` : "sets"}</small>
                          </span>
                          <span className="bx" style={{ height: `${Math.max(4, H)}px`, borderStyle: w.prev != null ? "dashed" : "solid", borderColor: w.prev != null ? undefined : "transparent" }}>
                            <i style={{ height: `${donePct}%` }} />
                            {w.today ? <em style={{ bottom: `${donePct}%`, height: `${todayPct}%` }} /> : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="st-blegend" style={{ margin: "12px 0 0" }}>
                <span><i style={{ border: "1px dashed var(--faint)" }} />Previous week&apos;s sets</span>
                <span><i style={{ background: "var(--dim)" }} />Done</span>
                <span><i style={{ background: "repeating-linear-gradient(0deg,var(--gold) 0 3px,transparent 3px 5px)" }} />Today so far</span>
              </div>
              <div className="st-dnote">Blocks are read from your log: a new one starts after 7+ days off. Last 6 weeks shown.</div>
            </div>

            <div className="panel">
              <div className="ph"><span className="ov">Fatigue signals</span><span className="st-k">vs your normal</span></div>
              {b.signals.map((s) => (
                <div key={s.name} className={`st-sig${s.met ? " met" : ""}`}>
                  <span className="m" />
                  <span className="n">{s.name}<span>{s.rule}</span></span>
                  <span className="v">{s.value}</span>
                </div>
              ))}
              <div className="st-dlv">
                <b className="num">{b.metCount}/3</b>
                <span>{b.metCount === 0 ? "None of the three are up right now." : `${b.metCount} of 3 up right now.`}</span>
              </div>
            </div>

            <div className="panel">
              <div className="ph"><span className="ov">e1RM since {b.start}</span></div>
              <div className="st-gar">
                {b.lifts.map((l) => (
                  <div key={l.name} className="c">
                    <span className="k">{l.name}</span>
                    <span className={`v num${l.delta != null && l.delta > 0 ? " st-g" : l.delta != null && l.delta < 0 ? " st-a" : ""}`}>
                      {l.delta != null ? `${l.delta > 0 ? "+" : ""}${f1(l.delta)}` : l.now != null ? f1(l.now) : "—"}<small> kg</small>
                    </span>
                    <span className="t">{l.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div></div>
        </>
      )}
    </div>
  );
}
