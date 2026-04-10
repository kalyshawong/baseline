# Goals & Coach UI Redesign — Implementation Instructions

Follow these phases in order. Each phase is independently deployable. Run `npx tsc --noEmit` after each phase to verify zero type errors.

---

## Phase 1: Bug Fixes

### 1A: Distinguish "Done" from "Archive" in goals-manager.tsx

**File:** `src/components/goals/goals-manager.tsx`

The "Done" button (line 389) and "Archive" button (line 395) both call `updateGoal(g.id, { status: "archived" })`. Fix the Done button to show a brief success state before archiving.

Replace the goal card action buttons (lines 387-406) with:

```tsx
<div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
  <button
    onClick={() => {
      // Flash a completion effect, then archive
      const el = document.getElementById(`goal-${g.id}`);
      if (el) {
        el.classList.add("ring-2", "ring-emerald-400/60");
        setTimeout(() => updateGoal(g.id, { status: "completed" }), 600);
      } else {
        updateGoal(g.id, { status: "completed" });
      }
    }}
    className="rounded px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/20"
  >
    ✓ Done
  </button>
  <button
    onClick={() => updateGoal(g.id, { status: "archived" })}
    className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
  >
    Archive
  </button>
  <button
    onClick={() => {
      if (confirm("Delete this goal permanently?")) deleteGoal(g.id);
    }}
    className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-red-500/20 hover:text-red-400"
  >
    ×
  </button>
</div>
```

Also add `id={`goal-${g.id}`}` to the goal card's outer `<div>` at line 329.

### 1B: Fix suggestGoals to use workout context

**File:** `src/components/body/goal-tagger.tsx`

Update the GoalTagger component to accept a `workoutName` prop and use it for smarter suggestions:

```tsx
interface GoalTaggerProps {
  sessionId: string;
  goals: GoalOption[];
  workoutName?: string;
  onDone?: () => void;
}

function suggestGoals(goals: GoalOption[], workoutName?: string): Set<string> {
  const suggested = new Set<string>();
  const name = (workoutName ?? "").toLowerCase();
  const isRunning = /run|jog|sprint|tempo|interval|cardio|hyrox/.test(name);
  const isStrength = /squat|bench|press|deadlift|row|curl|pull|push|strength|hyper/.test(name);

  for (const goal of goals) {
    if (goal.type === "race" && isRunning) suggested.add(goal.id);
    if ((goal.type === "strength" || goal.type === "physique") && isStrength) suggested.add(goal.id);
    if (goal.type === "weight") suggested.add(goal.id); // all workouts serve weight goals
    if (goal.type === "race" && goal.subtype === "hyrox" && isStrength) suggested.add(goal.id); // Hyrox needs strength too
  }
  // Fallback: if nothing matched, suggest all active goals
  if (suggested.size === 0) {
    for (const goal of goals) suggested.add(goal.id);
  }
  return suggested;
}
```

Update the component signature and the state initializer to pass `workoutName`:
```tsx
export function GoalTagger({ sessionId, goals, workoutName, onDone }: GoalTaggerProps) {
  const [selected, setSelected] = useState<Set<string>>(() => suggestGoals(goals, workoutName));
```

Wherever GoalTagger is rendered, pass the workout's name/title as `workoutName`.

---

## Phase 2: Goals Page — Inline Editing

### 2A: Add edit mode to goal cards

**File:** `src/components/goals/goals-manager.tsx`

Add an editing state to track which goal is being edited:

```tsx
const [editingId, setEditingId] = useState<string | null>(null);
const [editFields, setEditFields] = useState<Partial<Goal>>({});
```

Add a function to start editing:
```tsx
function startEdit(g: Goal) {
  setEditingId(g.id);
  setEditFields({
    title: g.title,
    type: g.type,
    subtype: g.subtype,
    target: g.target,
    deadline: g.deadline ? g.deadline.split("T")[0] : "",
    notes: g.notes,
    isPrimary: g.isPrimary,
  });
}

function saveEdit() {
  if (!editingId) return;
  const patch: Record<string, unknown> = {};
  const original = goals.find((g) => g.id === editingId);
  if (!original) return;

  if (editFields.title && editFields.title !== original.title) patch.title = editFields.title;
  if (editFields.type && editFields.type !== original.type) patch.type = editFields.type;
  if (editFields.subtype !== original.subtype) patch.subtype = editFields.subtype || null;
  if (editFields.target !== original.target) patch.target = editFields.target || null;
  if (editFields.deadline !== (original.deadline ? original.deadline.split("T")[0] : ""))
    patch.deadline = editFields.deadline || null;
  if (editFields.notes !== original.notes) patch.notes = editFields.notes || null;

  if (Object.keys(patch).length > 0) {
    updateGoal(editingId, patch);
  }
  setEditingId(null);
  setEditFields({});
}
```

