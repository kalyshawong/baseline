"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LibraryExercise, MuscleBand, PlanExercise, SessionPlan, SetTriple } from "@/lib/strength/session-plan";

/**
 * In-session log — design_handoff_baseline_ios_strength, screen 1 (+ summary).
 * Ported from baseline-strength.js: same states, same copy, same tap flow.
 * Everything you tap sits in the bottom dock; the top half is for reading.
 *
 * Persistence: the session row is created on the first logged set; each set
 * is POSTed as it is logged (PATCHed when edited); Finish PATCHes
 * completedAt/durationMin. In-progress state is mirrored to localStorage so
 * an app switch mid-set loses nothing.
 */

interface LiveSet {
  id?: string; // server id once logged
  load: number;
  reps: number;
  rir: number | null;
  done: boolean;
  last: SetTriple | null;
}
interface LiveEx extends PlanExercise {
  sets: LiveSet[];
  sel: number | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const f1 = (n: number) => r1(n).toFixed(1).replace(/\.0$/, "");
const e1 = (l: number, r: number, rir: number | null) => l * (1 + (r + (rir ?? 0)) / 30);
const mmss = (s: number) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${("0" + (s % 60)).slice(-2)}`;
};
const REST_DEFAULT = 120;
const STORE_KEY = "bl_strength_session";
const MAIN_RE = /bench press|squat|deadlift|overhead press/i;

function initEx(ex: PlanExercise): LiveEx {
  const plan = ex.plan.length ? ex.plan : [[20, 10], [20, 10], [20, 10]];
  return {
    ...ex,
    sets: plan.map((p, i) => ({ load: p[0], reps: p[1], rir: null, done: false, last: ex.last ? ex.last[i] ?? null : null })),
    sel: null,
  };
}

function countDone(exs: LiveEx[]): [number, number] {
  let d = 0, t = 0;
  exs.forEach((e) => e.sets.forEach((s) => { t++; if (s.done) d++; }));
  return [d, t];
}

function bestE1(sets: (SetTriple | LiveSet)[] | null): number {
  let b = 0;
  (sets ?? []).forEach((s) => {
    if (Array.isArray(s)) b = Math.max(b, e1(s[0], s[1], s[2]));
    else if (s.done) b = Math.max(b, e1(s.load, s.reps, s.rir));
  });
  return b;
}

export function SessionLog({ plan, restSeconds = REST_DEFAULT, restNote }: { plan: SessionPlan; restSeconds?: number; restNote?: string }) {
  const router = useRouter();
  const [exs, setExs] = useState<LiveEx[]>(() => plan.exercises.map(initEx));
  const [exIdx, setExIdx] = useState(0);
  const [unit, setUnit] = useState<"RIR" | "RPE">("RIR");
  const [load, setLoad] = useState(0);
  const [reps, setReps] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [t0, setT0] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState(restSeconds);
  const [view, setView] = useState<"log" | "summary">("log");
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockH, setDockH] = useState(260);
  const toastTimer = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);

  const ex: LiveEx | undefined = exs[exIdx];
  const curIdx = useCallback((e: LiveEx) => {
    if (e.sel != null) return e.sel;
    for (let k = 0; k < e.sets.length; k++) if (!e.sets[k].done) return k;
    return -1;
  }, []);
  const i = ex ? curIdx(ex) : -1;

  // Working values follow the active set.
  useEffect(() => {
    if (!ex || i < 0) return;
    setLoad(ex.sets[i].load);
    setReps(ex.sets[i].reps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exIdx, i]);

  // Clock for elapsed + rest.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  // Dock height → bottom padding.
  useEffect(() => {
    const m = () => setDockH(dockRef.current?.offsetHeight ?? 260);
    m();
    const id = window.setInterval(m, 500);
    return () => window.clearInterval(id);
  }, [view]);

  // Resume an in-progress session after an app switch / reload.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { sessionId: string | null; exs: LiveEx[]; exIdx: number; t0: number; template: string };
      if (saved.template === plan.templateName && saved.sessionId && Date.now() - saved.t0 < 6 * 3600_000) {
        sessionRef.current = saved.sessionId;
        setSessionId(saved.sessionId);
        setExs(saved.exs);
        setExIdx(saved.exIdx);
        setT0(saved.t0);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (view !== "log") return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ sessionId, exs, exIdx, t0, template: plan.templateName }));
    } catch {
      /* ignore */
    }
  }, [sessionId, exs, exIdx, t0, plan.templateName, view]);

  const showToast = (text: string, undo?: () => void) => {
    setToast({ text, undo });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  const rv = (rir: number | null) => {
    if (rir == null) return "";
    return unit === "RIR" ? (rir >= 4 ? "4+" : String(rir)) : rir >= 4 ? "≤6" : String(10 - rir);
  };

  /* ---------- persistence ---------- */
  const ensureSession = async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    const res = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateName: plan.templateName }),
    });
    if (!res.ok) throw new Error("Couldn't start the session on the server");
    const j = (await res.json()) as { id: string };
    sessionRef.current = j.id;
    setSessionId(j.id);
    return j.id;
  };

  const persistSet = async (exercise: LiveEx, setIndex: number, s: LiveSet): Promise<string | undefined> => {
    try {
      const sid = await ensureSession();
      if (s.id) {
        await fetch(`/api/workouts/${sid}/sets/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weight: s.load, reps: s.reps, rir: s.rir }),
        });
        return s.id;
      }
      const res = await fetch(`/api/workouts/${sid}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exerciseId: exercise.exerciseId, setNumber: setIndex + 1, weight: s.load, reps: s.reps, rir: s.rir }),
      });
      if (!res.ok) throw new Error("Set didn't save");
      const j = (await res.json()) as { id: string };
      return j.id;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
      return undefined;
    }
  };

  /* ---------- actions ---------- */
  const logSet = (rir: number) => {
    if (!ex || i < 0) return;
    const s = ex.sets[i];
    const was = s.done;
    const prev: LiveSet = { ...s };
    const next: LiveSet = { ...s, load, reps, rir, done: true };
    const k0 = exIdx, i0 = i;
    setExs((cur) => cur.map((e, k) => (k === k0 ? { ...e, sel: null, sets: e.sets.map((x, j) => (j === i0 ? next : x)) } : e)));
    if (!was) {
      setRestEnd(Date.now() + restSeconds * 1000);
      setRestTotal(restSeconds);
    }
    void persistSet(ex, i0, next).then((id) => {
      if (id) setExs((cur) => cur.map((e, k) => (k === k0 ? { ...e, sets: e.sets.map((x, j) => (j === i0 ? { ...x, id } : x)) } : e)));
    });
    showToast(`Set ${i0 + 1} · ${f1(load)} × ${reps} · ${unit} ${rv(rir)}`, () => {
      setExs((cur) => cur.map((e, k) => (k === k0 ? { ...e, sel: i0, sets: e.sets.map((x, j) => (j === i0 ? { ...prev, id: x.id } : x)) } : e)));
      if (!was) setRestEnd(null);
      if (prev.done) void persistSet(ex, i0, prev);
    });
  };

  const addSet = () => {
    if (!ex) return;
    const l = ex.sets[ex.sets.length - 1];
    const k0 = exIdx;
    setExs((cur) => cur.map((e, k) => (k === k0 ? { ...e, sel: null, sets: [...e.sets, { load: l?.load ?? 20, reps: l?.reps ?? 10, rir: null, done: false, last: null }] } : e)));
    showToast(`Set ${ex.sets.length + 1} added to ${ex.short}`);
  };

  const addExercise = (lib: LibraryExercise) => {
    const ls = lib.lastSet;
    const pe: PlanExercise = {
      exerciseId: lib.exerciseId,
      name: lib.name,
      short: lib.short,
      muscle: lib.muscle,
      main: MAIN_RE.test(lib.name),
      inc: lib.inc,
      lastDate: lib.lastDate,
      last: ls ? [ls, ls, ls] : null,
      plan: ls ? [[ls[0], ls[1]], [ls[0], ls[1]], [ls[0], ls[1]]] : [],
    };
    setExs((cur) => [...cur, initEx(pe)]);
    setExIdx(exs.length);
    setSheet(false);
    showToast(`${lib.name} added`);
  };

  const finish = async () => {
    setFinishing(true);
    setErr(null);
    try {
      const [d] = countDone(exs);
      if (d > 0) {
        const sid = await ensureSession();
        const res = await fetch(`/api/workouts/${sid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completedAt: new Date().toISOString(), durationMin: Math.max(1, Math.round((Date.now() - t0) / 60000)) }),
        });
        if (!res.ok) throw new Error("Couldn't mark the session complete");
      }
      setRestEnd(null);
      try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
      setView("summary");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't finish");
    } finally {
      setFinishing(false);
    }
  };

  const close = () => {
    router.push("/body");
    router.refresh();
  };

  /* ---------- derived ---------- */
  const elapsed = mmss((now - t0) / 1000);
  const restLeft = restEnd ? (restEnd - now) / 1000 : null;
  const restGo = restLeft != null && restLeft <= 0;
  const [dc0, dc1] = countDone(exs);
  const libFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plan.library.filter((x) => !q || x.name.toLowerCase().includes(q)).slice(0, 40);
  }, [plan.library, query]);

  if (view === "summary") {
    return <Summary plan={plan} exs={exs} unit={unit} rv={rv} minutes={Math.max(1, Math.round((now - t0) / 60000))} onDone={close} />;
  }

  if (!ex) {
    // No previous session and nothing added yet.
    return (
      <div className="st-screen">
        <div className="st-v on" style={{ paddingBottom: 40 }}>
          <Header title={plan.templateName} sub="No previous session · add your first exercise" onClose={close} unit={unit} onUnit={() => setUnit(unit === "RIR" ? "RPE" : "RIR")} onFinish={close} finishLabel="Close" />
          <div className="wrap">
            <div className="st-note">This is the first session of {plan.templateName}. Today&apos;s sets become the reference for next time.</div>
            <div className="st-addrow"><button onClick={() => { setQuery(""); setSheet(true); }}>+ Exercise</button><button disabled style={{ opacity: 0.4 }}>+ Set</button></div>
          </div>
        </div>
        {sheet && <Sheet query={query} setQuery={setQuery} items={libFiltered} onPick={addExercise} onClose={() => setSheet(false)} />}
      </div>
    );
  }

  const s = i >= 0 ? ex.sets[i] : null;
  const vals = unit === "RIR" ? ["0", "1", "2", "3", "4+"] : ["10", "9", "8", "7", "≤6"];
  const nx = exs[exIdx + 1];

  return (
    <div className="st-screen">
      <div className="st-v on" style={{ paddingBottom: dockH + 16 }}>
        <Header
          title={plan.templateName}
          sub={`${elapsed} · ${dc0} of ${dc1} sets`}
          onClose={close}
          unit={unit}
          onUnit={() => setUnit(unit === "RIR" ? "RPE" : "RIR")}
          onFinish={() => void finish()}
          finishing={finishing}
        />
        <div className="st-exstrip">
          {exs.map((e, k) => {
            const d = e.sets.filter((x) => x.done).length;
            return (
              <button key={e.exerciseId + k} className={`st-exc${k === exIdx ? " on" : ""}${d === e.sets.length ? " done" : ""}`} onClick={() => setExIdx(k)}>
                <b>{k + 1} · {e.short}</b>
                <span>{d} / {e.sets.length} sets</span>
              </button>
            );
          })}
        </div>
        <div className="wrap">
          <div className="st-exh">
            <div className="nm">{ex.name}</div>
            <div className="mt">
              <span>{muscleLabel(ex.muscle, plan.muscles)}</span>
              {ex.last ? <span>Last {ex.lastDate}</span> : <span>First time logged</span>}
              {ex.main && ex.last ? (() => {
                const lb = bestE1(ex.last);
                const tb = bestE1(ex.sets);
                return (
                  <>
                    <span>e1RM <b className="num">{f1(lb)}</b></span>
                    {tb > lb ? <span className="st-g">▲ {f1(tb)} today</span> : null}
                  </>
                );
              })() : null}
            </div>
          </div>
          <div className="st-sets">
            <div className="st-sh"><span>Set</span><span>{ex.last ? `Last · ${ex.lastDate}` : "Last"}</span><span>Today</span><span>{unit}</span></div>
            {!ex.last ? <div className="st-note">No previous session. Today&apos;s sets become the reference for next time.</div> : null}
            {ex.sets.map((st, k) => {
              const state = k === i ? "active" : st.done ? "done" : "next";
              const ld = k === i ? load : st.load;
              const rp = k === i ? reps : st.reps;
              return (
                <div key={k} className={`st-set ${state}${st.done && k === i ? " done" : ""}`} onClick={() => setExs((cur) => cur.map((e, j) => (j === exIdx ? { ...e, sel: k } : e)))}>
                  <span className="no">{k + 1}</span>
                  <span className="last">
                    {st.last ? (<>{f1(st.last[0])} × {st.last[1]}<i>{unit} {rv(st.last[2])}</i></>) : ex.last ? <span className="new">+1 set · push</span> : <span className="first">First time</span>}
                  </span>
                  <span className="now">{f1(ld)} × {rp}</span>
                  <span className="r">{st.done ? rv(st.rir) : ""}</span>
                </div>
              );
            })}
          </div>
          <div className="st-addrow">
            <button onClick={addSet}>+ Set</button>
            <button onClick={() => { setQuery(""); setSheet(true); }}>+ Exercise</button>
          </div>
          {err ? <p className="st-note" style={{ color: "var(--amber)" }}>{err} — your sets are kept on this phone; try again.</p> : null}
        </div>
      </div>

      <div className="st-dock" ref={dockRef}>
        {restLeft != null ? (
          <div className={`st-rest${restGo ? " go" : ""}`}>
            <div>
              <div className="ov">{restGo ? "Rest done" : "Rest"}</div>
              <div className="x">{restNote ?? `${mmss(restTotal)} rest`}</div>
            </div>
            <div className="tm num">{restGo ? "GO" : mmss(restLeft)}</div>
            <div className="b">
              <button onClick={() => setRestEnd((r) => (r ?? now) - 15000)}>−15</button>
              <button onClick={() => setRestEnd((r) => Math.max(r ?? now, now) + 15000)}>+15</button>
              <button onClick={() => setRestEnd(null)}>{restGo ? "Clear" : "Skip"}</button>
            </div>
            <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, (1 - restLeft / restTotal) * 100))}%` }} /></div>
          </div>
        ) : (
          <div className="st-rest idle">Rest timer starts when you log a set · {mmss(restSeconds)}{restNote ? ` · ${restNote}` : ""}</div>
        )}

        {s && i >= 0 ? (
          <>
            <div className="st-cap">
              <span><b>Set {i + 1}</b> · {ex.short}{s.done ? " · editing" : ""}</span>
              <span>{s.last ? `Last ${f1(s.last[0])} × ${s.last[1]} · ${unit} ${rv(s.last[2])}` : ex.last ? "New set today" : "No previous set"}</span>
            </div>
            <div className="st-steps">
              <div className="st-step">
                <button aria-label="Less weight" onClick={() => setLoad((l) => Math.max(0, r1(l - ex.inc)))}>−</button>
                <div className="v"><b>{f1(load)}</b><span>kg</span></div>
                <button aria-label="More weight" onClick={() => setLoad((l) => r1(l + ex.inc))}>+</button>
              </div>
              <div className="st-step">
                <button aria-label="Fewer reps" onClick={() => setReps((r) => Math.max(1, r - 1))}>−</button>
                <div className="v"><b>{reps}</b><span>reps</span></div>
                <button aria-label="More reps" onClick={() => setReps((r) => r + 1)}>+</button>
              </div>
            </div>
            <div className="st-rirk"><span>Tap {unit} to log set {i + 1}</span><span>{unit === "RIR" ? "reps left in the tank" : "how hard the set was"}</span></div>
            <div className="st-rir">
              {vals.map((v, k) => (
                <button key={v} className={s.done && s.rir === k ? "on" : ""} onClick={() => logSet(k)}>{v}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="st-cap"><span><b>{ex.short} done</b> · {ex.sets.length} sets</span><span>{dc0} of {dc1} session sets</span></div>
            {nx ? (
              <button className="st-next" onClick={() => setExIdx(exIdx + 1)}>Next · {nx.name} ›</button>
            ) : (
              <button className="st-next" onClick={() => void finish()} disabled={finishing}>{finishing ? "Saving…" : "Finish session ›"}</button>
            )}
          </>
        )}
      </div>

      {sheet && <Sheet query={query} setQuery={setQuery} items={libFiltered} onPick={addExercise} onClose={() => setSheet(false)} />}
      {toast ? (
        <div className="st-toast on" style={{ bottom: dockH + 10 }}>
          <span>{toast.text}</span>
          {toast.undo ? <button onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function muscleLabel(id: string, muscles: MuscleBand[]) {
  return muscles.find((m) => m.id === id)?.name ?? id;
}

function Header({ title, sub, onClose, unit, onUnit, onFinish, finishing, finishLabel = "Finish" }: { title: string; sub: string; onClose: () => void; unit: string; onUnit: () => void; onFinish: () => void; finishing?: boolean; finishLabel?: string }) {
  return (
    <div className="st-lh">
      <button className="iconbtn" aria-label="Close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="22" height="22"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div className="c"><div className="t">{title}</div><div className="s">{sub}</div></div>
      <button className="st-unit" onClick={onUnit}>{unit === "RIR" ? <><b>RIR</b> / RPE</> : <>RIR / <b>RPE</b></>}</button>
      <button className="btn" onClick={onFinish} disabled={finishing}>{finishLabel}</button>
    </div>
  );
}

function Sheet({ query, setQuery, items, onPick, onClose }: { query: string; setQuery: (q: string) => void; items: LibraryExercise[]; onPick: (l: LibraryExercise) => void; onClose: () => void }) {
  return (
    <div className="st-sheet on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="in">
        <div className="grab" />
        <h3>Add exercise</h3>
        <input className="field" placeholder="Search exercises" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 10 }} autoFocus />
        {items.length ? items.map((x) => (
          <button key={x.exerciseId} className="st-opt" onClick={() => onPick(x)}>
            <span><b>{x.name}</b><span>{x.muscle} · {x.lastSet ? `Last ${x.lastDate} · ${f1(x.lastSet[0])} × ${x.lastSet[1]}` : "No previous session"}</span></span>
            <i>+</i>
          </button>
        )) : <div className="st-dnote">No match. Exercises you log appear here.</div>}
      </div>
    </div>
  );
}

function Summary({ plan, exs, unit, rv, minutes, onDone }: { plan: SessionPlan; exs: LiveEx[]; unit: string; rv: (r: number | null) => string; minutes: number; onDone: () => void }) {
  let vol = 0, lvol = 0, topE = 0;
  let top: { ex: LiveEx; s: LiveSet } | null = null;
  const [d, t] = countDone(exs);
  exs.forEach((ex) => {
    ex.sets.forEach((s) => {
      if (!s.done) return;
      vol += s.load * s.reps;
      if (ex.main) { const v = e1(s.load, s.reps, s.rir); if (v > topE) { topE = v; top = { ex, s }; } }
    });
    ex.last?.forEach((l) => { lvol += l[0] * l[1]; });
  });
  const topSet = top as { ex: LiveEx; s: LiveSet } | null;
  const dv = lvol ? Math.round(((vol - lvol) / lvol) * 100) : null;
  const add: Record<string, number> = {};
  exs.forEach((ex) => { add[ex.muscle] = (add[ex.muscle] ?? 0) + ex.sets.filter((s) => s.done).length; });
  const mains = exs.filter((e) => e.main);
  const today = new Date();
  return (
    <div className="st-screen">
      <div className="st-v on" style={{ paddingBottom: 40 }}>
        <div className="st-lh"><div className="c"><div className="t">Session logged</div><div className="s">{plan.templateName} · {today.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div></div></div>
        <div className="wrap"><div className="stack-lg">
          <div className="mgrid">
            <div className="mcard"><div className="k">Volume</div><div className="v num">{Math.round(vol).toLocaleString("en-US")}<small> kg</small></div><div className={`t ${dv == null ? "" : dv >= 0 ? "st-g" : "st-a"}`}>{dv == null ? "First session of this template" : `${dv >= 0 ? "▲ " : "▼ "}${Math.abs(dv)}% vs ${plan.lastSessionDate}`}</div></div>
            <div className="mcard"><div className="k">Sets</div><div className="v num">{d}<small> / {t}</small></div><div className="t">{minutes} min{plan.lastDurationMin ? ` · last time ${plan.lastDurationMin}` : ""}</div></div>
          </div>
          <div className="panel"><div className="ph"><span className="ov">Top set</span></div>
            {topSet ? <div className="st-kv"><span className="n">{topSet.ex.name}<span>{unit} {rv(topSet.s.rir)}</span></span><span className="v num">{f1(topSet.s.load)} × {topSet.s.reps}</span></div> : <div className="st-dnote" style={{ margin: 0 }}>No main-lift sets logged in this session, so there is no top set.</div>}
          </div>
          <div className="panel"><div className="ph"><span className="ov">Estimated 1RM · vs last time</span></div>
            {mains.length === 0 ? <div className="st-dnote" style={{ margin: 0 }}>No main lifts in this session.</div> : null}
            {mains.map((ex) => {
              const lb = bestE1(ex.last);
              const done = ex.sets.filter((s) => s.done);
              const tb = bestE1(done);
              if (!done.length) return <div key={ex.exerciseId} className="st-kv"><span className="n">{ex.short}<span>No sets logged today</span></span><span className="v num">{f1(lb)}</span></div>;
              const dd = tb - lb;
              return <div key={ex.exerciseId} className="st-kv"><span className="n">{ex.short}<span>{ex.last ? `${f1(lb)} → ${f1(tb)} kg` : `${f1(tb)} kg · first reference`}</span></span><span className={`v num ${dd > 0 ? "st-g" : dd < 0 ? "st-a" : ""}`}>{ex.last ? `${dd > 0 ? "+" : ""}${f1(dd)}` : f1(tb)}<small style={{ color: "var(--faint)" }}>kg</small></span></div>;
            })}
          </div>
          <div className="panel"><div className="ph"><span className="ov">Weekly sets after today</span></div>
            {Object.keys(add).map((id) => {
              const m = plan.muscles.find((x) => x.id === id);
              if (!m?.band) return null;
              const tot = m.sets + add[id];
              const st = tot < m.band[0] ? ["Under your min", "st-a"] : tot > m.band[2] ? ["Over your max", "st-a"] : ["In your band", "st-g"];
              return <div key={id} className="st-kv"><span className="n">{m.name}<span>+{add[id]} today · band {m.band[0]}–{m.band[2]}</span></span><span className="v num">{tot}<small className={st[1]}>{st[0]}</small></span></div>;
            })}
            {Object.keys(add).every((id) => !plan.muscles.find((x) => x.id === id)?.band) ? <div className="st-dnote" style={{ margin: 0 }}>Bands appear once a few weeks of sets are logged.</div> : null}
          </div>
          <button className="btn block" onClick={onDone} style={{ minHeight: 54 }}>Done</button>
        </div></div>
      </div>
    </div>
  );
}
