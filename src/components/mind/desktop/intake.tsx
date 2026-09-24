"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Desktop Mind handoff (2026-09-23) — Today's intake: the day's total and
 * macros always visible, each meal a collapsed row that opens to its items.
 * Same delete / "that's everything" actions as NutritionLog.
 */

export interface IntakeEntry {
  id: string;
  description: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealType: string;
  source: string | null;
  eatenAt: string;
  timeUnknown: boolean;
}

// Same rough daily targets MacroSummary uses.
const TARGETS = { calories: 2000, protein: 140, carbs: 200, fat: 65 };
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];
const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
const SOURCE_LABEL: Record<string, string> = {
  home_cooked: "Home cooked",
  takeout: "Takeout",
  restaurant: "Restaurant",
  pre_packaged: "Pre-packaged",
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (v: number, max: number) => `${Math.min(100, (v / max) * 100)}%`;

export function Intake({
  totals,
  entries,
  dateStr,
  mealsComplete,
  tz,
}: {
  totals: { calories: number; protein: number; carbs: number; fat: number } | null;
  entries: IntakeEntry[];
  dateStr: string;
  mealsComplete: boolean;
  tz: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send(method: "DELETE" | "PATCH", body: object, fail: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/nutrition", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
      else setError(fail);
    });
  }

  const cal = Math.round(totals?.calories ?? 0);
  const P = Math.round(totals?.protein ?? 0);
  const C = Math.round(totals?.carbs ?? 0);
  const F = Math.round(totals?.fat ?? 0);

  const groups = new Map<string, IntakeEntry[]>();
  for (const e of entries) {
    const k = e.mealType || "snack";
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const meals = [...groups.entries()].sort((a, b) => MEAL_ORDER.indexOf(a[0]) - MEAL_ORDER.indexOf(b[0]));
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });

  return (
    <div className="p">
      <div className="p-h">
        <span className="ov">Today&apos;s intake</span>
      </div>
      <div className="tot">
        <span className="big num">{cal}</span>
        <span className="of">/ {TARGETS.calories} cal</span>
        <span className="items">
          {entries.length} {entries.length === 1 ? "item" : "items"} logged
        </span>
      </div>
      <div className="bar">
        <i style={{ width: pct(cal, TARGETS.calories) }} />
      </div>
      <div className="macros">
        {(
          [
            ["Protein", P, TARGETS.protein, "bp"],
            ["Carbs", C, TARGETS.carbs, "bc"],
            ["Fat", F, TARGETS.fat, "bf"],
          ] as const
        ).map(([label, v, max, cls]) => (
          <div key={label} className="m">
            <div className="top">
              <span>{label}</span>
              <b className="num">{v}g</b>
            </div>
            <div className={`bar ${cls}`}>
              <i style={{ width: pct(v, max) }} />
            </div>
          </div>
        ))}
      </div>

      {error && <p className="err">{error}</p>}

      {meals.map(([meal, items]) => {
        const sorted = [...items].sort((a, b) => a.eatenAt.localeCompare(b.eatenAt));
        const when = items.every((e) => e.timeUnknown) ? "sometime today" : fmt(sorted[0].eatenAt);
        const sum = (k: "calories" | "protein" | "carbs" | "fat") => items.reduce((s, e) => s + e[k], 0);
        return (
          <details key={meal} className="meal">
            <summary>
              <span className="car">▶</span>
              <span className="nm">
                {MEAL_LABEL[meal] ?? meal}
                <span>{when}</span>
              </span>
              <span className="mac">
                <span className="cal">
                  {Math.round(sum("calories"))}
                  <small>cal</small>
                </span>
                <span className="cp">{r1(sum("protein"))}p</span>
                <span className="cc">{r1(sum("carbs"))}c</span>
                <span className="cf">{r1(sum("fat"))}f</span>
              </span>
            </summary>
            <ul className="items-l">
              {sorted.map((e) => (
                <li key={e.id}>
                  <div className="in">
                    <b>{e.description}</b>
                    <span>
                      {e.foodName}
                      {e.source && SOURCE_LABEL[e.source] && ` · ${SOURCE_LABEL[e.source]}`}
                    </span>
                  </div>
                  <span className="mac">
                    <span className="cal">{e.calories}</span>
                    <span className="cp">{e.protein}p</span>
                    <span className="cc">{e.carbs}c</span>
                    <span className="cf">{e.fat}f</span>
                  </span>
                  <button
                    type="button"
                    className="x"
                    title="Delete entry"
                    disabled={isPending}
                    onClick={() => send("DELETE", { entryId: e.id }, "Failed to delete entry")}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </details>
        );
      })}

      {entries.length === 0 ? (
        <p className="empty" style={{ marginTop: 14 }}>
          No food logged today.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="confirm"
            disabled={isPending}
            style={mealsComplete ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}
            onClick={() => send("PATCH", { date: dateStr, mealsComplete: !mealsComplete }, "Failed to update day")}
          >
            {mealsComplete ? "✓ That’s everything I ate today" : "That’s everything I ate today"}
          </button>
          <div className="fine">
            One or two meals is a normal day. Confirming tells Baseline the gaps were real fasting windows, not
            unlogged meals — unconfirmed days stay unknown, never “skipped.”
          </div>
        </>
      )}
    </div>
  );
}
