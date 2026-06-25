"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Mobile Log Food — faithful to the "Baseline iOS" Mind mock (segmented meal
 * type + source, time, textarea, Log Meal). Same /api/nutrition endpoint as the
 * desktop NutritionInput, so macro estimation behaves identically.
 */

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
];
const mealSources = [
  { id: "home_cooked", label: "Home cooked" },
  { id: "takeout", label: "Takeout" },
  { id: "restaurant", label: "Restaurant" },
  { id: "pre_packaged", label: "Pre-packaged" },
];

function currentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function MobileLogFood({ dateStr }: { dateStr?: string } = {}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mealType, setMealType] = useState("snack");
  const [source, setSource] = useState("home_cooked");
  const [time, setTime] = useState(currentTimeString);
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<MacroEstimate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    setResults(null);
    const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const [h, m] = timeUnknown ? [0, 0] : time.split(":").map(Number);
    const eatenAt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);

    startTransition(async () => {
      try {
        const res = await fetch("/api/nutrition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: text.trim(),
            mealType,
            source,
            eatenAt: eatenAt.toISOString(),
            date: dateStr,
            timeUnknown,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to log nutrition");
        }
        const data = await res.json();
        setResults(data.estimates);
        setText("");
        setSource("home_cooked");
        setTime(currentTimeString());
        setTimeUnknown(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <div className="panel">
      <div className="ph"><span className="ov">Log Food</span></div>
      <form onSubmit={handleSubmit}>
        <div className="seg c2">
          {mealTypes.map((mt) => (
            <div
              key={mt.id}
              className={`opt ${mealType === mt.id ? "on" : ""}`}
              onClick={() => setMealType(mt.id)}
            >
              {mt.label}
            </div>
          ))}
        </div>
        <div className="seg c2">
          {mealSources.map((ms) => (
            <div
              key={ms.id}
              className={`opt ${source === ms.id ? "on" : ""}`}
              onClick={() => setSource(ms.id)}
            >
              {ms.label}
            </div>
          ))}
        </div>

        <div className="frow">
          <div className="l">
            Time
            {!timeUnknown && (
              <input
                type="time"
                className="timefield"
                style={{ colorScheme: "dark" }}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-label="Time eaten"
              />
            )}
          </div>
          <label className="check" aria-checked={timeUnknown}>
            <input
              type="checkbox"
              checked={timeUnknown}
              onChange={(e) => setTimeUnknown(e.target.checked)}
              style={{ accentColor: "var(--gold)" }}
            />
            Forgot time
          </label>
        </div>

        <textarea
          className="field"
          style={{ marginBottom: 11 }}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="3 eggs, 200g ground beef, 1 cup rice…"
        />
        <button type="submit" className="btn block" disabled={isPending || !text.trim()}>
          {isPending ? "Estimating macros…" : "Log Meal"}
        </button>
      </form>

      {error && <p style={{ marginTop: 8, fontSize: 12, color: "var(--red)" }}>{error}</p>}

      {results && results.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {results.map((r, i) => (
            <div className="permeal" key={i} style={{ marginTop: 0 }}>
              <div className="m" style={{ alignItems: "center" }}>
                <span style={{ minWidth: 0 }}>{r.description}</span>
                <span className="amt num">
                  {r.calories}c · {r.protein}p
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
