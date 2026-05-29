"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CountdownRing } from "./countdown-ring";

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
  { id: "race", label: "Race", subtypes: ["hyrox", "marathon", "half_marathon", "5k", "10k", "triathlon", "custom"] },
  { id: "strength", label: "Strength", subtypes: ["powerlifting_meet", "bodybuilding", "general_strength", "custom"] },
  { id: "physique", label: "Physique", subtypes: ["bodybuilding", "recomp", "custom"] },
  { id: "cognitive", label: "Cognitive", subtypes: ["cfa", "finals", "certification", "custom"] },
  { id: "weight", label: "Weight", subtypes: ["cut", "bulk", "recomp", "maintain"] },
  { id: "health", label: "Health", subtypes: ["sleep_optimization", "hrv_baseline", "stress_management", "custom"] },
  { id: "custom", label: "Custom", subtypes: [] },
];

/** CSS variable for goal type color */
function typeVar(type: string): string {
  const valid = ["race", "strength", "physique", "cognitive", "weight", "health", "custom"];
  return `var(--t-${valid.includes(type) ? type : "custom"})`;
}

function subtypeLabel(subtype: string): string {
  return subtype.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysUntil(deadline: string | null): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return `${diff} days`;
}

/** Type badge with angled clip and semi-transparent color */
function TypeBadge({ type }: { type: string }) {
  const label = goalTypes.find((t) => t.id === type)?.label ?? type;
  return (
    <span
      className="angled-clip px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em]"
      style={{
        background: `color-mix(in oklch, ${typeVar(type)}, transparent 80%)`,
        color: typeVar(type),
      }}
    >
      {label}
    </span>
  );
}

/** Section overline with line-after */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="ov shrink-0">{children}</span>
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}

