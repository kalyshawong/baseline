"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CheckinData } from "@/lib/strength/checkin";
import { levelToSeverity, SORE_TILES, TILES_BACK, TILES_FRONT, type SoreTileId } from "@/lib/strength/body";

/**
 * Lifter check-in — design_handoff_baseline_ios_strength, screen 4.
 * Morning / Evening segmented control. Evening: session RPE (5×2), editable
 * soreness map (tap steps 0→1→2→3→0), protein vs target, tags, Save.
 * Morning: weight stepper ±0.1, 7-day avg · rate · phase target, 28-day chart.
 */

const SL = ["None", "Mild", "Moderate", "Severe"];
const r1 = (n: number) => Math.round(n * 10) / 10;
const KG_LB = 2.2046226218;

export function CheckinScreen({ data, mode: initialMode }: { data: CheckinData; mode: "morning" | "evening" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"morning" | "evening">(initialMode);
  const [rpe, setRpe] = useState<number | null>(data.session?.rpe ?? null);
  const [sore, setSore] = useState<Record<string, number>>({ ...data.soreness });
  const [pick, setPick] = useState<string | null>(null);
  const [protein, setProtein] = useState<"yes" | "close" | "no" | null>(data.proteinAnswer);
  const [tags, setTags] = useState<Set<string>>(new Set(data.tagsToday));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const meta = useMemo(() => Object.fromEntries(SORE_TILES.map((t) => [t.id, t])), []);
  const dateLabel = new Date(`${data.dateStr}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  /* ---------- weight ---------- */
  const lastKg = data.todayKg ?? data.weights[data.weights.length - 1]?.kg ?? null;
  const [kg, setKg] = useState<number>(lastKg ?? 70);
  const isLb = data.unit === "lb";
  const disp = (k: number) => (isLb ? r1(k * KG_LB) : r1(k)).toFixed(1);
  const step = isLb ? 0.1 / KG_LB : 0.1;
  const series = useMemo(() => {
    const hist = data.weights.filter((w) => w.day !== data.dateStr).map((w) => w.kg);
    return [...hist, kg];
  }, [data.weights, data.dateStr, kg]);
  const avg7 = (a: number[], i: number) => { let s = 0, n = 0; for (let k = Math.max(0, i - 6); k <= i; k++) { s += a[k]; n++; } return s / n; };
  const a7 = avg7(series, series.length - 1);
  const a7prev = series.length > 7 ? avg7(series, series.length - 8) : null;
  const rate = a7prev != null ? a7 - a7prev : null; // kg per week (7 entries apart ≈ a week when logged daily)
  const corridor = data.goal === "gain" ? [0.25, 0.5] : data.goal === "lose" ? [-0.5, -0.25] : [-0.1, 0.1];
  const phaseLabel = data.goal === "gain" ? "Bulk target" : data.goal === "lose" ? "Cut target" : "Maintain";
  const cu = (v: number) => (isLb ? v * KG_LB : v);
  const rateOk = rate != null && rate >= corridor[0] && rate <= corridor[1];

  const chart = useMemo(() => {
    const W = 325, H = 120, n = Math.max(series.length, 2);
    const base = avg7(series, 0);
    const vals = series.slice();
    const corr = [base + (corridor[0] / 7) * (n - 1), base + (corridor[1] / 7) * (n - 1)];
    const mn = Math.min(...vals, base + Math.min(0, corr[0])) - 0.4, mx = Math.max(...vals, base + Math.max(0, corr[1] - base)) + 0.4;
    const X = (i: number) => 6 + (i / (n - 1)) * (W - 12);
    const Y = (v: number) => H - 6 - ((v - mn) / (mx - mn || 1)) * (H - 12);
    const lo: string[] = [], hi: string[] = [];
    for (let i = 0; i < n; i++) { lo.push(`${X(i)},${Y(base + (corridor[0] / 7) * i)}`); hi.unshift(`${X(i)},${Y(base + (corridor[1] / 7) * i)}`); }
    const dots = series.slice(0, -1).map((v, i) => ({ x: X(i), y: Y(v) }));
    const avgPts = series.map((v, i) => `${X(i)},${Y(avg7(series, i))}`).join(" ");
    const last = { x: X(n - 1), y: Y(series[series.length - 1]) };
    return { poly: lo.concat(hi).join(" "), dots, avgPts, last };
  }, [series, corridor]);

  /* ---------- soreness tap ---------- */
  const tap = (id: SoreTileId) => {
    setSore((s) => ({ ...s, [id]: ((s[id] ?? 0) + 1) % 4 }));
    setPick(id);
  };

  /* ---------- save ---------- */
  const post = async (url: string, body: unknown, method = "POST") => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res;
  };

  const saveEvening = async () => {
    setSaving(true); setErr(null);
    try {
      const jobs: Promise<unknown>[] = [];
      if (data.session && rpe != null && rpe !== data.session.rpe) jobs.push(post(`/api/workouts/${data.session.id}`, { sessionRPE: rpe }, "PATCH"));
      for (const t of SORE_TILES) {
        const now = sore[t.id] ?? 0, was = data.soreness[t.id] ?? 0;
        if (now === was) continue;
        jobs.push(now === 0 ? post("/api/soreness", { date: data.dateStr, bodyPart: t.id, clear: true }) : post("/api/soreness", { date: data.dateStr, bodyPart: t.id, severity: levelToSeverity(now) }));
      }
      if (protein && protein !== data.proteinAnswer) jobs.push(post("/api/tags", { tag: `protein ${protein}`, category: "nutrition", timestamp: new Date().toISOString() }));
      for (const t of tags) if (!data.tagsToday.includes(t)) jobs.push(post("/api/tags", { tag: t, category: data.tags.find((x) => x.tag === t)?.category ?? "custom", timestamp: new Date().toISOString() }));
      await Promise.all(jobs);
      setSaved("Check-in saved");
      router.refresh();
      setTimeout(() => router.push("/"), 600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally { setSaving(false); }
  };

  const saveWeight = async () => {
    setSaving(true); setErr(null);
    try {
      await post("/api/weight", { weightKg: r1(kg), date: data.dateStr });
      setSaved("Weight saved");
      router.refresh();
      setTimeout(() => router.push("/"), 600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally { setSaving(false); }
  };

  const Figure = ({ cap, tiles }: { cap: string; tiles: [SoreTileId, number, number, number, number][] }) => (
    <div className="st-fig">
      <div className="cap">{cap}</div>
      <div className="st-fg">
        {tiles.map((x, i) => {
          const v = sore[x[0]] ?? 0;
          return (
            <button key={i} type="button" className={`st-tile s${v}${pick === x[0] ? " pick" : ""}`} style={{ gridColumn: `${x[1]} / span ${x[2]}`, gridRow: `${x[3]} / span ${x[4]}` }} aria-label={`${meta[x[0]].n} soreness ${v}`} onClick={() => tap(x[0])}>
              {meta[x[0]].a}<b>{v}</b>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="st-screen bl-m">
      <div className="st-v on" style={{ paddingBottom: 40 }}>
        <div className="st-lh">
          <button className="iconbtn" aria-label="Close" onClick={() => router.push("/")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="22" height="22"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <div className="c"><div className="t">Check-in</div><div className="s">{dateLabel}</div></div>
        </div>
        <div className="wrap">
          <div className="seg c2">
            <div className={`opt${mode === "morning" ? " on" : ""}`} onClick={() => setMode("morning")}>Morning</div>
            <div className={`opt${mode === "evening" ? " on" : ""}`} onClick={() => setMode("evening")}>Evening</div>
          </div>
        </div>

        {mode === "evening" ? (
          <>
            <div className="g-sec">Session RPE{data.session ? ` · ${data.session.template ?? "Session"}` : ""}</div>
            <div className="wrap"><div className="panel">
              {data.session ? (
                <>
                  <div className="st-rpe">{Array.from({ length: 10 }, (_, i) => i + 1).map((i) => <button key={i} type="button" className={rpe === i ? "on" : ""} onClick={() => setRpe(i)}>{i}</button>)}</div>
                  <div className="st-rpel"><span>1 very easy</span><span>10 max effort</span></div>
                </>
              ) : (
                <div className="st-dnote" style={{ margin: 0 }}>No session logged today, so there is no session RPE to rate.</div>
              )}
            </div></div>

            <div className="g-sec">Soreness · tap a muscle</div>
            <div className="wrap"><div className="panel" style={{ paddingLeft: 12, paddingRight: 12 }}>
              <div className="st-map edit">
                <Figure cap="Front" tiles={TILES_FRONT} />
                <Figure cap="Back" tiles={TILES_BACK} />
              </div>
              <div className="st-readout">{pick ? <>{meta[pick].n} → <b>{sore[pick] ?? 0}</b> {SL[sore[pick] ?? 0]}</> : "Each tap steps 0 → 1 → 2 → 3 → 0"}</div>
            </div></div>

            <div className="g-sec">Protein</div>
            <div className="wrap"><div className="panel">
              <div className="st-sub" style={{ marginTop: 0 }}>{data.proteinTargetG ? `Did you hit your ${data.proteinTargetG} g target?` : "Did you hit your protein target? (log a weight to set one)"}</div>
              <div className="seg c3">
                {(["yes", "close", "no"] as const).map((v) => <div key={v} className={`opt${protein === v ? " on" : ""}`} onClick={() => setProtein(v)}>{v[0].toUpperCase() + v.slice(1)}</div>)}
              </div>
            </div></div>

            <div className="g-sec">Tags</div>
            <div className="wrap"><div className="panel">
              <div className="chips">
                {data.tags.map((t) => (
                  <button key={t.tag} type="button" className={`tagchip${tags.has(t.tag) ? " on" : ""}`} onClick={() => setTags((s) => { const n = new Set(s); if (n.has(t.tag)) n.delete(t.tag); else n.add(t.tag); return n; })}>{t.tag}</button>
                ))}
              </div>
            </div></div>

            <div className="wrap" style={{ marginTop: 20 }}>
              <button className="btn block" style={{ minHeight: 54 }} disabled={saving} onClick={() => void saveEvening()}>{saving ? "Saving…" : saved ?? "Save check-in"}</button>
              {err ? <div className="st-dnote" style={{ color: "var(--amber)" }}>{err}</div> : null}
            </div>
          </>
        ) : (
          <>
            <div className="g-sec">Body weight · on waking</div>
            <div className="wrap"><div className="panel">
              <div className="st-wt">
                <button type="button" aria-label="Less" onClick={() => setKg((k) => r1(k - step))}>−</button>
                <div className="v"><b className="num">{disp(kg)}</b><span>{data.unit} · {data.todayKg != null ? "logged today" : lastKg != null ? "prefilled from last time" : "first weigh-in"}</span></div>
                <button type="button" aria-label="More" onClick={() => setKg((k) => r1(k + step))}>+</button>
              </div>
              <div className="st-trend">
                <div className="c"><span className="k">7-day avg</span><span className="v num">{disp(a7)}</span></div>
                <div className="c"><span className="k">Rate</span><span className={`v num${rate != null ? (rateOk ? " st-g" : " st-a") : ""}`}>{rate != null ? `${rate >= 0 ? "+" : ""}${cu(rate).toFixed(2)}` : "—"}<small style={{ fontFamily: "var(--sans)", fontSize: 10, color: "var(--faint)" }}> {data.unit}/wk</small></span></div>
                <div className="c"><span className="k">{phaseLabel}</span><span className="v num">{data.goal === "maintain" ? `±${cu(0.1).toFixed(1)}` : `${corridor[0] > 0 ? "+" : ""}${cu(corridor[0]).toFixed(2)}–${cu(corridor[1]).toFixed(2)}`}</span></div>
              </div>
              {series.length >= 2 ? (
                <svg className="st-chart" viewBox="0 0 325 120" preserveAspectRatio="none">
                  <polygon fill="color-mix(in oklch,var(--blue),transparent 78%)" points={chart.poly} />
                  {chart.dots.map((d, i) => <rect key={i} x={d.x - 1.5} y={d.y - 1.5} width={3} height={3} fill="var(--faint)" />)}
                  <polyline fill="none" stroke="var(--gold)" strokeWidth={2} points={chart.avgPts} />
                  <rect x={chart.last.x - 4} y={chart.last.y - 4} width={8} height={8} fill="var(--gold)" transform={`rotate(45 ${chart.last.x} ${chart.last.y})`} />
                </svg>
              ) : (
                <div className="st-dnote">The 28-day chart starts after your second weigh-in.</div>
              )}
              <div className="st-blegend" style={{ margin: "8px 0 0" }}>
                <span><i style={{ background: "color-mix(in oklch,var(--blue),transparent 70%)" }} />{phaseLabel} corridor</span>
                <span><i style={{ height: 2, background: "var(--gold)" }} />7-day avg</span>
                <span><i style={{ width: 6, height: 6, background: "var(--faint)" }} />Daily</span>
              </div>
            </div></div>
            <div className="wrap" style={{ marginTop: 20 }}>
              <button className="btn block" style={{ minHeight: 54 }} disabled={saving} onClick={() => void saveWeight()}>{saving ? "Saving…" : saved ?? "Save weight"}</button>
              {err ? <div className="st-dnote" style={{ color: "var(--amber)" }}>{err}</div> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
