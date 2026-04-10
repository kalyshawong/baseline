# Goals & Coach Pages — Redesign Suggestions

## Bugs to Fix First

### 1. Goal type badge is wrong
Your Hyrox goal shows a **WEIGHT** badge (green) instead of **RACE** (amber). This is likely because there's no way to edit a goal's type after creation — once it's saved wrong, it's stuck. The fix is adding inline editing (see below).

### 2. "Done" and "Archive" do the same thing
In `goals-manager.tsx` lines 389 and 395, both the "Done" and "Archive" buttons call `updateGoal(g.id, { status: "archived" })`. "Done" should feel different — it's a completion, not a shelving. The server already converts "completed" to "archived", but the UI should distinguish them:
- **Done** = celebration moment, maybe a confetti flash or a "completed" state with a checkmark before it moves to archived
- **Archive** = quietly shelved, no fanfare

### 3. `suggestGoals()` in goal-tagger.tsx ignores workout type
The auto-suggest function (lines 13-24) always suggests race, strength, physique, and weight goals regardless of what the workout actually was. It receives no workout data to make intelligent suggestions. It should receive the workout's type/name and match accordingly.

---

## Goals Page

### Inline Editing
The biggest gap. Once a goal is created, you can't change its type, subtype, target, deadline, or notes without deleting and recreating it. Add click-to-edit on the goal card — tap the title to rename, tap the type badge to change type, tap the date to change deadline. The form state already exists in the component; just need to wire an "editing" mode per card.

### Countdown Visualization
The `(55 days)` text is easy to miss. Replace it with a visual countdown ring — a circular progress indicator showing how much time has elapsed vs. total time from creation to deadline. For a Hyrox race, seeing "62% of prep time used" is more motivating than "55 days." The ring color should match the goal type (amber for race, purple for strength, etc.).

### Goal-Relevant Metrics on the Card
Right now goal cards only show title, target, date, and notes. The data is already in the database — surface the 2-3 most relevant metrics for each goal type directly on the card:
- **Race (Hyrox)**: Last VO2max estimate, weekly running volume, most recent run pace
- **Strength**: Last 1RM or training max for key lifts, weekly volume
- **Weight**: Current weight trend, energy availability
- **Cognitive**: Average sleep score, HRV trend
This requires a new API call from the goals page to fetch the latest sync data, filtered by goal type. The coach-context builder already knows which metrics matter per lens — reuse that mapping.

### Priority Reordering
Goals have a `priority` field but no UI to change it. Add up/down arrows on each card, or drag handles for reordering. The order determines how the coach weighs competing goals.

### Delete Confirmation
The × button immediately deletes with no confirmation. Add a "Delete this goal?" confirmation — even just an inline "Are you sure?" that replaces the button for 3 seconds.

### Archived Section Polish  
Archived goals are hidden when empty (good) but could show a summary stat when visible: "3 goals completed this year" with a collapsible list. Past goals inform the coach through archived pattern recall — making that visible builds trust in the system.

---

## Coach Page

### Replace the `<select>` Dropdown with a Visual Selector
The plain HTML select element is the weakest UI element on the page. Replace it with a row of pill buttons — one per active goal, plus "Holistic" and "Daily Brief." Each pill shows the goal type color, an abbreviated title, and the countdown. The active pill gets a highlight ring. This makes it obvious at a glance which lens you're in.

```
[★ Hyrox 55d] [Strength] [All goals] [Today]
   ^amber        ^purple    ^neutral    ^blue
```

### Tradeoff Alert Banner
The tradeoff detection engine (`detectTradeoffs()` in coach-context.ts) already identifies conflicts between goals, but nothing in the UI surfaces them. Add a banner below the coaching focus selector that shows active tradeoffs:

```
⚠ Warning: Your Hyrox race goal and strength goal create a concurrent training
  interference risk. The coach is factoring this in.
```

Severity levels already exist (info/warning/critical) — use yellow for warning, red for critical. This requires a new API endpoint that runs `detectTradeoffs()` and returns the results, or include them in the coach context response.

### Goal Context Card
When a specific goal is selected, show a compact card above the chat with:
- Goal title, type badge, countdown
- 2-3 key metrics relevant to that goal (same ones suggested for the goals page cards)
- Current coaching frame summary (e.g., "Prioritizing aerobic base and race-specific prep")

This gives the user context about what the coach is emphasizing without having to ask.

### Dynamic Suggested Prompts
The three starter prompts (lines 269-286) are static. Make them dynamic based on the selected goal:
- **Hyrox selected**: "What should my long run look like this week?", "Am I building enough aerobic base for sub-80?", "How should I structure my station practice?"
- **Strength selected**: "Am I recovering enough between sessions?", "Should I deload this week?", "How's my protein relative to my training volume?"
- **Daily Brief selected**: "What's my training tier today?", "Any recovery flags I should know about?", "Walk me through my readiness data"

### Follow-up Action Chips
After the coach responds, show 2-3 contextual follow-up buttons based on the response content. If the coach mentions HRV, offer "Tell me more about my HRV trend." If it mentions nutrition, offer "What should I eat today?" These reduce friction — the user doesn't have to think of what to ask next.

### Session Sidebar Timestamps
Session titles like "Give me today's brief — what shoul..." have no dates. Add relative timestamps: "Today", "Yesterday", "Apr 7". Group by date if there are many sessions.

### Lens Indicator in Response
When the coach responds using a specific goal lens, show a subtle tag above the response: "Responding through Hyrox race lens" with the goal type color. This makes the weighting system transparent.

---

## New Features (Bigger Lifts)

### Goal Detail Page (`/goals/[id]`)
Clicking a goal card should open a detail page showing:
- Full goal info with edit capability
- Timeline of workouts tagged to this goal (from GoalWorkoutTag)
- Key metric trends (charts) relevant to the goal type
- Coach conversation history filtered to this goal's lens
- Progress assessment from the coach (auto-generated weekly summary)

### Weekly Goal Review
A scheduled prompt (or a button on the goals page) that asks the coach: "Review my progress toward all active goals this week." The coach responds with a structured assessment per goal — on track / behind / ahead — with specific data points. This could be the "Just today — daily brief" concept extended to a weekly cadence.

### Workout ↔ Goal Connection in Body Page
The GoalTagger component exists but needs to be wired into the workout detail view on the Body page. After logging or syncing a workout, the tagger should appear contextually. Tagged workouts should then show their goal badges in the workout list.

---

## Implementation Priority

If I were ordering these for Claude Code, I'd go:

1. **Fix the bugs** (type badge, Done vs Archive, suggest logic) — small, high-impact
2. **Inline editing on goals** — biggest UX gap, blocks you from fixing your Hyrox goal's type
3. **Visual coaching focus pills** — replaces the weakest UI element
4. **Tradeoff alert banner** — the engine exists, just needs a surface
5. **Dynamic suggested prompts** — low effort, high value
6. **Goal context card** — medium effort, makes the lens system visible
7. **Countdown rings + metric cards** — medium effort, makes goals page feel alive
8. **Everything else** — goal detail page, weekly review, session timestamps, follow-up chips
