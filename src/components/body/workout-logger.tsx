"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { estimate1RM } from "@/lib/training";

interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  isCompound: boolean;
  defaultSets: number;
  defaultReps: number;
}

interface LoggedSet {
  id: string;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  setNumber: number;
  reps: number;
  weight: number;
  rpe: number | null;
  isWarmup: boolean;
  isPR: boolean;
}

interface PreviousSessionSet {
  weight: number;
  reps: number;
  rpe: number | null;
}

export function WorkoutLogger({
  sessionId,
  exercises,
  initialSets,
  previousByExercise,
  templateExercises,
}: {
  sessionId: string;
  exercises: Exercise[];
  initialSets: LoggedSet[];
  previousByExercise: Record<string, PreviousSessionSet[]>;
  templateExercises?: { name: string; targetSets: number; targetReps: number }[];
}) {
  const router = useRouter();
  const [sets, setSets] = useState<LoggedSet[]>(initialSets);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    templateExercises?.[0]
      ? exercises.find((e) => e.name === templateExercises[0].name)?.id ?? null
      : null
  );
  const [search, setSearch] = useState("");
  const [reps, setReps] = useState<number>(0);
  const [weight, setWeight] = useState<number>(0);
  const [rpe, setRpe] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Rest timer
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState(false);

  // RPE load suggestions keyed by exerciseId
  const [rpeSuggestions, setRpeSuggestions] = useState<
    Record<
      string,
      {
        action: "increase" | "hold" | "decrease";
        avgRpe: number | null;
        lastWeight: number | null;
        lastReps: number | null;
        message: string;
      }
    >
  >({});

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  // Fetch RPE suggestions for all exercises in the session (template + logged)
  useEffect(() => {
    const exerciseIds = new Set<string>();
    if (templateExercises) {
      for (const te of templateExercises) {
        const ex = exercises.find((e) => e.name === te.name);
        if (ex) exerciseIds.add(ex.id);
      }
    }
    for (const s of initialSets) exerciseIds.add(s.exerciseId);

    if (exerciseIds.size === 0) return;

    fetch("/api/workouts/rpe-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseIds: Array.from(exerciseIds) }),
    })
      .then((r) => r.json())
      .then((data) => setRpeSuggestions(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedExercise = exercises.find((e) => e.id === selectedExerciseId);
  const filteredExercises = search
    ? exercises.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase())
      )
    : exercises;

  const previousSets = selectedExercise
    ? previousByExercise[selectedExercise.id] ?? []
    : [];

  const currentSuggestion = selectedExerciseId
    ? rpeSuggestions[selectedExerciseId]
    : null;

  // Fetch suggestion if the selected exercise doesn't have one yet
  useEffect(() => {
    if (!selectedExerciseId || rpeSuggestions[selectedExerciseId]) return;
    fetch("/api/workouts/rpe-suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exerciseIds: [selectedExerciseId] }),
    })
      .then((r) => r.json())
      .then((data) =>
        setRpeSuggestions((prev) => ({ ...prev, ...data }))
      );
  }, [selectedExerciseId, rpeSuggestions]);

  const exerciseSetCount = selectedExercise
    ? sets.filter((s) => s.exerciseId === selectedExercise.id && !s.isWarmup).length
    : 0;

  function formatTimer(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  async function logSet() {
    if (!selectedExercise || reps <= 0 || weight < 0) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/workouts/${sessionId}/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exerciseId: selectedExercise.id,
            setNumber: exerciseSetCount + 1,
            reps,
            weight,
            rpe,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          setError(data.error ?? "Failed to log set");
          return;
        }
        const newSet = await res.json();
        setSets([
          ...sets,
          {
            id: newSet.id,
            exerciseId: selectedExercise.id,
            exerciseName: selectedExercise.name,
            muscleGroup: selectedExercise.muscleGroup,
            setNumber: newSet.setNumber,
            reps,
            weight,
            rpe,
            isWarmup: false,
            isPR: newSet.isPR,
          },
        ]);
        setTimerSeconds(0);
        setTimerRunning(true);
        setRpe(null);
      } catch {
        setError("Failed to log set — check connection");
      }
    });
  }

  async function deleteSet(setId: string) {
    startTransition(async () => {
      const res = await fetch(`/api/workouts/${sessionId}/sets/${setId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSets(sets.filter((s) => s.id !== setId));
      } else {
        setError("Failed to delete set");
      }
    });
  }

  async function finishWorkout() {
    startTransition(async () => {
      const res = await fetch(`/api/workouts/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedAt: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        router.push("/body");
      } else {
        setError("Failed to finish workout");
      }
    });
  }

  const sessionVolume = sets
    .filter((s) => !s.isWarmup)
    .reduce((sum, s) => sum + s.weight * s.reps, 0);
  const sessionE1RM = selectedExercise
    ? sets
        .filter((s) => s.exerciseId === selectedExercise.id && !s.isWarmup)
        .reduce((max, s) => Math.max(max, estimate1RM(s.weight, s.reps)), 0)
    : 0;

  // Group sets by exercise for display
  const setsByExercise = new Map<string, LoggedSet[]>();
  for (const s of sets) {
    const list = setsByExercise.get(s.exerciseId) ?? [];
    list.push(s);
    setsByExercise.set(s.exerciseId, list);
  }

  return (
    <div className="space-y-6">
      {/* Rest Timer */}
      {timerRunning && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Rest timer</p>
              <p className="font-mono text-2xl font-bold tabular-nums">
                {formatTimer(timerSeconds)}
              </p>
            </div>
            <button
              onClick={() => {
                setTimerRunning(false);
                setTimerSeconds(0);
              }}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm transition-colors hover:bg-white/20"
            >
              Stop
            </button>
          </div>
        </div>
      )}

      {/* Exercise Selection */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          Exercise
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises..."
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]/50"
        />
        {templateExercises && templateExercises.length > 0 && !search && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">Template</p>
            <div className="flex flex-wrap gap-2">
              {templateExercises.map((te, i) => {
                const ex = exercises.find((e) => e.name === te.name);
                if (!ex) return null;
                const done = sets.filter((s) => s.exerciseId === ex.id && !s.isWarmup).length;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedExerciseId(ex.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                      selectedExerciseId === ex.id
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]/50"
                    }`}
                  >
                    {te.name} ({done}/{te.targetSets})
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {search && (
          <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
            {filteredExercises.slice(0, 20).map((ex) => (
              <button
                key={ex.id}
                onClick={() => {
                  setSelectedExerciseId(ex.id);
                  setSearch("");
                }}
                className="block w-full rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-left text-xs hover:bg-white/10"
              >
                <span className="font-medium">{ex.name}</span>
                <span className="ml-2 text-[var(--color-text-muted)] capitalize">
                  {ex.muscleGroup}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Set Logger */}
      {selectedExercise && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="text-lg font-bold">{selectedExercise.name}</p>
              <p className="text-xs text-[var(--color-text-muted)] capitalize">
                {selectedExercise.muscleGroup}
                {selectedExercise.isCompound && " · compound"}
              </p>
            </div>
            {exerciseSetCount > 0 && (
              <div className="text-right text-xs text-[var(--color-text-muted)]">
                <p>Est 1RM</p>
                <p className="font-mono text-sm font-bold text-white">
                  {Math.round(sessionE1RM)}
                </p>
              </div>
            )}
          </div>

          {/* Previous session reference */}
          {error && (
            <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* RPE-based load suggestion */}
          {currentSuggestion && currentSuggestion.avgRpe != null && (
            <div
              className={`mb-3 rounded-lg border p-3 text-xs ${
                currentSuggestion.action === "increase"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : currentSuggestion.action === "decrease"
                    ? "border-red-500/30 bg-red-500/10 text-red-400"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {currentSuggestion.action === "increase" && "↑ Increase weight"}
                  {currentSuggestion.action === "hold" && "→ Hold weight"}
                  {currentSuggestion.action === "decrease" && "↓ Decrease weight"}
                </span>
                <span className="font-mono text-[10px] opacity-70">
                  Zourdos 2016
                </span>
              </div>
              <p className="mt-1 leading-relaxed">{currentSuggestion.message}</p>
            </div>
          )}

          {previousSets.length > 0 && (
            <div className="mb-3 rounded-lg bg-[var(--color-surface-2)] p-3">
              <p className="mb-1 text-xs text-[var(--color-text-muted)]">
                Last session (target to beat)
              </p>
              <div className="flex flex-wrap gap-2">
                {previousSets.map((s, i) => (
                  <span
                    key={i}
                    className="rounded bg-[var(--color-bg)] px-2 py-1 text-xs font-mono"
                  >
                    {s.weight} × {s.reps}
                    {s.rpe != null && <span className="opacity-50"> @{s.rpe}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Input row */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)]">Reps</label>
              <input
                type="number"
                value={reps || ""}
                onChange={(e) => setReps(parseInt(e.target.value) || 0)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-center text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)]">Weight</label>
              <input
                type="number"
                step="0.5"
                value={weight || ""}
                onChange={(e) => setWeight(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-center text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-text-muted)]">RPE</label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                value={rpe ?? ""}
                onChange={(e) => setRpe(e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="—"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-2 text-center text-sm tabular-nums"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={logSet}
                disabled={isPending || reps <= 0}
                className="h-[38px] w-full rounded-lg bg-white/10 text-sm font-medium hover:bg-white/20 disabled:opacity-30"
              >
                Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logged Sets Summary */}
      {sets.length > 0 && (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              Session Log
            </h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              Volume: <span className="font-mono text-white">{Math.round(sessionVolume)}</span>
            </p>
          </div>
          <div className="space-y-3">
            {Array.from(setsByExercise.entries()).map(([exerciseId, exSets]) => {
              const exVolume = exSets
                .filter((s) => !s.isWarmup)
                .reduce((sum, s) => sum + s.weight * s.reps, 0);
              return (
                <div key={exerciseId}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{exSets[0].exerciseName}</span>
                    <span className="font-mono text-[var(--color-text-muted)]">
                      {Math.round(exVolume)} vol
                    </span>
                  </div>
                  <div className="mt-1 space-y-1">
                    {exSets.map((s) => (
                      <div
                        key={s.id}
                        className="group flex items-center gap-2 rounded bg-[var(--color-surface-2)] px-2 py-1 text-xs"
                      >
                        <span className="w-5 text-center text-[var(--color-text-muted)]">
                          {s.setNumber}
                        </span>
                        <span className="font-mono tabular-nums">
                          {s.weight} × {s.reps}
                        </span>
                        {s.rpe != null && (
                          <span className="font-mono text-[var(--color-text-muted)]">
                            @{s.rpe}
                          </span>
                        )}
                        {s.isPR && (
                          <span className="rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
                            PR
                          </span>
                        )}
                        <button
                          onClick={() => deleteSet(s.id)}
                          disabled={isPending}
                          className="ml-auto opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Finish button */}
      <button
        onClick={finishWorkout}
        disabled={isPending || sets.length === 0}
        className="w-full rounded-xl bg-emerald-500/20 py-3 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/30 disabled:opacity-30"
      >
        Finish Workout
      </button>
    </div>
  );
}
