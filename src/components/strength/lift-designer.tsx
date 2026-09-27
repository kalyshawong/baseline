"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { VARS, LIFT_OPTIONS, dstr, nextMonday, outcomeLabel, type LiftName, type Outcome } from "@/lib/strength/experiments-config";

/**
 * Experiment designer for lifters — design_handoff_baseline_ios_strength,
 * screen 6. Three steps + review, built from .tagchip / .seg / .panel.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function LiftDesigner({ runningVariables, liftSessions, chainEnd }: { runningVariables: string[]; liftSessions: Record<LiftName, number>; chainEnd: string | null }) {
  const router = useRouter();
  const firstFree = VARS.find((v) => !runningVariables.includes(v.id)) ?? VARS[0];
  const [vId, setV] = useState(firstFree.id);
  const [o, setO] = useState<Outcome>("vol");
  const [rpe, setRpe] = useState<7 | 8 | 9>(8);
  const firstLift = (LIFT_OPTIONS.find((l) => liftSessions[l] >= 4) ?? "Bench") as LiftName;
  const [lift, setLift] = useState<LiftName>(firstLift);
  const v = VARS.find((x) => x.id === vId) ?? VARS[0];
  const [len, setLen] = useState<number>(v.len[0]);
  const [n, setN] = useState<4 | 6 | 8>(6);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const blockLen = v.len.includes(len) ? len : v.len[0];

  const { start, end, wks } = useMemo(() => {
    const wks = n * blockLen;
    const s = chainEnd ? nextMonday(new Date(`${chainEnd}T00:00:00Z`)) : nextMonday(new Date());
    const e = new Date(s.getTime() + (wks * 7 - 1) * 86400_000);
    return { start: iso(s), end: iso(e), wks };
  }, [chainEnd, n, blockLen]);

  const disabledLifts = LIFT_OPTIONS.filter((l) => liftSessions[l] < 4);

  const queue = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/strength/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ variable: vId, outcome: o, rpe, lift, blockWeeks: blockLen, blocks: n }) });
      const j = (await res.json()) as { error?: string; start?: string };
      if (!res.ok) throw new Error(j.error ?? "Couldn't queue");
      setMsg(`Queued · starts ${dstr(j.start ?? start)}`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't queue");
    } finally { setBusy(false); }
  };

  return (
    <div className="panel">
      <div className="st-dstep"><i>1</i>Variable</div>
      <div className="chips">
        {VARS.map((x) => {
          const running = runningVariables.includes(x.id);
          return (
            <button key={x.id} type="button" className={`tagchip${x.id === vId ? " on" : ""}`} disabled={running} style={running ? { opacity: 0.45 } : undefined} onClick={() => { setV(x.id); setLen(x.len[0]); }}>
              {x.n}{running ? <small> Running</small> : null}
            </button>
          );
        })}
      </div>
      <div className="st-arms"><div><b>A</b>{v.A}</div><div><b>B</b>{v.B}</div></div>
      {v.note ? <div className="st-dnote">{v.note}</div> : null}

      <div className="st-dstep"><i>2</i>Outcome</div>
      <div className="seg c2">
        <div className={`opt${o === "vol" ? " on" : ""}`} onClick={() => setO("vol")}>Volume at RPE</div>
        <div className={`opt${o === "e1" ? " on" : ""}`} onClick={() => setO("e1")}>Estimated 1RM</div>
      </div>
      <div className="st-dnote">{o === "vol" ? "Load × reps on your top set at the prescribed RPE." : "From your top sets, RIR-adjusted."}</div>
      {o === "vol" ? (
        <div className="seg c3" style={{ marginTop: 10 }}>
          {([7, 8, 9] as const).map((r) => <div key={r} className={`opt${rpe === r ? " on" : ""}`} onClick={() => setRpe(r)}>RPE {r}</div>)}
        </div>
      ) : null}
      <div className="chips" style={{ marginTop: 10 }}>
        {LIFT_OPTIONS.map((l) => {
          const off = liftSessions[l] < 4;
          return <button key={l} type="button" className={`tagchip${lift === l ? " on" : ""}`} disabled={off} style={off ? { opacity: 0.45 } : undefined} onClick={() => setLift(l)}>{l}</button>;
        })}
      </div>
      {disabledLifts.length ? (
        <div className="st-dnote">
          {disabledLifts.map((l) => <span key={l}><b>{l}</b> is off: {liftSessions[l] === 0 ? "not logged" : `logged ${liftSessions[l] === 1 ? "once" : liftSessions[l] === 2 ? "twice" : `${liftSessions[l]} times`}`} in 8 weeks. </span>)}
          Pick a lift you train every week.
        </div>
      ) : null}

      <div className="st-dstep"><i>3</i>Randomized blocks</div>
      <div className="seg c2">
        {v.len.map((l) => <div key={l} className={`opt${blockLen === l ? " on" : ""}`} onClick={() => setLen(l)}>{l}-week blocks</div>)}
      </div>
      <div className="seg c3" style={{ marginTop: 6 }}>
        {([4, 6, 8] as const).map((k) => <div key={k} className={`opt${n === k ? " on" : ""}`} onClick={() => setN(k)}>{k} blocks</div>)}
      </div>
      <div className="st-dnote">Blocks are drawn in balanced pairs (AB or BA). Each block&apos;s arm is revealed on its first Monday.</div>

      <div className="st-review">
        <b>{v.n}:</b> {v.A} vs {v.B} → <b>{outcomeLabel({ outcome: o, rpe, lift })}</b>. {n} × {blockLen}-week blocks, {wks} weeks, {dstr(start)} – {dstr(end)}.
        {chainEnd ? " Starts after the running experiment ends." : ""} No interim results; the answer unlocks {dstr(end)}.
      </div>
      <button type="button" className="btn block" style={{ marginTop: 14, minHeight: 54 }} disabled={busy || liftSessions[lift] < 4} onClick={() => void queue()}>{busy ? "Queuing…" : "Queue experiment"}</button>
      {msg ? <div className="st-dnote">{msg}</div> : null}
    </div>
  );
}
