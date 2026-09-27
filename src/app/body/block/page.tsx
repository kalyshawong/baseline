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
          <div className="wrap"><div className="panel"><div className="st-dnote" style={{ margin: 0 }}>Your first block starts with your first logged session. Five training weeks, then a deload week.</div></div></div>
        </>
      ) : (
        <>
          <div className="appbar" style={{ paddingTop: 0 }}>
            <div><h1>BLOCK {b.number}</h1><div className="sub">Hypertrophy · {b.start} – {b.end}</div></div>
          </div>
          <div className="wrap"><div className="stack-lg">
            <div className="panel">
              <div className="ph"><span className="ov">Week</span><span className="st-k">{b.currentWeek === 6 ? "Deload week" : `${b.currentWeek} of 5`} · {b.daysLeftInWeek === 1 ? "ends today" : `${b.daysLeftInWeek} days left`}</span></div>
              <div className="st-wk">
                {b.weeks.map((w) => <span key={w.index} className={w.state === "cur" ? "cur" : w.state === "done" ? "done" : w.state === "dl" ? "dl" : ""}>{w.label}</span>)}
              </div>
              {(() => {
                const mx = Math.max(1, ...b.weeks.map((w) => Math.max(w.plan ?? 0, (w.done ?? 0) + w.today)));
                return (
                  <div className="st-ramp">
                    {b.weeks.map((w) => {
                      const top = Math.max(w.plan ?? 0, (w.done ?? 0) + w.today);
                      const H = (top / mx) * 96;
                      const donePct = top ? ((w.done ?? 0) / top) * 100 : 0;
                      const todayPct = top ? (w.today / top) * 100 : 0;
                      return (
                        <div key={w.index} className={`c ${w.state === "cur" ? "cur" : w.state === "dl" ? "dl" : ""}`}>
                          <span className="n num">
                            {w.done != null ? <>{w.done}{w.today ? `+${w.today}` : ""}</> : w.plan ?? "—"}
                            <small>{w.done != null ? (w.plan != null ? `of ${w.plan}` : "sets") : w.plan != null ? "planned" : "next"}</small>
                          </span>
                          <span className="bx" style={{ height: `${Math.max(4, H)}px`, borderStyle: w.plan != null ? "dashed" : "solid", borderColor: w.plan != null ? undefined : "transparent" }}>
                            {w.done != null ? <i style={{ height: `${donePct}%` }} /> : null}
                            {w.today ? <em style={{ bottom: `${donePct}%`, height: `${todayPct}%` }} /> : null}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="st-blegend" style={{ margin: "12px 0 0" }}>
                <span><i style={{ border: "1px dashed var(--faint)" }} />Last week&apos;s sets</span>
                <span><i style={{ background: "var(--dim)" }} />Done</span>
                <span><i style={{ background: "repeating-linear-gradient(0deg,var(--gold) 0 3px,transparent 3px 5px)" }} />Today&apos;s plan</span>
              </div>
              <div className="st-dnote">Blocks are read from your log: a new one starts after 7+ days off or every 6 weeks. Deload = half of last week&apos;s sets.</div>
            </div>

            <div className="panel">
              <div className="ph"><span className="ov">Deload signals</span><span className="st-k">All 3 to suggest</span></div>
              {b.signals.map((s) => (
                <div key={s.name} className={`st-sig${s.met ? " met" : ""}`}>
                  <span className="m" />
                  <span className="n">{s.name}<span>{s.rule}</span></span>
                  <span className="v">{s.value}</span>
                </div>
              ))}
              <div className="st-dlv">
                <b className="num">{b.metCount}/3</b>
                <span>{b.metCount === 3 ? "All three line up. Baseline suggests moving the deload to this week: half the sets, −10% load." : "Deload stays in week 6. If all three line up first, Baseline suggests moving it forward."}</span>
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
