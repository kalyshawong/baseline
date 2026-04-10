# UI Redesign — Claude Code Prompts (Phase by Phase)

Copy-paste each prompt into Claude Code one at a time. Wait for each to complete before starting the next.

---

## Phase 1: Bug Fixes

```
Read docs/goals-coach-ui-implementation.md for full context, then implement Phase 1: Bug Fixes.

Three things to fix:

1. In src/components/goals/goals-manager.tsx, the "Done" and "Archive" buttons both do the exact same thing (both call updateGoal with status "archived"). Fix "Done" to feel like a completion — add an id={`goal-${g.id}`} to the goal card div, then make the Done button add a green ring-2 ring-emerald-400/60 class to the card with a 600ms delay before calling updateGoal with status "completed". Add a delete confirmation dialog (window.confirm) to the × button. Also add an "Edit" button that we'll wire up in Phase 2 — for now it can just be a placeholder.

2. In src/components/body/goal-tagger.tsx, the suggestGoals function ignores what the workout actually was — it blindly suggests race, strength, physique, and weight goals. Add a workoutName prop to the component and use regex matching to suggest intelligently: running/cardio keywords → race goals, squat/bench/press keywords → strength/physique goals, always suggest weight goals. If nothing matches, suggest all. Update the GoalTagger export to accept workoutName.

3. In src/components/body/workout-logger.tsx, pass the template exercise names as workoutName to the GoalTagger component (join templateExercises names with spaces).

Run npx tsc --noEmit when done.
```

---

## Phase 2: Inline Editing on Goal Cards

```
Read docs/goals-coach-ui-implementation.md for full context, then implement Phase 2: Inline Editing.

In src/components/goals/goals-manager.tsx:

1. Add editing state: editingId (string | null), editFields (Partial<Goal>). Add startEdit(g) that copies the goal fields into editFields, and saveEdit() that diffs editFields against the original and calls updateGoal with only changed fields.

2. When editingId matches a goal's id, render an inline edit form INSIDE the goal card instead of the display content. The edit form should have:
   - Title text input
   - Type pill selector (reuse the same goalTypes array and styling from the creation form)
   - Conditional subtype pill selector (same as creation form)
   - Target text input
   - Date input for deadline
   - Notes textarea
   - Save and Cancel buttons

3. Wire the "Edit" button from Phase 1 to call startEdit(g).

4. Verify the PATCH API at src/app/api/goals/[id]/route.ts already accepts title and type fields. It should — they're in the field loop. If not, add them.

Run npx tsc --noEmit when done. Test by editing a goal's type and verifying it saves correctly.
```

---

## Phase 3: Countdown Rings

```
Read docs/goals-coach-ui-implementation.md for full context, then implement Phase 3: Countdown Rings.

1. Create src/components/goals/countdown-ring.tsx — a "use client" component that renders an SVG circular progress ring. Props: deadline (string), createdAt (optional string, defaults to 90 days before deadline), size (default 48), color (string). Calculate percentage of time elapsed, render two SVG circles (background track at 10% opacity, progress arc using strokeDasharray/strokeDashoffset), and show days remaining as text centered in the ring.

2. In src/components/goals/goals-manager.tsx, import CountdownRing and render it in each active goal card next to the deadline text. Use the goal type's color — create a helper function typeHexColor that maps type ids to hex colors (amber→#f59e0b, purple→#a855f7, pink→#ec4899, blue→#3b82f6, emerald→#10b981, teal→#14b8a6, neutral→#a3a3a3). Show the ring only when a deadline exists.

Run npx tsc --noEmit when done.
```

---

## Phase 4: Visual Focus Pills + Dynamic Prompts

```
Read docs/goals-coach-ui-implementation.md for full context, then implement Phase 4: Coach page redesign.

Two changes to src/components/coach/chat-interface.tsx:

1. REPLACE the <select> dropdown for coaching focus (the section with "Coaching focus:" label) with a horizontal row of pill buttons. Each active goal gets a pill button showing: primary star if isPrimary, truncated title (max 20 chars), days until deadline. Add two more pills: "Holistic" (for all goals, no specific focus) and "Daily Brief" (for today mode). The active pill should have border-white/40 bg-white/15 styling. The Daily Brief pill should use blue-400 tones. The pill row should be horizontally scrollable (overflow-x-auto) with a "Lens" label on the left.

2. REPLACE the static suggested prompts with a getSuggestedPrompts() function that returns different prompts based on the selected goal:
   - Hyrox race: prompts about training structure, aerobic base, station practice
   - Other race: prompts about pacing, long runs, race week planning
   - Strength: prompts about deloading, recovery, protein
   - Weight: prompts about weight trend, energy availability, nutrition
   - Daily brief mode: prompts about training tier, recovery flags, numbers walkthrough
   - Default/holistic: keep the existing prompts

Render the dynamic prompts in the empty chat state.

Run npx tsc --noEmit when done.
```

---

## Phase 5: Tradeoff Alert Banner

```
Read docs/goals-coach-ui-implementation.md for full context, then implement Phase 5: Tradeoff alerts.

1. Create src/app/api/coach/tradeoffs/route.ts — a GET endpoint that:
   - Fetches active goals from prisma
   - Computes HRV CV from recent dailyReadiness records (last 14 days)
   - Computes energy availability using nutrition, activity, profile, and weight data
   - Calls detectTradeoffs() from src/lib/coach-context.ts with the computed values
   - Returns { tradeoffs: Tradeoff[] }
   - Wraps everything in try/catch, returns empty array on failure
   - Check the actual Prisma schema field names before writing queries — the HRV field on dailyReadiness might be hrvBalance or similar, activity calories might be activeCalories, etc. Read the schema first.

2. In src/components/coach/chat-interface.tsx:
   - Add a useEffect that fetches /api/coach/tradeoffs on mount and stores results in state
   - Render a banner between the focus pills and the chat messages area
   - Each tradeoff gets a colored alert: critical = red (bg-red-500/10 text-red-400), warning = amber (bg-amber-500/10 text-amber-400), info = blue (bg-blue-500/10 text-blue-300)
   - Show severity icon (⚠ for critical, △ for warning, ℹ for info) and the message text

3. Also add a lens indicator above assistant messages: when focusGoalId is set, show a subtle "Responding through {type} lens — {title}" label in text-[10px] above the response bubble.

Run npx tsc --noEmit when done.
```

---

## Phase 6: Session Sidebar Timestamps

```
Read docs/goals-coach-ui-implementation.md for full context, then implement Phase 6: Session timestamps.

1. In src/app/coach/page.tsx, include updatedAt in the session data passed to ChatInterface. Add updatedAt: s.updatedAt.toISOString() to the sessions map.

2. In src/components/coach/chat-interface.tsx:
   - Add updatedAt?: string to the Session interface
   - Add a relativeDate(iso: string) helper: "Today" if same day, "Yesterday" if 1 day ago, weekday name if <7 days, "Mon DD" format otherwise
   - Render the relative date below each session title in the sidebar in text-[10px] text-[var(--color-text-muted)] opacity-60

Run npx tsc --noEmit when done. This is the final phase — once complete, restart the dev server and visually verify all 6 phases work.
```