### 2B: Replace goal card display with edit-in-place

When `editingId === g.id`, render an inline edit form instead of the static card content. The edit form should use the same type/subtype pill selectors from the creation form, reusing the existing `goalTypes` array and `subtypeLabel` function. Key fields to make editable:

- Title (text input)
- Type (pill selector — same as creation form)
- Subtype (conditional pill selector — same as creation form)
- Target (text input)
- Deadline (date input)
- Notes (textarea)

Add an "Edit" button to the hover actions alongside Done/Archive/Delete:
```tsx
<button
  onClick={() => startEdit(g)}
  className="rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white"
>
  Edit
</button>
```

The edit form should have "Save" and "Cancel" buttons that call `saveEdit()` or `setEditingId(null)`.

### 2C: Update Goals API PATCH to accept `type` changes

**File:** `src/app/api/goals/[id]/route.ts`

The PATCH handler currently allows subtype, isPrimary, priority, and status. Add `type` and `title` to the list of accepted fields so inline editing can change the goal type:

```tsx
const { title, type, subtype, target, deadline, notes, isPrimary, priority, status } = body;
const data: Record<string, unknown> = {};
if (title !== undefined) data.title = title;
if (type !== undefined) data.type = type;
if (subtype !== undefined) data.subtype = subtype;
if (target !== undefined) data.target = target;
if (deadline !== undefined) data.deadline = deadline ? new Date(deadline) : null;
if (notes !== undefined) data.notes = notes;
// ... keep existing isPrimary, priority, status logic
```

**Verification:** After this phase, you should be able to click "Edit" on the Hyrox goal, change its type from "weight" to "race" and set subtype to "hyrox", and save.

---

## Phase 3: Goals Page — Visual Enhancements

### 3A: Countdown ring component

**File:** `src/components/goals/countdown-ring.tsx` (NEW)

Create a simple SVG ring component that shows progress toward a deadline:

```tsx
"use client";

interface CountdownRingProps {
  deadline: string;
  createdAt?: string;
  size?: number;
  color?: string;
}

export function CountdownRing({
  deadline,
  createdAt,
  size = 48,
  color = "var(--color-text-muted)",
}: CountdownRingProps) {
  const now = Date.now();
  const end = new Date(deadline).getTime();
  const start = createdAt ? new Date(createdAt).getTime() : end - 90 * 86400000; // default 90-day span
  const total = end - start;
  const elapsed = now - start;
  const pct = total > 0 ? Math.min(Math.max(elapsed / total, 0), 1) : 1;
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));

  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={3} className="opacity-10" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={3}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-[10px] font-mono font-bold">{daysLeft}d</span>
    </div>
  );
}
```

### 3B: Integrate countdown ring into goal cards

**File:** `src/components/goals/goals-manager.tsx`

Import CountdownRing and render it next to the goal title when a deadline exists. Replace the text-only date display with:

```tsx
{g.deadline && (
  <div className="flex items-center gap-2 mt-2">
    <CountdownRing
      deadline={g.deadline}
      size={40}
      color={goalTypes.find((t) => t.id === g.type)?.color.includes("amber")
        ? "#f59e0b"
        : goalTypes.find((t) => t.id === g.type)?.color.includes("purple")
        ? "#a855f7"
        : goalTypes.find((t) => t.id === g.type)?.color.includes("pink")
        ? "#ec4899"
        : goalTypes.find((t) => t.id === g.type)?.color.includes("blue")
        ? "#3b82f6"
        : goalTypes.find((t) => t.id === g.type)?.color.includes("emerald")
        ? "#10b981"
        : goalTypes.find((t) => t.id === g.type)?.color.includes("teal")
        ? "#14b8a6"
        : "#a3a3a3"
      }
    />
    <div className="text-xs text-[var(--color-text-muted)]">
      <span>{new Date(g.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
      <span className="block text-[10px] opacity-60">
        {Math.round((1 - Math.max(0, (new Date(g.deadline).getTime() - Date.now()) / (new Date(g.deadline).getTime() - (Date.now() - 30 * 86400000)))) * 100)}% of prep time used
      </span>
    </div>
  </div>
)}
```