export function GoalsManager({ initialGoals }: { initialGoals: Goal[] }) {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<Goal>>({});

  function startEdit(g: Goal) {
    setEditingId(g.id);
    setEditFields({
      title: g.title,
      type: g.type,
      subtype: g.subtype,
      target: g.target,
      deadline: g.deadline ? g.deadline.split("T")[0] : "",
      notes: g.notes,
    });
  }

  function saveEdit() {
    if (!editingId) return;
    const patch: Record<string, unknown> = {};
    const original = goals.find((g) => g.id === editingId);
    if (!original) return;

    if (editFields.title && editFields.title !== original.title) patch.title = editFields.title;
    if (editFields.type && editFields.type !== original.type) patch.type = editFields.type;
    if (editFields.subtype !== original.subtype) patch.subtype = editFields.subtype || null;
    if (editFields.target !== original.target) patch.target = editFields.target || null;
    if (editFields.deadline !== (original.deadline ? original.deadline.split("T")[0] : ""))
      patch.deadline = editFields.deadline || null;
    if (editFields.notes !== original.notes) patch.notes = editFields.notes || null;

    if (Object.keys(patch).length > 0) {
      updateGoal(editingId, patch);
    }
    setEditingId(null);
    setEditFields({});
  }

  const editSubtypes = goalTypes.find((t) => t.id === editFields.type)?.subtypes ?? [];

  // New goal form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState("race");
  const [subtype, setSubtype] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");
  const [makePrimary, setMakePrimary] = useState(false);

  const currentSubtypes = goalTypes.find((t) => t.id === type)?.subtypes ?? [];

  function resetForm() {
    setTitle("");
    setType("race");
    setSubtype(null);
    setTarget("");
    setDeadline("");
    setNotes("");
    setMakePrimary(false);
    setShowForm(false);
  }

  function createGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type,
          subtype: subtype || undefined,
          target: target.trim() || undefined,
          deadline: deadline || undefined,
          notes: notes.trim() || undefined,
          isPrimary: makePrimary,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        if (makePrimary) {
          setGoals((prev) =>
            [...prev.map((g) => ({ ...g, isPrimary: false })), created]
          );
        } else {
          setGoals((prev) => [...prev, created]);
        }
        resetForm();
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create goal");
      }
    });
  }

  function updateGoal(id: string, patch: Record<string, unknown>) {
    const prevGoals = [...goals];

    // Optimistic update
    if (patch.isPrimary === true) {
      setGoals(goals.map((g) => ({
        ...g,
        isPrimary: g.id === id,
        ...(g.id === id ? patch : {}),
      })) as Goal[]);
    } else if (patch.status === "archived" || patch.status === "completed") {
      setGoals(goals.map((g) =>
        g.id === id ? { ...g, ...patch, status: "archived" } : g
      ) as Goal[]);
    } else {
      setGoals(goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) as Goal[]);
    }

    startTransition(async () => {
      const res = await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        router.refresh();
      } else {
        setGoals(prevGoals);
        setError("Failed to update goal");
      }
    });
  }

  function deleteGoal(id: string) {
    const prevGoals = [...goals];
    setGoals(goals.filter((g) => g.id !== id));
    startTransition(async () => {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        setGoals(prevGoals);
        setError("Failed to delete goal");
      }
    });
  }

  const active = goals.filter((g) => g.status === "active");
  const archived = goals.filter((g) => g.status === "archived");
  const completed = goals.filter((g) => g.status === "completed");

  // Sort active: primary first, then by priority desc, then deadline
  const sortedActive = [...active].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.deadline && b.deadline) return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    return 0;
  });

  const primaryGoal = sortedActive.find((g) => g.isPrimary);
  const nonPrimaryActive = sortedActive.filter((g) => !g.isPrimary);

  /* ---- shared form fields renderer ---- */
  function renderFormFields(
    fields: { title: string; type: string; subtype: string | null; target: string; deadline: string; notes: string },
    setField: (key: string, value: string | null) => void,
    subtypes: string[],
  ) {
    return (
      <>
        <input
          type="text"
          value={fields.title}
          onChange={(e) => setField("title", e.target.value)}
          placeholder="Goal title (e.g. Finish Hyrox under 90 min, Pass CFA Level I)"
          className="field w-full"
        />

        {/* Type selector chips */}
        <div>
          <p className="ov mb-2">Type</p>
          <div className="flex flex-wrap gap-1.5">
            {goalTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setField("type", t.id);
                  setField("subtype", null);
                }}
                className={`angled-clip-sm px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
                  fields.type === t.id
                    ? "text-white"
                    : "text-[var(--color-faint)] hover:text-[var(--color-text-muted)]"
                }`}
                style={
                  fields.type === t.id
                    ? {
                        background: `color-mix(in oklch, ${typeVar(t.id)}, transparent 70%)`,
                        color: typeVar(t.id),
                      }
                    : { background: "var(--color-surface-2)" }
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Subtype selector */}
        {subtypes.length > 0 && (
          <div>
            <p className="ov mb-2">Focus</p>
            <div className="flex flex-wrap gap-1.5">
              {subtypes.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setField("subtype", fields.subtype === st ? null : st)}
                  className={`border px-2.5 py-1 text-[11px] font-medium transition-all ${
                    fields.subtype === st
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                  }`}
                >
                  {subtypeLabel(st)}
                </button>
              ))}
            </div>
          </div>
        )}

        <input
          type="text"
          value={fields.target}
          onChange={(e) => setField("target", e.target.value)}
          placeholder="Target (optional, e.g. sub-60 min, 140 lb, score > 70%)"
          className="field w-full"
        />
        <input
          type="date"
          value={fields.deadline}
          onChange={(e) => setField("deadline", e.target.value)}
          className="field w-full [color-scheme:dark]"
        />
        <textarea
          value={fields.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="field w-full resize-none"
        />
      </>
    );
  }

  return (
    <div className="space-y-10">
      {error && (
        <div className="bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-400">
          {error}
        </div>
      )}

      {/* ──── PRIMARY FOCUS HERO ──── */}
      {primaryGoal && editingId !== primaryGoal.id && (
        <>
          <SectionLabel>Primary Focus</SectionLabel>
          <div
            id={`goal-${primaryGoal.id}`}
            className="group panel grid grid-cols-[auto_1fr] items-center gap-7 border-l-[6px]"
            style={{
              borderColor: "var(--color-gold)",
              background: "linear-gradient(135deg, color-mix(in oklch, var(--color-gold), transparent 86%), transparent 55%)",
              boxShadow: "0 0 60px -24px var(--color-gold)",
            }}
          >
            {/* Ring */}
            {primaryGoal.deadline ? (
              <CountdownRing deadline={primaryGoal.deadline} size={120} color="var(--color-gold)" />
            ) : (
              <div className="flex h-[120px] w-[120px] items-center justify-center">
                <span className="disp text-[36px] text-[var(--color-gold)]">--</span>
              </div>
            )}

            {/* Content */}
            <div className="min-w-0">
              {/* Badges */}
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="angled-clip px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.1em]"
                  style={{ background: "color-mix(in oklch, var(--color-gold), transparent 70%)", color: "var(--color-gold)" }}
                >
                  &#9733; Primary
                </span>
                <TypeBadge type={primaryGoal.type} />
                {primaryGoal.subtype && (
                  <span className="text-[11px] text-[var(--color-faint)]">
                    {subtypeLabel(primaryGoal.subtype)}
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="disp text-[52px] leading-[0.95] tracking-tight">
                {primaryGoal.title}
              </h2>

              {/* Target + deadline */}
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[var(--color-text-muted)]">
                {primaryGoal.target && <span>Target: {primaryGoal.target}</span>}
                {primaryGoal.deadline && (
                  <span>
                    {new Date(primaryGoal.deadline).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                    <span className="ml-1.5 font-mono text-xs opacity-60">
                      ({daysUntil(primaryGoal.deadline)})
                    </span>
                  </span>
                )}
              </div>

              {primaryGoal.notes && (
                <p className="mt-2 text-xs text-[var(--color-faint)]">{primaryGoal.notes}</p>
              )}

              {/* Actions */}
              <div className="mt-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => {
                    const el = document.getElementById(`goal-${primaryGoal.id}`);
                    if (el) {
                      el.classList.add("ring-2", "ring-emerald-400/60");
                      setTimeout(() => updateGoal(primaryGoal.id, { status: "completed" }), 600);
                    } else {
                      updateGoal(primaryGoal.id, { status: "completed" });
                    }
                  }}
                  className="px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20"
                >
                  Done
                </button>
                <button
                  onClick={() => updateGoal(primaryGoal.id, { status: "archived" })}
                  className="px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                >
                  Archive
                </button>
                <button
                  onClick={() => startEdit(primaryGoal)}
                  className="px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
                >
                  Edit
                </button>
                <button
                  onClick={() => updateGoal(primaryGoal.id, { isPrimary: false })}
                  className="px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
                >
                  Unstar
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this goal permanently?")) deleteGoal(primaryGoal.id);
                  }}
                  className="px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-red-500/20 hover:text-red-400"
                >
                  &times;
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ──── ACTIVE GOALS BOARD ──── */}
      <div>
        <SectionLabel>Active Goals &middot; {active.length}</SectionLabel>

        {/* Inline edit for primary goal (if editing) */}
        {primaryGoal && editingId === primaryGoal.id && (
          <div className="panel mb-4 space-y-3">
            <h3 className="ov">Edit Goal</h3>
            {renderFormFields(
              {
                title: editFields.title ?? "",
                type: editFields.type ?? "race",
                subtype: editFields.subtype ?? null,
                target: editFields.target ?? "",
                deadline: editFields.deadline ?? "",
                notes: editFields.notes ?? "",
              },
              (key, value) => setEditFields({ ...editFields, [key]: value }),
              editSubtypes,
            )}
            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={isPending || !editFields.title?.trim()}
                className="btn flex-1 py-2 text-sm"
              >
                Save
              </button>
              <button
                onClick={() => { setEditingId(null); setEditFields({}); }}
                className="btn-ghost px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {sortedActive.length === 0 && !showForm ? (
          <div className="empty-state py-12 text-center">
            <p className="disp text-[28px] text-[var(--color-faint)]">No active goals</p>
            <p className="mt-1 text-sm text-[var(--color-faint)]">
              Create one to see it in your coach context.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-[14px]">
            {/* Non-primary active goal tiles */}
            {nonPrimaryActive.map((g) => {
              const days = daysUntil(g.deadline);
              return editingId === g.id ? (
                /* Inline edit tile */
                <div key={g.id} className="panel col-span-3 space-y-3">
                  <h3 className="ov">Edit Goal</h3>
                  {renderFormFields(
                    {
                      title: editFields.title ?? "",
                      type: editFields.type ?? "race",
                      subtype: editFields.subtype ?? null,
                      target: editFields.target ?? "",
                      deadline: editFields.deadline ?? "",
                      notes: editFields.notes ?? "",
                    },
                    (key, value) => setEditFields({ ...editFields, [key]: value }),
                    editSubtypes,
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      disabled={isPending || !editFields.title?.trim()}
                      className="btn flex-1 py-2 text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditFields({}); }}
                      className="btn-ghost px-4 py-2 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Display tile */
                <div
                  key={g.id}
                  id={`goal-${g.id}`}
                  className="group panel flex flex-col items-center border-t-4 text-center"
                  style={{ borderColor: typeVar(g.type) }}
                >
                  {/* Star toggle */}
                  <button
                    onClick={() => updateGoal(g.id, { isPrimary: true })}
                    className="self-end text-sm text-[var(--color-faint)]/30 transition hover:text-amber-400/60"
                    title="Set as primary focus"
                  >
                    &#9733;
                  </button>

                  {/* Countdown ring */}
                  {g.deadline ? (
                    <CountdownRing deadline={g.deadline} size={72} color={typeVar(g.type)} />
                  ) : (
                    <div className="flex h-[72px] w-[72px] items-center justify-center">
                      <span className="disp text-[22px]" style={{ color: typeVar(g.type) }}>--</span>
                    </div>
                  )}

                  {/* Title */}
                  <h3 className="disp mt-3 text-[26px] leading-[1.05]">{g.title}</h3>

                  {/* Target */}
                  {g.target && (
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">{g.target}</p>
                  )}

                  {/* Deadline */}
                  {g.deadline && (
                    <p className="mt-1.5 text-[11px] text-[var(--color-faint)]">
                      {new Date(g.deadline).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                      <span className="ml-1 font-mono">({days})</span>
                    </p>
                  )}

                  {/* Type badge */}
                  <div className="mt-3">
                    <TypeBadge type={g.type} />
                  </div>

                  {/* Hover actions */}
                  <div className="mt-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => {
                        const el = document.getElementById(`goal-${g.id}`);
                        if (el) {
                          el.classList.add("ring-2", "ring-emerald-400/60");
                          setTimeout(() => updateGoal(g.id, { status: "completed" }), 600);
                        } else {
                          updateGoal(g.id, { status: "completed" });
                        }
                      }}
                      className="px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20"
                    >
                      Done
                    </button>
                    <button
                      onClick={() => updateGoal(g.id, { status: "archived" })}
                      className="px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => startEdit(g)}
                      className="px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this goal permanently?")) deleteGoal(g.id);
                      }}
                      className="px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-red-500/20 hover:text-red-400"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              );
            })}

            {/* + New Goal tile */}
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="empty-state flex flex-col items-center justify-center gap-2 py-10 transition hover:border-white/30 hover:text-white"
              >
                <span className="disp text-[52px] leading-none text-[var(--color-faint)]">+</span>
                <span className="ov">New Goal</span>
              </button>
            )}

            {/* New goal form (spans full width) */}
            {showForm && (
              <form
                onSubmit={createGoal}
                className="panel col-span-3 space-y-3"
              >
                <h3 className="ov">New Goal</h3>
                {renderFormFields(
                  { title, type, subtype, target, deadline, notes },
                  (key, value) => {
                    if (key === "title") setTitle(value ?? "");
                    else if (key === "type") { setType(value ?? "race"); setSubtype(null); }
                    else if (key === "subtype") setSubtype(value);
                    else if (key === "target") setTarget(value ?? "");
                    else if (key === "deadline") setDeadline(value ?? "");
                    else if (key === "notes") setNotes(value ?? "");
                  },
                  currentSubtypes,
                )}

                {/* Primary focus toggle */}
                <label className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setMakePrimary(!makePrimary)}
                    className={`flex h-5 w-5 items-center justify-center border transition-all ${
                      makePrimary
                        ? "border-amber-400 bg-amber-500/20 text-amber-400"
                        : "border-[var(--color-border)] text-transparent"
                    }`}
                  >
                    &#9733;
                  </button>
                  <span className="text-[var(--color-text-muted)]">
                    Set as primary focus -- coach will lead with this goal
                  </span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isPending || !title.trim()}
                    className="btn flex-1 py-2 text-sm"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ──── ARCHIVED ──── */}
      {archived.length > 0 && (
        <div>
          <SectionLabel>Archived &middot; {archived.length}</SectionLabel>
          <div className="space-y-1">
            {archived.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between bg-[var(--color-surface)] px-4 py-2.5 text-xs opacity-70"
              >
                <div className="flex items-center gap-2">
                  <TypeBadge type={g.type} />
                  <span className="line-through">{g.title}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => updateGoal(g.id, { status: "active" })}
                    className="px-2 py-1 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => deleteGoal(g.id)}
                    className="text-[var(--color-text-muted)] hover:text-red-400"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ──── COMPLETED ──── */}
      {completed.length > 0 && (
        <div>
          <SectionLabel>Completed &middot; {completed.length}</SectionLabel>
          <div className="space-y-1">
            {completed.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between bg-[var(--color-surface)] px-4 py-2.5 text-xs opacity-70"
              >
                <div className="flex items-center gap-2">
                  <TypeBadge type={g.type} />
                  <span className="line-through">{g.title}</span>
                </div>
                <button
                  onClick={() => deleteGoal(g.id)}
                  className="text-[var(--color-text-muted)] hover:text-red-400"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
