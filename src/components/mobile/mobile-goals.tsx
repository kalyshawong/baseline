"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Mobile Goals — faithful to the "Baseline iOS" Goals mock (primary-focus hero
 * ring, 2-up goal tiles, archived/completed lists, new-goal form). Reuses the
 * same /api/goals endpoints as the desktop GoalsManager.
 */

interface Goal {
  id: string;
  title: string;
  type: string;
  subtype: string | null;
  target: string | null;
  deadline: string | null;
  status: string;
  isPrimary: boolean;
  priority: number;
  notes: string | null;
}

const goalTypes = [
  { id: "race", label: "Race" },
  { id: "strength", label: "Strength" },
  { id: "physique", label: "Physique" },
  { id: "cognitive", label: "Cognitive" },
  { id: "weight", label: "Weight" },
  { id: "health", label: "Health" },
  { id: "custom", label: "Custom" },
];

function typeVar(type: string): string {
  const valid = ["race", "strength", "physique", "cognitive", "weight", "health", "custom"];
  return `var(--t-${valid.includes(type) ? type : "custom"})`;
}
function typeLabel(type: string): string {
  return goalTypes.find((t) => t.id === type)?.label ?? type;
}
function daysUntil(deadline: string | null): string | null {
  if (!deadline) return null;
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return `${Math.abs(diff)}d ago`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${diff} days`;
}
function shortDate(deadline: string | null): string | null {
  if (!deadline) return null;
  return new Date(deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Ring({ deadline, color, size, label }: { deadline: string | null; color: string; size: number; label?: string }) {
  const stroke = size >= 90 ? 6 : 5;
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  let pct = 1;
  let center = "∞";
  if (deadline) {
    const end = new Date(deadline).getTime();
    const start = end - 90 * 86_400_000;
    const now = Date.now();
    pct = Math.min(Math.max((now - start) / (end - start), 0), 1);
    center = `${Math.max(0, Math.ceil((end - now) / 86_400_000))}d`;
  }
  const offset = circ * (1 - pct);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle className="fg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} stroke={color} strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="lab">
        <b style={{ fontSize: size >= 90 ? 28 : 17, color }}>{center}</b>
        {label && <span>{label}</span>}
      </div>
    </div>
  );
}

function pctComplete(deadline: string | null): number | null {
  if (!deadline) return null;
  const end = new Date(deadline).getTime();
  const start = end - 90 * 86_400_000;
  return Math.round(Math.min(Math.max((Date.now() - start) / (end - start), 0), 1) * 100);
}

export function MobileGoals({ initialGoals }: { initialGoals: Goal[] }) {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("race");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");

  function createGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), type, target: target.trim() || undefined, deadline: deadline || undefined }),
      });
      if (res.ok) {
        const created = await res.json();
        setGoals((p) => [...p, created]);
        setTitle(""); setTarget(""); setDeadline(""); setType("race"); setShowForm(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create goal");
      }
    });
  }

  function patchGoal(id: string, patch: Record<string, unknown>) {
    const prev = [...goals];
    setGoals((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } as Goal : g)));
    startTransition(async () => {
      const res = await fetch(`/api/goals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (res.ok) router.refresh();
      else { setGoals(prev); setError("Failed to update goal"); }
    });
  }
  function deleteGoal(id: string) {
    const prev = [...goals];
    setGoals((gs) => gs.filter((g) => g.id !== id));
    startTransition(async () => {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else { setGoals(prev); setError("Failed to delete goal"); }
    });
  }

  const active = goals.filter((g) => g.status === "active").sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    return 0;
  });
  const archived = goals.filter((g) => g.status === "archived");
  const completed = goals.filter((g) => g.status === "completed");
  const primary = active.find((g) => g.isPrimary);
  const others = active.filter((g) => !g.isPrimary);

  function badge(t: string) {
    return <span className="tbadge" style={{ background: `color-mix(in oklch, ${typeVar(t)}, transparent 80%)`, color: typeVar(t) }}>{typeLabel(t)}</span>;
  }

  return (
    <div className="bl-m">
      <div className="appbar">
        <div>
          <h1>GOALS</h1>
          <div className="sub">Races, exams &amp; body targets feed your coach.</div>
        </div>
      </div>

      {primary && (
        <>
          <div className="g-sec">Primary Focus</div>
          <div className="wrap">
            <div className="gherom">
              <Ring deadline={primary.deadline} color={typeVar(primary.type)} size={96} label={primary.type === "race" ? "to race" : "to go"} />
              <div>
                <div className="gtop">
                  <span className="primaryflag">★ Primary</span>
                  {badge(primary.type)}
                </div>
                <div className="title">{primary.title}</div>
                {primary.target && <div className="tgt">Target <b>{primary.target}</b></div>}
                <div className="meta">
                  {shortDate(primary.deadline) && <b>{shortDate(primary.deadline)}</b>}
                  {daysUntil(primary.deadline) && <> · {daysUntil(primary.deadline)}</>}
                  {pctComplete(primary.deadline) != null && <> · {pctComplete(primary.deadline)}% complete</>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="g-sec"><span>Active Goals</span> <span className="ct">· {others.length}</span></div>
      <div className="wrap">
        <div className="gboard">
          {others.map((g) => (
            <div className="gtile" key={g.id} style={{ borderTopColor: typeVar(g.type) }}>
              <Ring deadline={g.deadline} color={typeVar(g.type)} size={66} />
              <div className="title">{g.title}</div>
              {g.target && <div className="tgt">Target <b>{g.target}</b></div>}
              <div className="dt">
                {shortDate(g.deadline) ? <><b>{shortDate(g.deadline)}</b> · {daysUntil(g.deadline)}</> : "Ongoing"}
              </div>
              <div className="badges">{badge(g.type)}</div>
            </div>
          ))}
        </div>
        <button className="addtile" style={{ marginTop: 10, minHeight: 64, flexDirection: "row", gap: 10 }} onClick={() => setShowForm((s) => !s)}>
          <span className="plus" style={{ fontSize: 30 }}>+</span>
          <span className="lbl">New Goal</span>
        </button>

        {showForm && (
          <form className="panel" style={{ marginTop: 12 }} onSubmit={createGoal}>
            <input className="field" placeholder="Goal title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="seg c2" style={{ marginTop: 8 }}>
              {goalTypes.slice(0, 6).map((t) => (
                <div key={t.id} className={`opt ${type === t.id ? "on" : ""}`} onClick={() => setType(t.id)}>{t.label}</div>
              ))}
            </div>
            <input className="field" style={{ marginTop: 8 }} placeholder="Target (e.g. sub-85 min)" value={target} onChange={(e) => setTarget(e.target.value)} />
            <input className="field" style={{ marginTop: 8, colorScheme: "dark" }} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            <button className="btn block" style={{ marginTop: 10 }} type="submit" disabled={!title.trim()}>Create Goal</button>
          </form>
        )}
      </div>

      {archived.length > 0 && (
        <>
          <div className="g-sec"><span>Archived</span> <span className="ct">· {archived.length}</span></div>
          <div className="wrap">
            {archived.map((g) => (
              <div className="gcompact" key={g.id} style={{ marginTop: 6 }}>
                <div className="l">{badge(g.type)}<span className="nm">{g.title}</span></div>
                <div className="r">
                  <button onClick={() => patchGoal(g.id, { status: "active" })}>Restore</button>
                  <button onClick={() => deleteGoal(g.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {completed.length > 0 && (
        <>
          <div className="g-sec"><span>Completed</span> <span className="ct">· {completed.length}</span></div>
          <div className="wrap" style={{ paddingBottom: 8 }}>
            {completed.map((g) => (
              <div className="gcompact" key={g.id} style={{ marginTop: 6 }}>
                <div className="l">{badge(g.type)}<span className="nm">{g.title}</span></div>
                <div className="r"><button onClick={() => deleteGoal(g.id)}>×</button></div>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <div className="wrap"><p style={{ color: "var(--red)", fontSize: 12 }}>{error}</p></div>}
    </div>
  );
}
