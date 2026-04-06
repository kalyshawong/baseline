"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { workoutTemplates as builtinTemplates } from "@/lib/exercise-library";

interface TemplateExercise {
  exerciseName: string;
  targetSets: number;
  targetReps: number;
}

interface CustomTemplate {
  id: string;
  name: string;
  split: string;
  exercises: TemplateExercise[];
}

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  isCompound: boolean;
  defaultSets: number;
  defaultReps: number;
}

export default function NewWorkoutPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [showEditor, setShowEditor] = useState(false);

  // Editor state
  const [newName, setNewName] = useState("");
  const [newSplit, setNewSplit] = useState("custom");
  const [pickedExercises, setPickedExercises] = useState<TemplateExercise[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/templates").then((r) => r.json()),
      fetch("/api/exercises").then((r) => r.json()),
    ]).then(([templates, exercises]) => {
      setCustomTemplates(templates);
      setAllExercises(exercises);
    });
  }, []);

  function startWorkout(templateName: string | null) {
    startTransition(async () => {
      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateName }),
      });
      if (res.ok) {
        const session = await res.json();
        router.push(`/body/workout/${session.id}`);
      }
    });
  }

  function addExerciseToTemplate(ex: Exercise) {
    if (pickedExercises.some((p) => p.exerciseName === ex.name)) return;
    setPickedExercises([
      ...pickedExercises,
      {
        exerciseName: ex.name,
        targetSets: ex.defaultSets,
        targetReps: ex.defaultReps,
      },
    ]);
    setSearch("");
  }

  function updatePickedExercise(idx: number, field: "targetSets" | "targetReps", value: number) {
    const next = [...pickedExercises];
    next[idx] = { ...next[idx], [field]: value };
    setPickedExercises(next);
  }

  function removePickedExercise(idx: number) {
    setPickedExercises(pickedExercises.filter((_, i) => i !== idx));
  }

  function saveTemplate() {
    if (!newName.trim() || pickedExercises.length === 0) return;
    startTransition(async () => {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          split: newSplit,
          exercises: pickedExercises,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setCustomTemplates([created, ...customTemplates]);
        setShowEditor(false);
        setNewName("");
        setPickedExercises([]);
        setNewSplit("custom");
      }
    });
  }

  function deleteTemplate(id: string) {
    startTransition(async () => {
      await fetch(`/api/templates/${id}`, { method: "DELETE" });
      setCustomTemplates(customTemplates.filter((t) => t.id !== id));
    });
  }

  const filteredExercises = search
    ? allExercises.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Choose a Template
        </h2>
        <button
          onClick={() => setShowEditor(!showEditor)}
          className="text-xs text-[var(--color-text-muted)] underline hover:text-white"
        >
          {showEditor ? "Cancel" : "+ Create custom"}
        </button>
      </div>

      {/* Custom template editor */}
      {showEditor && (
        <div className="rounded-2xl border border-white/20 bg-[var(--color-surface)] p-5">
          <h3 className="mb-3 text-sm font-semibold">New Custom Template</h3>
          <div className="space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Template name (e.g. Wednesday Heavy)"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]/50"
            />
            <select
              value={newSplit}
              onChange={(e) => setNewSplit(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm"
            >
              <option value="custom">Custom split</option>
              <option value="PPL">Push/Pull/Legs</option>
              <option value="Upper/Lower">Upper/Lower</option>
              <option value="Full Body">Full Body</option>
              <option value="Bro Split">Bro Split</option>
            </select>

            {/* Exercise search + add */}
            <div>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exercises to add..."
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]/50"
              />
              {search && filteredExercises.length > 0 && (
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {filteredExercises.slice(0, 10).map((ex) => (
                    <button
                      key={ex.id}
                      onClick={() => addExerciseToTemplate(ex)}
                      className="block w-full rounded bg-[var(--color-surface-2)] px-3 py-1.5 text-left text-xs hover:bg-white/10"
                    >
                      <span className="font-medium">{ex.name}</span>
                      <span className="ml-2 capitalize text-[var(--color-text-muted)]">
                        {ex.muscleGroup}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Picked exercises */}
            {pickedExercises.length > 0 && (
              <div className="space-y-2 rounded-lg bg-[var(--color-surface-2)] p-3">
                {pickedExercises.map((pe, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 font-medium">{pe.exerciseName}</span>
                    <input
                      type="number"
                      value={pe.targetSets}
                      onChange={(e) =>
                        updatePickedExercise(idx, "targetSets", parseInt(e.target.value) || 1)
                      }
                      className="w-12 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-center tabular-nums"
                    />
                    <span className="text-[var(--color-text-muted)]">×</span>
                    <input
                      type="number"
                      value={pe.targetReps}
                      onChange={(e) =>
                        updatePickedExercise(idx, "targetReps", parseInt(e.target.value) || 1)
                      }
                      className="w-12 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-0.5 text-center tabular-nums"
                    />
                    <button
                      onClick={() => removePickedExercise(idx)}
                      className="rounded px-1.5 text-[var(--color-text-muted)] hover:bg-red-500/20 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={saveTemplate}
              disabled={isPending || !newName.trim() || pickedExercises.length === 0}
              className="w-full rounded-lg bg-white/10 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-30"
            >
              Save Template
            </button>
          </div>
        </div>
      )}

      {/* Custom templates */}
      {customTemplates.map((tpl) => (
        <div
          key={tpl.id}
          className={`group relative rounded-2xl border p-5 transition-all ${
            selected === tpl.name
              ? "border-white/30 bg-white/10"
              : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]/30"
          }`}
        >
          <button
            onClick={() => setSelected(tpl.name)}
            className="block w-full text-left"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{tpl.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {tpl.split} · custom
                </p>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">
                {tpl.exercises.length} exercises
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tpl.exercises.map((ex, i) => (
                <span
                  key={i}
                  className="rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                >
                  {ex.exerciseName} {ex.targetSets}×{ex.targetReps}
                </span>
              ))}
            </div>
          </button>
          <button
            onClick={() => deleteTemplate(tpl.id)}
            className="absolute right-3 top-3 rounded px-1.5 py-0.5 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
            title="Delete template"
          >
            ×
          </button>
        </div>
      ))}

      {/* Built-in templates */}
      {builtinTemplates.map((tpl) => (
        <button
          key={tpl.name}
          onClick={() => setSelected(tpl.name)}
          className={`block w-full rounded-2xl border p-5 text-left transition-all ${
            selected === tpl.name
              ? "border-white/30 bg-white/10"
              : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]/30"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold">{tpl.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{tpl.split}</p>
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">
              {tpl.exercises.length} exercises
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tpl.exercises.map((ex, i) => (
              <span
                key={i}
                className="rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]"
              >
                {ex.name}
              </span>
            ))}
          </div>
        </button>
      ))}

      <button
        onClick={() => setSelected("__freestyle__")}
        className={`block w-full rounded-2xl border p-5 text-left transition-all ${
          selected === "__freestyle__"
            ? "border-white/30 bg-white/10"
            : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]/30"
        }`}
      >
        <p className="font-semibold">Freestyle</p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Log any exercises — no template
        </p>
      </button>

      <button
        onClick={() => startWorkout(selected === "__freestyle__" ? null : selected)}
        disabled={!selected || isPending}
        className="w-full rounded-xl bg-emerald-500/20 py-3 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:opacity-30"
      >
        {isPending ? "Starting..." : "Start Workout"}
      </button>
    </div>
  );
}
