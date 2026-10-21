"use client";

import { useState, useTransition } from "react";

/**
 * Two-step food logging (2026-10-21).
 * Tier 1: her description → POST /api/nutrition { preview: true } → items with
 *   a note of what was assumed, plus up to two questions. Nothing saved.
 * Tier 2: she answers (re-estimates) or drops items, then confirms → POST
 *   { items } saves exactly what she saw.
 * Functional layout only, built from the global .btn / .tagchip classes —
 * the visual design is hers to redo.
 */

export interface DraftItem {
  description: string;
  foodName: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  canonical?: string;
  note?: string;
}
export interface DraftQuestion {
  question: string;
  options: string[];
  assumed: string;
}
interface Draft {
  text: string;
  items: DraftItem[];
  questions: DraftQuestion[];
  answers: { question: string; answer: string }[];
}

async function post(body: object) {
  const res = await fetch("/api/nutrition", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Failed to log nutrition");
  return data;
}

/** `fields` = the form's meal/time/source/date fields (everything but text). */
export function useFoodDraft(fields: () => Record<string, unknown>) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  function preview(text: string, answers: Draft["answers"] = []) {
    run(async () => {
      const data = await post({ ...fields(), text, preview: true, answers });
      setDraft({ text, items: data.estimates ?? [], questions: data.questions ?? [], answers });
    });
  }

  return {
    draft,
    isPending,
    error,
    estimate: (text: string) => preview(text),
    answer: (q: DraftQuestion, option: string) => {
      if (!draft) return;
      // Already what the items assume → nothing to recompute.
      if (option === q.assumed) {
        setDraft({ ...draft, questions: draft.questions.filter((x) => x !== q), answers: [...draft.answers, { question: q.question, answer: option }] });
        return;
      }
      preview(draft.text, [...draft.answers, { question: q.question, answer: option }]);
    },
    remove: (i: number) => draft && setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) }),
    cancel: () => setDraft(null),
    confirm: (onLogged: (data: { savedRecipes?: string[]; estimates: DraftItem[] }) => void) => {
      if (!draft || draft.items.length === 0) return;
      run(async () => {
        const data = await post({ ...fields(), text: draft.text, items: draft.items });
        setDraft(null);
        onLogged(data);
      });
    },
  };
}

export function FoodConfirm({
  flow,
  onLogged,
}: {
  flow: ReturnType<typeof useFoodDraft>;
  onLogged: (data: { savedRecipes?: string[]; estimates: DraftItem[] }) => void;
}) {
  const d = flow.draft;
  if (!d) return null;
  const total = d.items.reduce(
    (t, i) => ({ cal: t.cal + i.calories, p: t.p + i.protein, c: t.c + i.carbs, f: t.f + i.fat }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );
  const r = (n: number) => Math.round(n);

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }} aria-busy={flow.isPending}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted, var(--dim))" }}>Is this right?</div>

      {d.items.length === 0 && (
        <p style={{ fontSize: 12 }}>Couldn&apos;t find any food in that. Edit the description and try again.</p>
      )}

      {d.items.map((it, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 8, alignItems: "start", fontSize: 13 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{it.description}</div>
            {it.note && <div style={{ fontSize: 11.5, color: "var(--color-text-muted, var(--dim))", marginTop: 2 }}>{it.note}</div>}
          </div>
          <span className="num" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {it.calories} cal · {r(it.protein)}p {r(it.carbs)}c {r(it.fat)}f
          </span>
          <button type="button" className="btn-ghost" aria-label={`Remove ${it.description}`} onClick={() => flow.remove(i)} disabled={flow.isPending}>
            ✕
          </button>
        </div>
      ))}

      {d.items.length > 1 && (
        <div style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          Total {r(total.cal)} cal · {r(total.p)}p {r(total.c)}c {r(total.f)}f
        </div>
      )}

      {d.questions.map((q) => (
        <div key={q.question}>
          <div style={{ fontSize: 12.5, marginBottom: 6 }}>{q.question}</div>
          <div className="chips">
            {q.options.map((o) => (
              <button
                key={o}
                type="button"
                className={`tagchip ${o === q.assumed ? "on" : ""}`}
                disabled={flow.isPending}
                onClick={() => flow.answer(q, o)}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn"
          style={{ flex: 1 }}
          disabled={flow.isPending || d.items.length === 0}
          onClick={() => flow.confirm(onLogged)}
        >
          {flow.isPending ? "Working…" : "Looks right, log it"}
        </button>
        <button type="button" className="btn-ghost" onClick={flow.cancel} disabled={flow.isPending}>
          Edit
        </button>
      </div>
      {flow.error && <p style={{ fontSize: 12, color: "var(--red, #f87171)" }}>{flow.error}</p>}
    </div>
  );
}
