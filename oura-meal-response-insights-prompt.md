# Claude Code Prompt: Meal Source Response Insights (v2)

## Context

This builds on the meal source tag feature (v1), which added a `source` field to each logged meal: `home_cooked`, `takeout`, `restaurant`, `pre_packaged`.

Now that we're capturing source, we want to surface the *insight*: how does the user's body respond differently to meals from different sources? The core job-to-be-done is "I ate X yesterday — that's why my body feels like Y today."

This is intentionally narrow scope. We are NOT building:

- A full nutrition-to-biometric correlation engine.
- Per-meal macro accuracy improvements.
- A predictive "tomorrow's run forecast."

We ARE building one insight surface: a weekly comparison of body response across meal sources, so the user can see patterns like "takeout dinners correlate with lower sleep scores for me."

## What to build

A new **Weekly Patterns** card on the home dashboard, refreshed every Sunday morning.

### The card

A single card showing, for the past 7 days:

- A small bar chart or two-row comparison: average readiness score and average sleep score, segmented by meal source.
- A one-sentence headline generated from the data, e.g.:
  - "Your sleep score was 12 points lower on takeout days this week."
  - "Home-cooked dinners and restaurant dinners tracked about the same this week."
  - "Not enough data yet — log a few more meals to see patterns."
- A "See full breakdown" link that opens a more detailed view (out of scope for this PR — just stub the route).

### Data model

No schema changes required. The data is already there:

- `Meal` records (with the new `source` field from v1).
- `DailyReadiness` and `DailySleep` records (existing Oura data).

### Computation

For each day in the past 7:

1. Look at the meals logged that day.
2. Determine the day's "dominant source" — the source of the largest meal (by calories) of the day. If no meals logged, skip.
3. Join with the next day's readiness and sleep scores (food impact shows up the *following* morning, not the same day).
4. Group days by dominant source. Average readiness and sleep scores per group.
5. Pick the largest delta between two groups. If it's > 5 points, surface it in the headline. Otherwise, default to a neutral headline.

### Edge cases to handle

- Fewer than 3 days with a given source → don't include that source in the comparison.
- Fewer than 5 days of data total → show the "not enough data" state.
- Days with no meals logged → exclude from the analysis, don't infer.

### Out of scope

- Time-of-day effects (breakfast vs dinner).
- Macro-level analysis (carbs, protein, fat).
- Multi-week trends — just the past 7 days for now.
- Per-restaurant breakdowns.
- Statistical significance / confidence intervals — this is a directional pattern card, not a research tool. Use the >5 point threshold as a crude floor.

## Acceptance criteria

- [ ] A "Weekly Patterns" card appears on the home dashboard, refreshed every Sunday.
- [ ] The card shows readiness + sleep averages segmented by dominant meal source for the past 7 days.
- [ ] The headline reflects the largest delta when one exists, or a neutral default when patterns are weak.
- [ ] Empty/insufficient data state renders cleanly.
- [ ] "See full breakdown" link is wired up to a stub route.
- [ ] Tests cover: happy path with clear pattern, insufficient data, mixed sources, no meals logged.

## Open decisions to flag

- Whether to use "dominant source by calories" or "dominant source by meal count" — I have a slight preference for calories but want to see what the data looks like.
- Whether the >5 point threshold for surfacing a delta is the right floor (might need tuning once we see real user data).
- Visual treatment of the comparison — bar chart vs two-row stat comparison. Show me both.

Start by checking what readiness/sleep data is available and how `Meal` joins to the daily score tables. Then propose a brief plan before writing code.
