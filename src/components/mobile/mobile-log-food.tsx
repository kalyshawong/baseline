"use client";

import { useState } from "react";
import { FoodConfirm, useFoodDraft } from "@/components/mind/food-confirm";
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
  { id: "home_cooked", label: "Home" },
  { id: "takeout", label: "Takeout" },
  { id: "restaurant", label: "Restaurant" },
  { id: "pre_packaged", label: "Packaged" },
];

function currentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function MobileLogFood({
  dateStr,
  bare = false,
  recipes = [],
}: { dateStr?: string; bare?: boolean; recipes?: { name: string; kcal: number }[] } = {}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mealType, setMealType] = useState("snack");
  const [source, setSource] = useState("home_cooked");
  const [time, setTime] = useState(currentTimeString);
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [results, setResults] = useState<MacroEstimate[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Form fields sent with both steps (preview and confirm). eatenAt kept as a
  // legacy fallback; the server prefers the literal wall time in `time`.
  function fields() {
    const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
    const [h, m] = timeUnknown ? [0, 0] : time.split(":").map(Number);
    const eatenAt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
    return { mealType, source, time: timeUnknown ? null : time, eatenAt: eatenAt.toISOString(), date: dateStr, timeUnknown };
  }
  const flow = useFoodDraft(fields);
  const isPending = flow.isPending;
  const error = flow.error;

  // Tier 1: estimate and show it back. Nothing is saved until she confirms.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setResults(null);
    setNotice(null);
    flow.estimate(text.trim());
  }

  function onLogged(data: { savedRecipes?: string[]; estimates: MacroEstimate[] }) {
    setNotice(
      data.savedRecipes?.length
        ? `You log this a lot — saved as a recipe: ${data.savedRecipes.join(", ")}`
        : null,
    );
    setResults(data.estimates);
    setText("");
    setSource("home_cooked");
    setTime(currentTimeString());
    setTimeUnknown(false);
    router.refresh();
  }


  return (
    <div className={bare ? undefined : "panel"}>
      {!bare && <div className="ph"><span className="ov">Log Food</span></div>}
      <form onSubmit={handleSubmit}>
        {bare && <div className="mi-lbl">Meal</div>}
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
        {bare && <div className="mi-lbl">From</div>}
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
            {bare ? "Time eaten" : "Time"}
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

        {recipes.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="ov" style={{ marginBottom: 7 }}>Your recipes</div>
            <div className="chips">
              {recipes.map((r) => (
                <button key={r.name} type="button" onClick={() => setText(r.name)} className={`tagchip ${text === r.name ? "on" : ""}`}>
                  {r.name} · {r.kcal} cal
                </button>
              ))}
            </div>
          </div>
        )}
        <textarea
          className="field"
          style={{ marginBottom: 11 }}
          rows={2}
          value={text}
          onChange={(e) => { setText(e.target.value); if (flow.draft) flow.cancel(); }}
          placeholder="3 eggs, 200g ground beef, 1 cup rice…"
        />
        {flow.draft ? (
          <FoodConfirm flow={flow} onLogged={onLogged} />
        ) : (
          <button type="submit" className="btn block" disabled={isPending || !text.trim()}>
            {isPending ? "Estimating…" : "Estimate"}
          </button>
        )}
      </form>

      {error && !flow.draft && <p style={{ marginTop: 8, fontSize: 12, color: "var(--red)" }}>{error}</p>}
      {notice && <p style={{ marginTop: 8, fontSize: 12 }}>{notice}</p>}

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
