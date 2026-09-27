import { LiftDesigner } from "@/components/strength/lift-designer";
import { liftExperiments, liftSessionCounts, type RunningLift } from "@/lib/strength/experiments";
import { dstr, VARS } from "@/lib/strength/experiments-config";

/**
 * Mind · Experiments for lifters — design_handoff_baseline_ios_strength,
 * screen 6. Running card (green rule, block pips, this block's arm, sessions
 * on protocol, lock box) + queued + finished verdicts + the designer.
 */

const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");

function RunningCard({ x }: { x: RunningLift }) {
  const n = x.blocks.length;
  const cur = x.current;
  return (
    <article className="st-xa" style={x.status === "scheduled" ? { borderLeftColor: "var(--blue)", backgroundImage: "none" } : undefined}>
      <div className="ey">
        <span className={`pill ${x.status === "active" ? "g" : ""}`}>{x.status === "active" ? "Running" : "Queued"}</span>
        <span className="st-k">{x.status === "active" ? `Block ${cur + 1} of ${n}` : `Starts ${dstr(x.startsIn ?? x.blocks[0].start)}`}</span>
      </div>
      <h3>{x.title}</h3>
      <div className="o">Outcome · {x.outcome}</div>
      <div className="st-pips" style={n !== 6 ? { gridTemplateColumns: `repeat(${n},1fr)` } : undefined}>
        {x.blocks.map((b) => (
          <span key={b.idx} className={b.idx < cur ? "done" : b.idx === cur ? "cur" : ""}>{b.idx + 1}<b>{b.idx <= cur ? b.arm : "?"}</b></span>
        ))}
      </div>
      {x.status === "active" && x.arm ? (
        <>
          <div className="st-kv" style={{ marginTop: 14 }}><span className="n">This block<span>{x.armText}{x.restSeconds != null ? " on every set · rest timer set for you" : ""}</span></span><span className="v">{x.arm}</span></div>
          <div className="st-kv"><span className="n">Sessions on protocol<span>This block</span></span><span className="v num">{x.sessionsThisBlock}/{x.sessionsNeeded}</span></div>
        </>
      ) : null}
      <div className="st-lock">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="10" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        <span>Results unlock {dstr(x.unlock)}, after block {n}. No interim numbers are shown.</span>
      </div>
    </article>
  );
}

function FinishedCard({ x }: { x: RunningLift }) {
  const r = x.result;
  const dec = r?.decision === "effect_found" ? "Effect found" : r?.decision === "no_effect" ? "No effect at this size" : "Inconclusive";
  return (
    <div className="panel">
      <div className="ph"><span className="ov">Finished · {dstr(x.unlock)}</span><span className="st-k">{r ? `${r.pairs} pairs` : ""}</span></div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{x.title}</div>
      <div className="st-kv" style={{ marginTop: 8 }}>
        <span className="n">{dec}<span>{x.outcome}</span></span>
        <span className={`v num ${r && r.decision === "effect_found" ? (r.meanDiff > 0 ? "st-g" : "st-a") : ""}`}>{r ? `${r.meanDiff > 0 ? "+" : ""}${f1(r.meanDiff)}` : "—"}{r?.pctDiff != null ? <small>{r.pctDiff > 0 ? "+" : ""}{f1(r.pctDiff)}%</small> : null}</span>
      </div>
      {r ? <div className="st-dnote">B − A per pair · sign-permutation p = {r.p.toFixed(3)}{r.pairs < 3 ? " · fewer than 3 usable pairs" : ""}</div> : null}
    </div>
  );
}

export async function LiftExperiments() {
  const [{ running, queued, finished }, liftSessions] = await Promise.all([liftExperiments(), liftSessionCounts()]);
  const chain = [running, ...queued].filter((x): x is RunningLift => !!x);
  const runningVariables = chain.map((x) => VARS.find((v) => x.title.startsWith(v.n))?.id).filter((x): x is string => !!x);
  const chainEnd = chain.length ? chain[chain.length - 1].blocks.slice(-1)[0].end : null;
  return (
    <>
      <div className="g-sec">{running?.status === "active" ? "Running" : "Experiments"}</div>
      <div className="wrap"><div className="stack-lg">
        {running ? <RunningCard x={running} /> : (
          <div className="panel"><div className="st-dnote" style={{ margin: 0 }}>Nothing running. One blocked experiment runs at a time; design one below and it starts next Monday.</div></div>
        )}
        {queued.map((x) => <RunningCard key={x.id} x={x} />)}
        {finished.map((x) => <FinishedCard key={x.id} x={x} />)}
      </div></div>
      <div className="g-sec">Design an experiment</div>
      <div className="wrap"><LiftDesigner runningVariables={runningVariables} liftSessions={liftSessions} chainEnd={chainEnd} /></div>
    </>
  );
}