Extract the color mapping into a helper function `typeHexColor(type: string): string` to keep it clean.

---

## Phase 4: Coach Page — Visual Focus Selector

### 4A: Replace `<select>` with pill buttons

**File:** `src/components/coach/chat-interface.tsx`

Replace the coaching focus `<select>` element (lines 210-253) with a row of styled pill buttons:

```tsx
{goals.length > 0 && (
  <div className="border-b border-[var(--color-border)] px-5 py-3">
    <div className="flex items-center gap-2 overflow-x-auto">
      <span className="shrink-0 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        Lens
      </span>
      {goals.map((g) => {
        const isActive = coachMode === "goal" && focusGoalId === g.id;
        const daysLeft = g.deadline
          ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)
          : null;
        return (
          <button
            key={g.id}
            onClick={() => { setCoachMode("goal"); setFocusGoalId(g.id); }}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
              isActive
                ? "border-white/40 bg-white/15 text-white shadow-sm"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-white/20 hover:text-white"
            }`}
          >
            {g.isPrimary && <span className="mr-1 text-amber-400">★</span>}
            {g.title.length > 20 ? g.title.slice(0, 20) + "…" : g.title}
            {daysLeft !== null && daysLeft > 0 && (
              <span className="ml-1.5 opacity-60">{daysLeft}d</span>
            )}
          </button>
        );
      })}
      <button
        onClick={() => { setCoachMode("goal"); setFocusGoalId(null); }}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
          coachMode === "goal" && !focusGoalId
            ? "border-white/40 bg-white/15 text-white"
            : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-white/20 hover:text-white"
        }`}
      >
        Holistic
      </button>
      <button
        onClick={() => setCoachMode("today")}
        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
          coachMode === "today"
            ? "border-blue-400/40 bg-blue-500/15 text-blue-300"
            : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-white/20 hover:text-white"
        }`}
      >
        Daily Brief
      </button>
    </div>
  </div>
)}
```

### 4B: Dynamic suggested prompts

**File:** `src/components/coach/chat-interface.tsx`

Replace the static suggested prompts (lines 265-287) with a function that returns goal-aware suggestions:

```tsx
function getSuggestedPrompts(): Array<{ label: string; prompt: string }> {
  const focusGoal = goals.find((g) => g.id === focusGoalId);
  
  if (coachMode === "today") {
    return [
      { label: "What's my training tier today?", prompt: "What's my training tier today based on my readiness and recovery data?" },
      { label: "Any recovery flags?", prompt: "Are there any recovery flags I should know about before training today?" },
      { label: "Walk me through my numbers", prompt: "Walk me through today's readiness, sleep, and HRV numbers." },
    ];
  }

  if (focusGoal?.type === "race") {
    const sub = focusGoal.subtype;
    if (sub === "hyrox") {
      return [
        { label: "How should I train tomorrow?", prompt: "Based on my data, how should I structure tomorrow's Hyrox training?" },
        { label: "Am I building enough base?", prompt: `Am I building enough aerobic base for my ${focusGoal.target ?? "Hyrox"} goal? What does my VO2max and running volume trend look like?` },
        { label: "Station practice plan", prompt: "Give me a Hyrox station practice session that fits my current recovery state." },
      ];
    }
    return [
      { label: "Am I on pace?", prompt: `Am I on pace for ${focusGoal.title}? What does my training volume and VO2max trend say?` },
      { label: "Long run guidance", prompt: "What should my long run look like this week given my current recovery?" },
      { label: "Race week plan", prompt: `Help me plan the final week before ${focusGoal.title}.` },
    ];
  }

  if (focusGoal?.type === "strength") {
    return [
      { label: "Should I deload?", prompt: "Based on my RPE trends and HRV, should I deload this week?" },
      { label: "Am I recovering enough?", prompt: "Am I recovering enough between sessions? What does my readiness and sleep data say?" },
      { label: "Protein check", prompt: "How's my protein intake relative to my training volume this week?" },
    ];
  }

  if (focusGoal?.type === "weight") {
    return [
      { label: "Am I on track?", prompt: "Am I on track with my weight goal? Show me the trend and weekly rate of change." },
      { label: "Energy availability check", prompt: "What's my current energy availability? Am I in a safe range?" },
      { label: "Nutrition vs training", prompt: "How should I adjust my nutrition for today's planned training?" },
    ];
  }

  // Default / holistic
  return [
    { label: "Today's brief", prompt: "Give me today's brief — what should I focus on?" },
    { label: "Goal progress check", prompt: "Am I on track for my primary goal? What needs to change?" },
    { label: "Competing priorities", prompt: "I have competing priorities this week. Help me prioritize." },
  ];
}
```

Use this in the empty state:
```tsx
{messages.length === 0 ? (
  <div className="flex h-full flex-col items-center justify-center text-center">
    <h3 className="mb-2 text-lg font-semibold">Baseline Coach</h3>
    <p className="max-w-md text-sm text-[var(--color-text-muted)]">
      Science-backed coaching with full access to your biometric, training,
      nutrition, cycle, and goal data.
    </p>
    <div className="mt-6 space-y-2 text-left">
      {getSuggestedPrompts().map((sp, i) => (
        <button
          key={i}
          onClick={() => setInput(sp.prompt)}
          className="block w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-xs hover:bg-white/5"
        >
          &ldquo;{sp.label}&rdquo;
        </button>
      ))}
    </div>
  </div>
) : /* ... rest of chat messages */}
```

---

## Phase 5: Coach Page — Tradeoff Alert Banner

### 5A: Create tradeoff API endpoint

**File:** `src/app/api/coach/tradeoffs/route.ts` (NEW)

This endpoint runs the tradeoff detection engine and returns active conflicts:

```tsx
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectTradeoffs } from "@/lib/coach-context";
import { getLocalDay } from "@/lib/date-utils";
import { getScoreForDate } from "@/lib/baseline-score";
import { hrvCV, energyAvailability, ffmFromBodyComposition } from "@/lib/training";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const localToday = getLocalDay();

    const [goals, score, phaseLog, recentHrv, nutrition, activity, profile, weight, running] = await Promise.all([
      prisma.goal.findMany({ where: { status: "active" } }),
      getScoreForDate(localToday),
      prisma.cyclePhaseLog.findFirst({ where: { day: { lte: localToday } }, orderBy: { day: "desc" } }),
      prisma.dailyReadiness.findMany({ where: { day: { lte: localToday } }, orderBy: { day: "desc" }, take: 14, select: { hrvBalance: true } }),
      prisma.nutritionLog.findUnique({ where: { day: localToday }, include: { entries: true } }),
      prisma.dailyActivity.findFirst({ where: { day: { lte: localToday } }, orderBy: { day: "desc" } }),
      prisma.userProfile.findFirst(),
      prisma.weightLog.findFirst({ orderBy: { date: "desc" } }),
      prisma.dailyRunningMetrics.findFirst({ where: { day: { lte: localToday } }, orderBy: { day: "desc" } }),
    ]);

    if (goals.length === 0) {
      return NextResponse.json({ tradeoffs: [] });
    }

    // Compute HRV CV from recent readings
    const hrvValues = recentHrv.map((r) => r.hrvBalance).filter((v): v is number => v != null);
    const computedHrvCv = hrvValues.length >= 5 ? hrvCV(hrvValues) : null;

    // Compute energy availability if possible
    let computedEA: number | null = null;
    if (nutrition && activity && profile && weight) {
      const totalCals = nutrition.entries.reduce((sum, e) => sum + (e.calories ?? 0), 0);
      const exerciseCals = activity.activeCalories ?? 0;
      const ffm = ffmFromBodyComposition(weight.weight, profile.bodyFatPercent ?? null);
      if (ffm) {
        computedEA = energyAvailability(totalCals, exerciseCals, ffm);
      }
    }

    const tradeoffs = detectTradeoffs(goals, {
      energyAvailability: computedEA,
      readinessScore: score?.overall ?? null,
      cyclePhase: phaseLog?.phase ?? null,
      hrvCv: computedHrvCv,
      weeklyRunningKm: running?.walkingRunningDistance ? running.walkingRunningDistance / 1000 : null,
      calorieBalance: null,
    });

    return NextResponse.json({ tradeoffs });
  } catch {
    return NextResponse.json({ tradeoffs: [] });
  }
}
```

**Note:** The exact field names on the Prisma models may need adjustment. Check the schema for the correct field names on `dailyReadiness` for HRV (could be `hrvBalance` or similar), `dailyActivity` for `activeCalories`, `userProfile` for `bodyFatPercent`, and `weightLog` for `weight`. The `energyAvailability` and `ffmFromBodyComposition` functions are already exported from `src/lib/training.ts`.

### 5B: Add tradeoff banner to coach chat interface

**File:** `src/components/coach/chat-interface.tsx`

Add a state for tradeoffs and fetch them on mount:

```tsx
interface TradeoffAlert {
  severity: "info" | "warning" | "critical";
  message: string;
}

