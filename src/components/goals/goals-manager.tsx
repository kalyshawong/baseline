"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Goal {
  id: string;
  title: string;
  type: string;
  target: string | null;
  deadline: string | null;
  status: string;
  notes: string | null;
}

const goalTypes = [
  { id: "weight", label: "Weight", color: "bg-emerald-500/20 text-emerald-400" },
  { id: "race", label: "Race", color: "bg-amber-500/20 text-amber-400" },
  { id: "exam", label: "Exam", color: "bg-blue-500/20 text-blue-400" },
  { id: "performance", label: "Performance", color: "bg-purple-500/20 text-purple-400" },
  { id: "habit", label: "Habit", color: "bg-pink-500/20 text-pink-400" },
  { id: "custom", label: "Custom", color: "bg-neutral-500/20 text-neutral-400" },
];

function typeColor(type: string): string {
  return goalTypes.find((t) => t.id === type)?.color ?? goalTypes[5].color;
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

  // New goal form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState("weight");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [notes, setNotes] = useState("");

  function resetForm() {
    setTitle("");
    setType("weight");
    setTarget("");
    setDeadline("");
    setNotes("");
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
          target: target.trim() || undefined,
          deadline: deadline || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setGoals([...goals, created]);
        resetForm();
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to create goal");
      }
    });
  }

  function updateGoalStatus(id: string, newStatus: string) {
    const prevGoals = [...goals];
    setGoals(goals.map((g) => (g.id === id ? { ...g, status: newStatus } : g)));
    startTransition(async () => {
      const res = await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
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
  const completed = goals.filter((g) => g.status === "completed");

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
            placeholder="Goal title (e.g. Lose 5 lbs by June, Hyrox Oct 15)"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-2">
            {goalTypes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                  type === t.id
                    ? "border-white/30 bg-white/10 text-white"
                    : "border-[var(--color-border)] text-[var(--color-text-muted)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Target (optional, e.g. 140 lb, sub-60 min)"
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
        {active.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            No active goals. Create one to see it in your coach context.
          </p>
        ) : (
          <div className="space-y-3">
            {active.map((g) => {
              const days = daysUntil(g.deadline);
              return (
                <div
                  key={g.id}
                  className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${typeColor(g.type)}`}
                        >
                          {g.type}
                        </span>
                        <p className="font-semibold">{g.title}</p>
                      </div>
                      {g.target && (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          Target: {g.target}
                        </p>
                      )}
                      {g.deadline && (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          {new Date(g.deadline).toLocaleDateString("en-US", {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })}{" "}
                          <span className="font-mono">({days})</span>
                        </p>
                      )}
                      {g.notes && (
                        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{g.notes}</p>
                      )}
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => updateGoalStatus(g.id, "completed")}
                        className="rounded px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20"
                      >
                        Done
                      </button>
                      <button
                        onClick={() => deleteGoal(g.id)}
                        className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-red-500/20 hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed goals */}
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
