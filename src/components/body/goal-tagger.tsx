"use client";

import { useState, useTransition } from "react";

interface GoalOption {
  id: string;
  title: string;
  type: string;
  subtype: string | null;
}

// Auto-suggest which goals a workout should be tagged to based on workout name
function suggestGoals(goals: GoalOption[], workoutName?: string): Set<string> {
  const suggested = new Set<string>();
  const name = (workoutName ?? "").toLowerCase();
  const isRunning = /run|jog|sprint|tempo|interval|cardio|hyrox|rowing|ski erg/.test(name);
  const isStrength = /squat|bench|press|deadlift|row|curl|pull|push|strength|hyper|lunge/.test(name);

  for (const goal of goals) {
    if (goal.type === "race" && isRunning) suggested.add(goal.id);
    if ((goal.type === "strength" || goal.type === "physique") && isStrength) suggested.add(goal.id);
    if (goal.type === "weight") suggested.add(goal.id);
    // Hyrox needs both running and strength
    if (goal.type === "race" && goal.subtype === "hyrox" && (isRunning || isStrength)) suggested.add(goal.id);
  }
  // Fallback: if nothing matched, suggest all active goals
  if (suggested.size === 0) {
    for (const goal of goals) suggested.add(goal.id);
  }
  return suggested;
}

export function GoalTagger({
  sessionId,
  goals,
  workoutName,
  onDone,
}: {
  sessionId: string;
  goals: GoalOption[];
  workoutName?: string;
  onDone?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => suggestGoals(goals, workoutName));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle(goalId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      await fetch(`/api/workouts/${sessionId}/goals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalIds: Array.from(selected) }),
      });
      setSaved(true);
      onDone?.();
    });
  }

  if (goals.length === 0) return null;
  if (saved) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-[var(--color-text-muted)]">
        Goals tagged
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="mb-3 text-sm font-medium">Which goals did this serve?</p>
      <div className="space-y-2">
        {goals.map((g) => (
          <label
            key={g.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(g.id)}
              onChange={() => toggle(g.id)}
              className="accent-white"
            />
            <span className="font-medium">{g.title}</span>
            <span className="text-[var(--color-text-muted)]">
              ({g.type}{g.subtype ? `/${g.subtype}` : ""})
            </span>
          </label>
        ))}
      </div>
      <button
        onClick={save}
        disabled={isPending}
        className="mt-3 w-full rounded-xl bg-white/10 py-2 text-xs font-medium hover:bg-white/20 disabled:opacity-30"
      >
        Save
      </button>
    </div>
  );
}
