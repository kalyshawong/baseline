"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

interface Entry {
  id: string;
  description: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: string;
  eatenAt: string;
}

const mealOrder = ["breakfast", "lunch", "dinner", "snack"];

const mealLabels: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function NutritionLog({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (entries.length === 0) return null;

  function handleDelete(entryId: string) {
    startTransition(async () => {
      const res = await fetch("/api/nutrition", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId }),
      });
      if (res.ok) {
        router.refresh();
      }
    });
  }

  // Group entries by meal type
  const grouped = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = entry.mealType || "snack";
    const list = grouped.get(key) ?? [];
    list.push(entry);
    grouped.set(key, list);
  }

  // Sort meal groups in natural order
  const sortedGroups = Array.from(grouped.entries()).sort(
    (a, b) => mealOrder.indexOf(a[0]) - mealOrder.indexOf(b[0])
  );

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Today&apos;s Food Log
      </h2>
      <div className="space-y-4">
        {sortedGroups.map(([mealType, items]) => {
          const totalCals = Math.round(items.reduce((s, e) => s + e.calories, 0));
          const totalProt = Math.round(items.reduce((s, e) => s + e.protein, 0) * 10) / 10;
          const totalCarbs = Math.round(items.reduce((s, e) => s + e.carbs, 0) * 10) / 10;
          const totalFat = Math.round(items.reduce((s, e) => s + e.fat, 0) * 10) / 10;

          // Use earliest eaten time for this meal group
          const sortedByTime = [...items].sort(
            (a, b) => new Date(a.eatenAt).getTime() - new Date(b.eatenAt).getTime()
          );
          const mealTime = formatTime(sortedByTime[0].eatenAt);

          return (
            <div key={mealType}>
              {/* Meal header */}
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {mealLabels[mealType] ?? mealType}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">{mealTime}</span>
                </div>
                <div className="flex gap-3 text-xs font-mono text-[var(--color-text-muted)]">
                  <span>{totalCals}<span className="opacity-50">cal</span></span>
                  <span className="text-blue-400">{totalProt}<span className="opacity-50">p</span></span>
                  <span className="text-amber-400">{totalCarbs}<span className="opacity-50">c</span></span>
                  <span className="text-rose-400">{totalFat}<span className="opacity-50">f</span></span>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-1">
                {sortedByTime.map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex items-center gap-3 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{entry.description}</p>
                      <p className="truncate text-[var(--color-text-muted)]">{entry.foodName}</p>
                    </div>
                    <div className="flex shrink-0 gap-3 font-mono text-[var(--color-text-muted)]">
                      <span>{entry.calories}<span className="opacity-50">cal</span></span>
                      <span className="text-blue-400">{entry.protein}<span className="opacity-50">p</span></span>
                      <span className="text-amber-400">{entry.carbs}<span className="opacity-50">c</span></span>
                      <span className="text-rose-400">{entry.fat}<span className="opacity-50">f</span></span>
                    </div>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      disabled={isPending}
                      className="shrink-0 rounded px-1.5 py-0.5 text-[var(--color-text-muted)] opacity-0 transition-opacity hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100 disabled:opacity-50"
                      title="Delete entry"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
