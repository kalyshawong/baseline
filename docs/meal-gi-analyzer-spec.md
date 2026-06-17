# Spec — `meal-gi.ts` (meal → GI-outcome backward analyzer)

Status: draft · sits in `src/lib`, sibling to `insights.ts` and `correlation.ts`.

## Purpose

Find which pre-workout meal factors cluster with GI failures (nausea / vomiting /
having to stop), so Coach can warn before a session and Mind can confirm the
suspect with an experiment. This is the **backward / hypothesis-generating** half.
It does NOT prove causation — that's Mind's `correlation.ts`.

---

## ⚠️ Blocker 0 — the outcome variable doesn't exist yet

`WorkoutNote` has `narrative` (free text), `analysis`, `signalSnapshot`. There is
**no structured GI field**. The vomit events live inside prose. You cannot analyze
a label you never recorded.

Pick one before any stats:

- **(A) Structured field, going forward.** Add `giOutcome` to `WorkoutNote`:
  `none | mild | moderate | vomited` (or a 0–3 int). Cleanest, but only labels
  *future* sessions — slow to accumulate.
- **(B) Classify existing narratives.** One-time pass: run each `narrative`
  through a classifier (keyword + LLM fallback) → same `giOutcome` enum, stored
  back on the row. Unlocks your history immediately. Recommended; do A as well so
  new notes are labeled at write time.

Either way the analyzer reads a single resolved field, not free text.

### Sample-size reality check (do this first)
Count notes where `giOutcome != none`. If that's < ~6, stop — there's nothing to
analyze yet, and Coach should say exactly that ("watching — only 3 GI events
logged, not enough to call a pattern") rather than invent one. Honor the
no-invented-data rule: report `n` too small instead of a confident guess.

---

## Inputs (all already exist)

For each labeled workout:

| Factor | Source | Notes |
|---|---|---|
| GI outcome | `WorkoutNote.giOutcome` (Blocker 0) | the dependent variable |
| pre-workout macros | `getPreWorkoutFuel(start, 4)` → `totals` | carbs / protein / fat (g) |
| last-meal gap | same → `lastMealGapHours` | upper bound when `includesEstimated` |
| food tags | `NutritionEntry.foodName` / `description` | needs a tagger (below) |
| meal source | `NutritionEntry.source` (`MealSource`) | restaurant / takeout vs home |

### Two small input additions
1. **Expose `source` + tags on `FuelItem`.** `pre-workout-fuel.ts` currently drops
   `source` and doesn't tag food type. Add `source` and a `tags: string[]` to
   `FuelItem` so the analyzer sees "red meat", "high fat", "fried".
2. **Food tagger.** Map `foodName` → coarse tags (`red_meat`, `dairy`, `fried`,
   `high_fiber`, `high_fat`). Keyword table is fine v1; this is the only new
   classification logic.

### Factors to test (v1)
- carbs in 4h band: `>=40g` vs `<15g` (your fueled/low-carb threshold)
- last-meal gap: `<2h` vs `>=2h`
- `red_meat` present vs absent
- fat in 4h band: high (`>=25g`) vs low
- meal `source`: restaurant/takeout vs home_cooked

---

## Output — mirror the `Insight` shape

Return the **same interface Coach already consumes** from `insights.ts`, so
`coach-context.ts` needs zero new plumbing:

```ts
interface GiPattern {
  factor: string;            // "red meat within 4h"
  withRate: number;          // GI-failure rate WITH the factor (0..1)
  withoutRate: number;       // ...WITHOUT
  withN: number;
  withoutN: number;
  pValue: number;            // Fisher's exact — NOT Welch (see below)
  significance: "significant" | "suggestive" | "watching";
  controlLabel: string;      // "vs sessions without red meat in 4h band"
  confounders: string[];     // factors that co-move — the honesty field
  recommendation: string;    // calibrated, with a path to prove
}
```

`confounders` is the field that keeps Coach honest: if "red meat" days are also
"short gap" days, list `["short last-meal gap"]` so Coach can't claim a clean cause.

---

## ⚠️ Blocker 1 — stats: binary outcome ≠ t-test

`welchTTest` in `correlation.ts` / `insights.ts` compares **continuous means**.
GI outcome is a **rate**. Use:

- **Fisher's exact test** on the 2×2 (factor present/absent × failed/clean).
  Correct at small n, which is what you'll have. Don't reuse `welchTTest`.
- Report **rates and the raw 2×2 counts**, not a mean difference.
- Significance tiers by n + p: `watching` when either cell < ~5, `suggestive`
  p<0.1, `significant` p<0.05. Never promote above `watching` on a single-digit n.

---

## ⚠️ Blocker 2 — confounds are unavoidable here

Your factors co-move (we established this). The analyzer reports the **cluster**,
not a winner. It surfaces every factor that tracks with failures, tags the
overlaps in `confounders`, and explicitly hands the top suspect to Mind:

> "These three travel together in your logs — I can't tell which is guilty.
>  Run the experiment on `<top factor>` to isolate it."

That handoff is the whole point of the pipeline: backward finds suspects,
forward convicts one.

---

## How Coach phrases it (`coach-context.ts`)

Calibrated language, confidence + a path to prove. Never state a backward pattern
as fact.

- **significant, no confounders:** "Red meat within 4h tracks hard with your GI
  failures (5 of 6 vs 1 of 9). Worth avoiding before Saturday — and worth proving
  in Mind."
- **suggestive / confounded:** "Pattern I'm watching: red meat *and* short gaps
  both show up on your throw-up days — they overlap, so I can't separate them yet.
  Want to test red meat alone?"
- **watching / n too small:** "Only 3 GI events logged so far — not enough to call
  a pattern. Keep logging the outcome and I'll flag it when it's real."

Rule, lifted from the dashboard-cards principle: Coach never voices a GI pattern
without (1) a confidence level and (2) a path to prove it.

---

## Build order

1. Add `giOutcome` to `WorkoutNote` + the narrative classifier (Blocker 0).
2. Extend `FuelItem` with `source` + `tags`; write the food tagger.
3. `meal-gi.ts`: pull labeled sessions → build 2×2 per factor → Fisher's exact →
   `GiPattern[]`, mirroring `Insight`.
4. Wire into `coach-context.ts` next to the `generateInsights` call.
5. "Test this" on a `GiPattern` deep-links to Mind's experiment/new, pre-filling
   the factor as the independent variable.
