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
  { id: "race", label: "Race", color: "bg-amber-500/20 text-amber-400",
    subtypes: ["hyrox", "marathon", "half_marathon", "5k", "10k", "triathlon", "custom"] },
  { id: "strength", label: "Strength", color: "bg-purple-500/20 text-purple-400",
    subtypes: ["powerlifting_meet", "bodybuilding", "general_strength", "custom"] },
  { id: "physique", label: "Physique", color: "bg-pink-500/20 text-pink-400",
    subtypes: ["bodybuilding", "recomp", "custom"] },
  { id: "cognitive", label: "Cognitive", color: "bg-blue-500/20 text-blue-400",
    subtypes: ["cfa", "finals", "certification", "custom"] },
  { id: "weight", label: "Weight", color: "bg-emerald-500/20 text-emerald-400",
    subtypes: ["cut", "bulk", "recomp", "maintain"] },
  { id: "health", label: "Health", color: "bg-teal-500/20 text-teal-400",
    subtypes: ["sleep_optimization", "hrv_baseline", "stress_management", "custom"] },
  { id: "custom", label: "Custom", color: "bg-neutral-500/20 text-neutral-400",
    subtypes: [] },
];

function typeColor(type: string): string {
  return goalTypes.find((t) => t.id === type)?.color ?? goalTypes[6].color;
}

const typeHexColors: Record<string, string> = {
  race: "#f59e0b",
  strength: "#a855f7",
  physique: "#ec4899",
  cognitive: "#3b82f6",
  weight: "#10b981",
  health: "#14b8a6",
  custom: "#a3a3a3",
};