const [tradeoffs, setTradeoffs] = useState<TradeoffAlert[]>([]);

useEffect(() => {
  fetch("/api/coach/tradeoffs")
    .then((r) => r.json())
    .then((data) => setTradeoffs(data.tradeoffs ?? []))
    .catch(() => {});
}, []);
```

Render the banner between the coaching focus pills and the chat area:

```tsx
{tradeoffs.length > 0 && (
  <div className="border-b border-[var(--color-border)] px-5 py-2 space-y-1">
    {tradeoffs.map((t, i) => (
      <div
        key={i}
        className={`rounded-lg px-3 py-2 text-xs ${
          t.severity === "critical"
            ? "bg-red-500/10 text-red-400"
            : t.severity === "warning"
            ? "bg-amber-500/10 text-amber-400"
            : "bg-blue-500/10 text-blue-300"
        }`}
      >
        <span className="font-semibold uppercase mr-1.5">
          {t.severity === "critical" ? "⚠" : t.severity === "warning" ? "△" : "ℹ"}
        </span>
        {t.message}
      </div>
    ))}
  </div>
)}
```

### 5C: Add lens indicator to coach responses

When the coach responds while a specific goal is focused, show a subtle tag above the response bubble:

In the message rendering loop, for assistant messages, add:

```tsx
{m.role === "assistant" && focusGoalId && (
  <div className="mb-1 text-[10px] text-[var(--color-text-muted)]">
    {(() => {
      const g = goals.find((g) => g.id === focusGoalId);
      return g ? `Responding through ${g.type} lens — ${g.title}` : "";
    })()}
  </div>
)}
```

Place this inside the message container, just before the response bubble `<div>`.

---

## Phase 6: Session Sidebar Improvements

### 6A: Add timestamps to chat sessions

**File:** `src/app/coach/page.tsx`

Include `updatedAt` in the session query:

```tsx
sessions={sessions.map((s) => ({
  id: s.id,
  title: s.title,
  updatedAt: s.updatedAt.toISOString(),
}))}
```

**File:** `src/components/coach/chat-interface.tsx`

Update the Session interface:
```tsx
interface Session {
  id: string;
  title: string | null;
  updatedAt?: string;
}
```

Add a relative time helper:
```tsx
function relativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

Render the timestamp below each session title in the sidebar:
```tsx
<button
  onClick={() => { /* existing click handler */ }}
  className="block w-full truncate text-left"
>
  <span className="block truncate">{s.title ?? "Untitled"}</span>
  {s.updatedAt && (
    <span className="block text-[10px] text-[var(--color-text-muted)] opacity-60">
      {relativeDate(s.updatedAt)}
    </span>
  )}
</button>
```

---

## Verification Checklist

After all phases, verify:

1. `npx tsc --noEmit` — zero errors
2. Goals page: can click Edit on a goal, change its type from "weight" to "race", set subtype to "hyrox", save successfully
3. Goals page: countdown rings render with correct colors per type
4. Goals page: "Done" button shows brief flash before archiving; "Archive" just archives; delete asks for confirmation
5. Coach page: pill buttons replace the select dropdown, active pill is highlighted
6. Coach page: suggested prompts change when switching between goals
7. Coach page: tradeoff banner appears if there are conflicting goals (test by having both a race goal and a strength goal active)
8. Coach page: lens indicator appears above assistant responses when a specific goal is focused
9. Coach page: session sidebar shows relative dates
