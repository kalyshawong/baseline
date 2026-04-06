"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface MacroEstimate {
  description: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const mealTypes = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snack" },
] as const;

function currentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function NutritionInput({ dateStr }: { dateStr?: string } = {}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mealType, setMealType] = useState<string>("snack");
  const [time, setTime] = useState(currentTimeString);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<MacroEstimate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    setResults(null);

    // Build timestamp from the viewed date + chosen time
    const baseDate = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const [h, m] = time.split(":").map(Number);
    const eatenAt = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), h, m);

    startTransition(async () => {
      try {
        const res = await fetch("/api/nutrition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            mealType,
            eatenAt: eatenAt.toISOString(),
            date: dateStr,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to log nutrition");
        }
        const data = await res.json();
        setResults(data.estimates);
        setText("");
        setTime(currentTimeString());
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Log Food
      </h2>
      <form onSubmit={handleSubmit}>
        {/* Meal type selector */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          {mealTypes.map((mt) => (
            <button
              key={mt.id}
              type="button"
              onClick={() => setMealType(mt.id)}
              className={`rounded-lg border py-2 text-xs font-medium transition-all ${
                mealType === mt.id
                  ? "border-white/30 bg-white/10 text-white"
                  : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]/50"
              }`}
            >
              {mt.label}
            </button>
          ))}
        </div>

        {/* Time picker */}
        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs text-[var(--color-text-muted)]">Time eaten:</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-xs [color-scheme:dark]"
          />
        </div>

        {/* Food text */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="3 eggs, 200g ground beef, 1 cup rice, 1 avocado"
          rows={2}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)]/50 resize-none"
        />
        <button
          type="submit"
          disabled={isPending || !text.trim()}
          className="mt-2 w-full rounded-xl bg-white/10 py-2.5 text-sm font-medium transition-colors hover:bg-white/20 disabled:opacity-30"
        >
          {isPending ? "Estimating macros..." : "Log Meal"}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {results && results.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {results.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{r.description}</p>
                <p className="text-[var(--color-text-muted)] truncate">{r.foodName}</p>
              </div>
              <div className="ml-3 flex shrink-0 gap-3 font-mono text-[var(--color-text-muted)]">
                <span>{r.calories}<span className="opacity-50">cal</span></span>
                <span className="text-blue-400">{r.protein}<span className="opacity-50">p</span></span>
                <span className="text-amber-400">{r.carbs}<span className="opacity-50">c</span></span>
                <span className="text-rose-400">{r.fat}<span className="opacity-50">f</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