function typeHexColor(type: string): string {
  return typeHexColors[type] ?? "#a3a3a3";
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

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Add button / form */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-xl border border-dashed border-[var(--color-border)] py-3 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-white/30 hover:text-white"
        >
          + New Goal
        </button>
      ) : (
        <form
          onSubmit={createGoal}
          className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
        >
          <h3 className="text-sm font-semibold">New Goal</h3>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Goal title (e.g. Finish Hyrox under 90 min, Pass CFA Level I)"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
          />

          {/* Type selector */}
          <div>
            <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Type</p>
            <div className="flex flex-wrap gap-1.5">
              {goalTypes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setType(t.id);
                    setSubtype(null);
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    type === t.id
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subtype selector (conditional) */}
          {currentSubtypes.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Focus</p>
              <div className="flex flex-wrap gap-1.5">
                {currentSubtypes.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSubtype(subtype === st ? null : st)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                      subtype === st
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
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target (optional, e.g. sub-60 min, 140 lb, score > 70%)"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm [color-scheme:dark]"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
          />

          {/* Primary focus toggle */}
          <label className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setMakePrimary(!makePrimary)}
              className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                makePrimary
                  ? "border-amber-400 bg-amber-500/20 text-amber-400"
                  : "border-[var(--color-border)] text-transparent"
              }`}
            >
              ★
            </button>
            <span className="text-[var(--color-text-muted)]">
              Set as primary focus — coach will lead with this goal
            </span>
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !title.trim()}
              className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-30"
            >
              Save
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl bg-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-text-muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Active goals */}
      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Active Goals ({active.length})
        </h2>
        {sortedActive.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No active goals. Create one to see it in your coach context.
          </p>
        ) : (
          <div className="space-y-3">
            {sortedActive.map((g) => {
              const days = daysUntil(g.deadline);
              return (
                <div
                  key={g.id}
                  id={`goal-${g.id}`}
                  className={`group rounded-2xl border bg-[var(--color-surface)] p-5 transition-all ${
                    g.isPrimary
                      ? "border-amber-500/40"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  {editingId === g.id ? (
                    /* Inline edit form */
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editFields.title ?? ""}
                        onChange={(e) => setEditFields({ ...editFields, title: e.target.value })}
                        placeholder="Goal title"
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
                      />

                      {/* Type selector */}
                      <div>
                        <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Type</p>
                        <div className="flex flex-wrap gap-1.5">
                          {goalTypes.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setEditFields({ ...editFields, type: t.id, subtype: null })}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                                editFields.type === t.id
                                  ? "border-white/30 bg-white/10 text-white"
                                  : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Subtype selector (conditional) */}
                      {editSubtypes.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs text-[var(--color-text-muted)]">Focus</p>
                          <div className="flex flex-wrap gap-1.5">
                            {editSubtypes.map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() =>
                                  setEditFields({
                                    ...editFields,
                                    subtype: editFields.subtype === st ? null : st,
                                  })
                                }
                                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                                  editFields.subtype === st
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
                        value={editFields.target ?? ""}
                        onChange={(e) => setEditFields({ ...editFields, target: e.target.value })}
                        placeholder="Target (optional)"
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
                      />
                      <input
                        type="date"
                        value={editFields.deadline ?? ""}
                        onChange={(e) => setEditFields({ ...editFields, deadline: e.target.value })}
                        className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm [color-scheme:dark]"
                      />
                      <textarea
                        value={editFields.notes ?? ""}
                        onChange={(e) => setEditFields({ ...editFields, notes: e.target.value })}
                        placeholder="Notes (optional)"
                        rows={2}
                        className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
                      />

                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={isPending || !editFields.title?.trim()}
                          className="flex-1 rounded-xl bg-white/10 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-30"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditFields({}); }}
                          className="rounded-xl bg-[var(--color-surface-2)] px-4 py-2 text-sm text-[var(--color-text-muted)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display mode */
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {/* Primary star toggle */}
                          <button
                            onClick={() => updateGoal(g.id, { isPrimary: !g.isPrimary })}
                            className={`text-sm transition-colors ${
                              g.isPrimary
                                ? "text-amber-400"
                                : "text-[var(--color-text-muted)]/30 hover:text-amber-400/60"
                            }`}
                            title={g.isPrimary ? "Remove primary focus" : "Set as primary focus"}
                          >
                            ★
                          </button>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${typeColor(g.type)}`}
                          >
                            {g.type}
                          </span>
                          {g.subtype && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {subtypeLabel(g.subtype)}
                            </span>
                          )}
                          {g.isPrimary && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-400">
                              Primary
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-semibold">{g.title}</p>
                        {g.target && (
                          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                            Target: {g.target}
                          </p>
                        )}
                        {g.deadline && (
                          <div className="mt-2 flex items-center gap-2">
                            <CountdownRing
                              deadline={g.deadline}
                              size={40}
                              color={typeHexColor(g.type)}
                            />
                            <div className="text-xs text-[var(--color-text-muted)]">
                              {new Date(g.deadline).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                              <span className="ml-1 font-mono">({days})</span>
                            </div>
                          </div>
                        )}
                        {g.notes && (
                          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{g.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
                          className="rounded px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20"
                        >
                          Done
                        </button>
                        <button
                          onClick={() => updateGoal(g.id, { status: "archived" })}
                          className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                        >
                          Archive
                        </button>
                        <button
                          onClick={() => startEdit(g)}
                          className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Delete this goal permanently?")) deleteGoal(g.id);
                          }}
                          className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-red-500/20 hover:text-red-400"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Archived goals */}
      {archived.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Archived ({archived.length})
          </h2>
          <div className="space-y-2">
            {archived.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs opacity-70"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${typeColor(g.type)}`}>
                    {g.type}
                  </span>
                  <span className="line-through">{g.title}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => updateGoal(g.id, { status: "active" })}
                    className="rounded px-2 py-1 text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => deleteGoal(g.id)}
                    className="text-[var(--color-text-muted)] hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legacy completed goals */}
      {completed.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            Completed ({completed.length})
          </h2>
          <div className="space-y-2">
            {completed.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs opacity-70"
              >
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${typeColor(g.type)}`}>
                    {g.type}
                  </span>
                  <span className="line-through">{g.title}</span>
                </div>
                <button
                  onClick={() => deleteGoal(g.id)}
                  className="text-[var(--color-text-muted)] hover:text-red-400"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
