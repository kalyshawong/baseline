# Goal-Aware Coaching — Implementation Instructions for Claude Code

**Date:** 2026-04-09
**Spec:** `docs/goal-coach-redesign-spec.md`
**Research:** `research/variable-research.md`, `research/body-mode-research.md`

---

## Overview

You are implementing a goal-aware coaching system for a Next.js 15 / React 19 / Prisma / SQLite fitness tracking app called Baseline. The feature redesigns how goals connect to the AI coach so the coach can give focused, goal-specific advice without losing holistic awareness.

**Core principle: Weighted lens, not data filter.** The coach always sees ALL data. The selected goal changes what it emphasizes, leads with, and optimizes for — never what it can see.

**Stack:** Next.js 15 (App Router), React 19, TypeScript 5.8, Prisma (SQLite), Tailwind CSS 4, Recharts, @anthropic-ai/sdk

**Execute in 5 phases, in order. Complete each phase fully before moving to the next. Run `npx prisma generate` after schema changes and `npm run build` after each phase to catch type errors.**

---

## Phase 1 — Schema Migration + Goal Model

### 1A. Update Prisma Schema

**File:** `prisma/schema.prisma`

Add two new fields to the existing `Goal` model and create a new `GoalWorkoutTag` join model. Do NOT rename or remove any existing fields.

```prisma
model Goal {
  id          String    @id @default(cuid())
  title       String
  type        String    // race | strength | physique | cognitive | weight | health | custom
  subtype     String?   // hyrox | marathon | half_marathon | 5k | 10k | triathlon | powerlifting_meet | bodybuilding | cfa | finals | certification | cut | bulk | recomp | maintain | sleep_optimization | hrv_baseline | stress_management | custom
  target      String?
  deadline    DateTime?
  status      String    @default("active")    // active | completed | abandoned | archived
  isPrimary   Boolean   @default(false)
  priority    Int       @default(0)
  notes       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  workoutTags GoalWorkoutTag[]
}

model GoalWorkoutTag {
  id        String         @id @default(cuid())
  goalId    String
  goal      Goal           @relation(fields: [goalId], references: [id], onDelete: Cascade)
  sessionId String
  session   WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  createdAt DateTime       @default(now())

  @@unique([goalId, sessionId])
}
```

Also add the reverse relation to the existing `WorkoutSession` model:

```prisma
model WorkoutSession {
  // ... existing fields unchanged ...
  goalTags   GoalWorkoutTag[]
}
```

### 1B. Create and Run Migration

```bash
npx prisma migrate dev --name add-goal-coaching-fields
```

If the migration prompts about data loss (it shouldn't — we're only adding fields with defaults and a new table), review the SQL it generates before confirming. The existing `type` field values (`weight`, `race`, `exam`, `performance`, `habit`, `custom`) remain valid — we are expanding the set, not replacing it.

### 1C. Update Goal API — Type Validation

**File:** `src/app/api/goals/route.ts`

Update the `POST` handler's `validTypes` array:

```typescript
const validTypes = ["race", "strength", "physique", "cognitive", "weight", "health", "custom"];
```

Also update the `POST` body parsing to accept the new fields:

```typescript
const { title, type, subtype, target, deadline, notes, isPrimary } = body;
```

Add to the `prisma.goal.create` data:

```typescript
data: {
  title,
  type,
  subtype: subtype ?? null,
  target: target ?? null,
  deadline: deadline ? new Date(deadline) : null,
  notes: notes ?? null,
  isPrimary: isPrimary ?? false,
},
```

**Important:** If `isPrimary` is `true`, first unset any existing primary goal:

```typescript
if (isPrimary) {
  await prisma.goal.updateMany({
    where: { isPrimary: true },
    data: { isPrimary: false },
  });
}
```

### 1D. Update Goal API — PATCH Handler

**File:** `src/app/api/goals/[id]/route.ts`

Add `subtype`, `isPrimary`, and `priority` to the allowed PATCH fields. Apply the same "only one primary" constraint:

```typescript
for (const field of ["title", "type", "subtype", "target", "notes", "status", "priority"] as const) {
  if (body[field] !== undefined) data[field] = body[field];
}
if (body.isPrimary === true) {
  await prisma.goal.updateMany({
    where: { isPrimary: true, id: { not: id } },
    data: { isPrimary: false },
  });
  data.isPrimary = true;
} else if (body.isPrimary === false) {
  data.isPrimary = false;
}
```

When `status` is set to `"completed"`, change it to `"archived"` instead so historical data is preserved:

```typescript
if (data.status === "completed") {
  data.status = "archived";
}
```

### 1E. Update Goals Manager UI

**File:** `src/components/goals/goals-manager.tsx`

**Changes needed:**

1. Update the `Goal` interface to include `subtype`, `isPrimary`, `priority`.

2. Replace the `goalTypes` array with the new type system. Each type has conditional subtypes:

```typescript
const goalTypes = [
  { id: "race", label: "Race", color: "bg-amber-500/20 text-amber-400",
    subtypes: ["hyrox", "marathon", "half_marathon", "5k", "10k", "triathlon", "custom"] },
  { id: "strength", label: "Strength", color: "bg-purple-500/20 text-purple-400",
    subtypes: ["powerlifting_meet", "bodybuilding", "general_strength", "custom"] },
  { id: "physique", label: "Physique", color: "bg-pink-500/20 text-pink-400",
    subtypes: ["bodybuilding", "recomp", "custom"] },
  { id: "cognitive", label: "Cognitive", color: "bg-blue-500/20 text-blue-400",
    subtypes: ["cfa", "finals", "certification", "custom"] },
  { id: "weight", label: "Weight", color: "bg-emerald-500/20 text-emerald-400",
    subtypes: ["cut", "bulk", "recomp", "maintain"] },
  { id: "health", label: "Health", color: "bg-teal-500/20 text-teal-400",
    subtypes: ["sleep_optimization", "hrv_baseline", "stress_management", "custom"] },
  { id: "custom", label: "Custom", color: "bg-neutral-500/20 text-neutral-400",
    subtypes: [] },
];
```

3. Add a subtype selector that appears conditionally when a type with subtypes is selected. Use a row of small buttons matching the type selector style.

4. Add a "Set as primary focus" toggle (small checkbox or star icon) in the form. Only one goal can be primary — the UI should reflect this.

5. In the active goals list, visually mark the primary goal (gold star, "PRIMARY" badge, or border highlight). Add a quick-action to set/unset primary directly from the card (not just during creation).

6. Add an "Archive" action alongside "Done" on each goal card. "Done" should send `status: "archived"` (not "completed") to the API.

7. Add an "Archived" section below "Completed" that shows archived goals with a "Restore" action.

8. Send `subtype` and `isPrimary` in the POST body when creating a goal.

### 1F. Update Goals Page Server Component

**File:** `src/app/goals/page.tsx`

Include the new fields in the serialized goal objects passed to GoalsManager:

```typescript
initialGoals={goals.map((g) => ({
  id: g.id,
  title: g.title,
  type: g.type,
  subtype: g.subtype,
  target: g.target,
  deadline: g.deadline?.toISOString() ?? null,
  status: g.status,
  isPrimary: g.isPrimary,
  priority: g.priority,
  notes: g.notes,
}))}
```

### 1G. Migrate Existing Data

Existing goals with `type: "exam"` should be updated to `type: "cognitive"`. Existing goals with `type: "performance"` should be updated to `type: "strength"`. Existing goals with `type: "habit"` can remain as `type: "custom"`. Do this in a seed script or a one-time migration:

```typescript
// In a migration script or seed file:
await prisma.goal.updateMany({ where: { type: "exam" }, data: { type: "cognitive" } });
await prisma.goal.updateMany({ where: { type: "performance" }, data: { type: "strength" } });
await prisma.goal.updateMany({ where: { type: "habit" }, data: { type: "custom" } });
```

**Verify:** Run `npm run build` to confirm no type errors. Run the app and create/edit goals to test the new fields.

---

## Phase 2 — Coach Context Builder (Weighted Lens)

This is the most critical phase. The coach context builder (`src/lib/coach-context.ts`) currently gathers all data in a flat structure. We need to make it goal-aware without removing any data.

### 2A. Add Goal Lens Types

**File:** `src/lib/coach-context.ts` (add near the top, after imports)

```typescript
/**
 * Defines section ordering and annotation based on goal type.
 * Sections listed first appear first in the context window.
 * Claude attends more reliably to content near the beginning,
 * so ordering IS the weighting mechanism.
 */
interface GoalLens {
  type: string;
  sectionOrder: string[];
  coachingFrame: string;
}

const goalLenses: Record<string, GoalLens> = {
  race: {
    type: "race",
    sectionOrder: [
      "primary_focus",
      "readiness",
      "running_cardio",
      "vo2max",
      "hr_zones",
      "apple_watch_workouts",
      "nutrition",
      "sleep",
      "oura_metrics",
      "weight_trend",
      "cycle_phase",
      "training",
      "resilience",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for race performance. Running volume, aerobic fitness, and fueling strategy are the priority. Consider strength only as it supports race readiness.",
  },
  strength: {
    type: "strength",
    sectionOrder: [
      "primary_focus",
      "readiness",
      "training",
      "oura_metrics",
      "nutrition",
      "sleep",
      "weight_trend",
      "cycle_phase",
      "resilience",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for strength and hypertrophy. Volume load progression, recovery capacity, and protein intake are the priority.",
  },
  physique: {
    type: "physique",
    sectionOrder: [
      "primary_focus",
      "readiness",
      "training",
      "nutrition",
      "weight_trend",
      "sleep",
      "oura_metrics",
      "cycle_phase",
      "resilience",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for body composition. Volume balance across muscle groups, protein distribution, and body composition trends are the priority.",
  },
  cognitive: {
    type: "cognitive",
    sectionOrder: [
      "primary_focus",
      "sleep",
      "readiness",
      "resilience",
      "oura_metrics",
      "experiments",
      "nutrition",
      "goals",
      "training",
      "weight_trend",
      "cycle_phase",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "spo2",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for cognitive performance. Sleep quality, stress recovery, and mental freshness are the priority. Physical training should support — not compete with — cognitive goals. Marcora (2009): mental fatigue reduces endurance by ~15%; the reverse also applies.",
  },
  weight: {
    type: "weight",
    sectionOrder: [
      "primary_focus",
      "nutrition",
      "weight_trend",
      "readiness",
      "oura_metrics",
      "sleep",
      "training",
      "cycle_phase",
      "resilience",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "spo2",
      "experiments",
      "goals",
      "sessions",
      "bedtime",
    ],
    coachingFrame: "Optimize for body weight management. Energy balance, protein intake, and weight trend are the priority. HRV depression during caloric deficit is normal (Altini 2022) — distinguish from overtraining.",
  },
  health: {
    type: "health",
    sectionOrder: [
      "primary_focus",
      "oura_metrics",
      "sleep",
      "readiness",
      "resilience",
      "spo2",
      "experiments",
      "sessions",
      "nutrition",
      "training",
      "weight_trend",
      "cycle_phase",
      "apple_watch_workouts",
      "running_cardio",
      "vo2max",
      "goals",
      "bedtime",
    ],
    coachingFrame: "Optimize for the user's health target. Biometric trends, lifestyle experiments, and recovery metrics are the priority.",
  },
};

const defaultSectionOrder = [
  "primary_focus", "readiness", "oura_metrics", "cycle_phase", "training",
  "nutrition", "weight_trend", "running_cardio", "vo2max", "apple_watch_workouts",
  "sleep", "resilience", "spo2", "experiments", "goals", "sessions", "bedtime",
];
```

### 2B. Refactor buildCoachContext to Use Sections

**File:** `src/lib/coach-context.ts`

The current function builds lines sequentially. Refactor it to build **named sections** as a `Map<string, string[]>`, then emit them in the order dictated by the goal lens.

Change the function signature:

```typescript
export async function buildCoachContext(focusGoalId?: string | null): Promise<string> {
```

After all data is fetched (keep the existing `Promise.allSettled` block exactly as-is), replace the sequential `lines.push(...)` logic with a sections approach:

```typescript
const sections = new Map<string, string[]>();

function addSection(key: string, lines: string[]) {
  if (lines.length > 0) {
    sections.set(key, lines);
  }
}
```

Then build each section into its own array. For example, the existing readiness block:

```typescript
// BEFORE (current code):
// lines.push("## Today's Readiness");
// lines.push(`- Baseline Score: ${score.overall}/100 ...`);

// AFTER (sectioned):
const readinessLines: string[] = [];
if (score) {
  const tier = readinessTier(score.overall);
  readinessLines.push("## Today's Readiness");
  readinessLines.push(`- Baseline Score: ${score.overall}/100 (${score.label})`);
  readinessLines.push(`- Training tier: ${tier.tier.toUpperCase()} — ${tier.recommendation}`);
  // ... rest of readiness section exactly as current ...
}
addSection("readiness", readinessLines);
```

Do this for every section. Map the existing code blocks to these section keys:
- `"profile"` — Profile block (always emitted first, not in the ordering system)
- `"readiness"` — Baseline Score + training tier
- `"oura_metrics"` — Oura readiness, sleep, stress, activity, HRV CV
- `"cycle_phase"` — Cycle phase + guidance
- `"training"` — Volume per muscle group + last workout + e1RM
- `"nutrition"` — Today's nutrition + protein target + EA
- `"weight_trend"` — Weight logs + trend
- `"experiments"` — Active Mind Mode experiments
- `"goals"` — Active goals list (with tradeoffs — see Phase 2D)
- `"apple_watch_workouts"` — Apple Watch workout summaries
- `"spo2"` — SpO2 data
- `"resilience"` — Resilience data
- `"vo2max"` — VO2max trend
- `"sessions"` — Meditation/breathing/nap sessions
- `"bedtime"` — Bedtime recommendation
- `"running_cardio"` — Running metrics from Apple Watch
- `"sleep"` — (NEW) Extract the sleep detail from oura_metrics into its own section for cognitive goals that need it first

**Important — Sleep Section Extraction:** The sleep data is currently embedded inside the "Oura Metrics" section. For the cognitive lens (which needs sleep front and center), extract sleep into its own section key `"sleep"`. Concretely:

```typescript
// Build the sleep section (extracted from oura_metrics)
const sleepLines: string[] = [];
if (todaySleep) {
  sleepLines.push("## Sleep Detail");
  const hrs = todaySleep.totalSleepDuration ? (todaySleep.totalSleepDuration / 3600).toFixed(1) : "—";
  sleepLines.push(`- Total sleep: ${hrs}h`);
  sleepLines.push(`- Efficiency: ${todaySleep.sleepEfficiency ?? "—"}%`);
  if (todaySleep.deepSleepDuration) {
    const deepMin = (todaySleep.deepSleepDuration / 60).toFixed(0);
    const deepPct = todaySleep.totalSleepDuration
      ? ((todaySleep.deepSleepDuration / todaySleep.totalSleepDuration) * 100).toFixed(0)
      : "—";
    sleepLines.push(`- Deep sleep: ${deepMin}min (${deepPct}%) — target 90-120min for GH secretion (Sassin 1969)`);
  }
  if (todaySleep.remSleepDuration) {
    const remMin = (todaySleep.remSleepDuration / 60).toFixed(0);
    sleepLines.push(`- REM sleep: ${remMin}min — critical for memory consolidation (Walker 2017)`);
  }
  if (todaySleep.latency != null) {
    sleepLines.push(`- Sleep latency: ${todaySleep.latency}min${todaySleep.latency > 30 ? " (elevated — possible hyperarousal)" : ""}`);
  }
  if (todaySleep.averageHrv) sleepLines.push(`- Overnight HRV: ${todaySleep.averageHrv} ms`);
  if (todaySleep.lowestHeartRate) sleepLines.push(`- Lowest HR: ${todaySleep.lowestHeartRate} bpm`);

  // Sleep debt (7-day rolling)
  if (recentSleep.length >= 7) {
    const target = 7 * 3600; // 7 hours in seconds
    const debt = recentSleep.slice(0, 7).reduce((sum, s) => {
      const dur = (s as { totalSleepDuration?: number }).totalSleepDuration ?? 0;
      return sum + Math.max(0, target - dur);
    }, 0);
    const debtHours = (debt / 3600).toFixed(1);
    if (Number(debtHours) > 3) {
      sleepLines.push(`- 7-day sleep debt: ${debtHours}h below 7h target${Number(debtHours) > 5 ? " — SIGNIFICANT, recommend deload" : ""}`);
    }
  }
}
addSection("sleep", sleepLines);

// In the oura_metrics section, keep only a brief sleep summary:
// "- Sleep: 7.2h total, 85% efficiency" (one line, not the full breakdown)
```

When the cognitive lens puts `"sleep"` first in its section order, the detailed sleep data leads the context — giving the coach maximum visibility into the metric that matters most for studying.

After all sections are built, determine the goal and assemble:

```typescript
// Determine which goal lens to use
const focusGoal = focusGoalId
  ? goals.find((g: { id: string }) => g.id === focusGoalId)
  : goals.find((g: { isPrimary: boolean }) => g.isPrimary) ?? null;

const lens = focusGoal ? goalLenses[focusGoal.type] : null;
const order = lens?.sectionOrder ?? defaultSectionOrder;

// Build the primary focus section
if (focusGoal) {
  const focusLines: string[] = [];
  focusLines.push(`## PRIMARY FOCUS: ${focusGoal.title}`);
  focusLines.push(`Type: ${focusGoal.type}${focusGoal.subtype ? `/${focusGoal.subtype}` : ""}`);
  if (focusGoal.deadline) {
    const daysOut = Math.ceil((new Date(focusGoal.deadline).getTime() - Date.now()) / 86400000);
    focusLines.push(`Deadline: ${new Date(focusGoal.deadline).toLocaleDateString()} (${daysOut} days out)`);
  }
  if (focusGoal.target) focusLines.push(`Target: ${focusGoal.target}`);
  if (lens) focusLines.push(`\nCoaching frame: ${lens.coachingFrame}`);
  focusLines.push("");
  addSection("primary_focus", focusLines);
}

// Assemble final output
const finalLines: string[] = [];
finalLines.push(`# User State (${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })})`);
finalLines.push("");

// Profile always first
const profileSection = sections.get("profile");
if (profileSection) finalLines.push(...profileSection, "");

// Then goal-ordered sections
for (const key of order) {
  const section = sections.get(key);
  if (section && section.length > 0) {
    finalLines.push(...section, "");
  }
}

// Any remaining sections not in the order list (safety net)
for (const [key, section] of sections) {
  if (key !== "profile" && !order.includes(key) && section.length > 0) {
    finalLines.push(...section, "");
  }
}

return finalLines.join("\n");
```

### 2C. Add Dynamic System Prompt Section

**File:** `src/lib/coach-context.ts`

Add a new exported function alongside `COACH_SYSTEM_PROMPT`:

```typescript
export function goalSystemPromptSection(goal: {
  type: string;
  subtype: string | null;
  title: string;
  target: string | null;
  deadline: Date | string | null;
} | null): string {
  if (!goal) return "";

  const deadlineStr = goal.deadline
    ? new Date(goal.deadline).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "not set";

  const lensMap: Record<string, string> = {
    race: `\n# Active Coaching Focus: Race Preparation
You are coaching the user through race preparation for their ${goal.subtype ?? "race"}.
Target: ${goal.target ?? "finish strong"}. Deadline: ${deadlineStr}.

Prioritize: aerobic fitness progression (VO2max trend, running volume), running economy (GCT, vertical oscillation), race-specific preparation, fueling strategy (carbs 6-10 g/kg on hard days), taper timing.
Always consider: recovery status, injury risk, sleep quality, cycle phase effects on endurance and thermoregulation.
When other goals conflict with race prep, frame the tradeoff explicitly and recommend what protects race performance.
${goal.subtype === "hyrox" ? "\nHyrox-specific: Running = ~60% of race time (Brandt 2025). Functional strength for stations (sled push/pull, wall balls, lunges) is secondary but determines finish position. Monitor concurrent training interference (Hickson 1980). Cardio recovery between stations is a key differentiator." : ""}`,

    strength: `\n# Active Coaching Focus: Strength Training
You are coaching the user through a strength training block.
Target: ${goal.target ?? "get stronger"}. Deadline: ${deadlineStr}.

Prioritize: progressive overload (volume load per muscle vs MEV/MAV/MRV), estimated 1RM trends on primary lifts, RPE trend analysis (creep = overreaching), protein intake vs 1.6 g/kg target (Morton 2018), deload timing (every 5-6 weeks per Pritchard 2024).
Always consider: sleep quality (deep sleep → GH → MPS), cycle phase (follicular = PR window, ovulation = ACL caution per Hewett 2007), energy availability.
When other goals conflict, protect training stimulus and recovery first.`,

    physique: `\n# Active Coaching Focus: Physique / Body Composition
You are coaching the user toward a physique goal.
Target: ${goal.target ?? "optimize body composition"}. Deadline: ${deadlineStr}.

Prioritize: per-muscle-group volume balance against MEV/MAV/MRV landmarks, protein distribution across meals (20-25g per meal minimum per Moore 2009), body composition trend, training split adherence.
Always consider: energy availability (EA > 30 kcal/kg FFM), cycle phase effects on water retention and perceived progress.`,

    cognitive: `\n# Active Coaching Focus: Cognitive Performance
You are coaching the user through a cognitive performance period (studying/exams).
Target: ${goal.target ?? "peak mental performance"}. Deadline: ${deadlineStr}.

Prioritize: sleep quality — especially deep sleep for declarative memory consolidation and REM for procedural learning (Walker 2017). Monitor stress/recovery balance. Use HRV as a cognitive readiness proxy. Reference active Mind Mode experiments related to focus and learning. Flag caffeine timing (no caffeine after 2pm for sleep protection).
Always consider: training load competing for recovery resources. Marcora (2009): mental fatigue reduces endurance by ~15% — the reverse also applies. Physical exhaustion impairs studying. Lieberman (2005): cognitive performance degrades before physical performance under sleep deprivation.
Physical training recommendations should SUPPORT cognitive performance, not compete with it. On days before exams, prefer light movement over intense training.`,

    weight: `\n# Active Coaching Focus: Weight Management
You are coaching the user through a body composition change (${goal.subtype ?? "weight goal"}).
Target: ${goal.target ?? "optimize body weight"}. Deadline: ${deadlineStr}.

Prioritize: daily energy balance (intake vs expenditure), protein intake (maintain 1.6 g/kg even in deficit), weight trend (use 7-day rolling average, ignore daily fluctuations), energy availability calculation.
CRITICAL: HRV depression during caloric deficit is a NORMAL physiological response (Altini 2022), NOT a sign of overtraining. Distinguish diet-induced HRV dips from genuine training overload by checking whether the user is in a deficit.
${goal.subtype === "cut" ? "Cut-specific: EA must stay above 30 kcal/kg FFM (Loucks 2011). Rate of loss should be 0.5-1% BW/week max to preserve muscle. Flag if faster than that." : ""}
${goal.subtype === "bulk" ? "Bulk-specific: Target surplus of 300-500 kcal/day. Track whether weight gain accompanies strength increases (muscle) or just scale movement." : ""}
Protect training volume to maintain/build muscle during the weight change.`,

    health: `\n# Active Coaching Focus: Health Optimization
You are coaching the user toward a health baseline goal.
Target: ${goal.target ?? "improve baseline health metrics"}. Deadline: ${deadlineStr}.

Prioritize: the specific metric being targeted (HRV trend, sleep architecture, stress/recovery ratio), environment sensor data (bedroom temp, PM2.5, noise, light), Mind Mode experiments, recovery sessions (meditation, breathing).
Frame all training and nutrition advice through the lens of whether it supports or undermines the health target.`,
  };

  return lensMap[goal.type] ?? "";
}
```

### 2D. Add Tradeoff Detection

**File:** `src/lib/coach-context.ts` (or create `src/lib/tradeoffs.ts` and import it)

Add a tradeoff detection function that runs when building the goals section of the context:

```typescript
interface Tradeoff {
  severity: "info" | "warning" | "critical";
  message: string;
}

export function detectTradeoffs(
  goals: Array<{ id: string; type: string; subtype: string | null; title: string; deadline: Date | null }>,
  context: {
    energyAvailability: number | null;
    readinessScore: number | null;
    cyclePhase: string | null;
    hrvCv: number | null;
    weeklyRunningKm: number | null;
    calorieBalance: number | null;
  }
): Tradeoff[] {
  const tradeoffs: Tradeoff[] = [];
  const activeGoals = goals.filter((g) => g.type !== "custom");

  // 1. DEFICIT + HIGH TRAINING VOLUME
  const weightCut = activeGoals.find((g) => g.subtype === "cut");
  const raceGoal = activeGoals.find((g) => g.type === "race");
  if (weightCut && raceGoal && context.energyAvailability != null && context.energyAvailability < 35) {
    tradeoffs.push({
      severity: context.energyAvailability < 30 ? "critical" : "warning",
      message: `Cutting weight while training for ${raceGoal.title}. EA is ${context.energyAvailability.toFixed(0)} kcal/kg FFM${context.energyAvailability < 30 ? " — BELOW the 30 threshold (Loucks 2011)" : " — approaching the 30 threshold"}. Suggest reducing deficit or adding rest.`,
    });
  }

  // 2. EXAM + HEAVY TRAINING on low readiness
  const cogGoal = activeGoals.find((g) => g.type === "cognitive");
  if (cogGoal?.deadline) {
    const daysToExam = Math.ceil((cogGoal.deadline.getTime() - Date.now()) / 86400000);
    if (daysToExam > 0 && daysToExam <= 5 && context.readinessScore != null && context.readinessScore < 70) {
      tradeoffs.push({
        severity: "critical",
        message: `${cogGoal.title} is ${daysToExam} days away and readiness is ${context.readinessScore} (yellow). Heavy training competes for the same recovery resources the brain needs. Suggest light movement only until the exam.`,
      });
    }
  }

  // 3. CONCURRENT STRENGTH + ENDURANCE (interference effect)
  const strengthGoal = activeGoals.find((g) => g.type === "strength" || g.type === "physique");
  if (raceGoal && strengthGoal) {
    tradeoffs.push({
      severity: "info",
      message: `Training for ${raceGoal.title} and ${strengthGoal.title} simultaneously. Concurrent training interference (Hickson 1980) may limit strength gains after ~8 weeks. Prioritize one domain and maintain the other.`,
    });
  }

  // 4. OVERREACHING SIGNALS
  if (context.hrvCv != null && context.hrvCv > 10) {
    tradeoffs.push({
      severity: "warning",
      message: `HRV CV is ${context.hrvCv.toFixed(1)}% (elevated). Flatt & Esco (2016): sustained high HRV variability over 2-3 weeks signals non-functional overreaching. Consider deloading regardless of current program week.`,
    });
  }

  // 5. LUTEAL PHASE + UPCOMING RACE
  if (context.cyclePhase === "luteal" && raceGoal?.deadline) {
    const daysToRace = Math.ceil((raceGoal.deadline.getTime() - Date.now()) / 86400000);
    if (daysToRace > 0 && daysToRace <= 14) {
      tradeoffs.push({
        severity: "info",
        message: `Race in ${daysToRace} days during luteal phase. RPE +0.5-1 at same intensity (Sung 2014). Core temp +0.3-0.5°C impairs thermoregulation. Practice hydration and pacing strategy.`,
      });
    }
  }

  return tradeoffs;
}
```

Inject tradeoffs into the goals section of the context:

```typescript
// In the goals section builder:
const goalLines: string[] = [];
if (goals.length > 0) {
  goalLines.push("## Active Goals");
  for (const g of goals) {
    const primary = g.isPrimary ? " ★ PRIMARY" : "";
    const deadline = g.deadline ? ` — ${new Date(g.deadline).toLocaleDateString()}` : "";
    const daysUntil = g.deadline
      ? ` (${Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)} days)`
      : "";
    goalLines.push(`- [${g.type}${g.subtype ? `/${g.subtype}` : ""}] ${g.title}${g.target ? ` → ${g.target}` : ""}${deadline}${daysUntil}${primary}`);
  }

  const tradeoffs = detectTradeoffs(goals, {
    energyAvailability: /* computed EA from earlier */ null,
    readinessScore: score?.overall ?? null,
    cyclePhase: phaseLog?.phase ?? null,
    hrvCv: /* computed from earlier */ null,
    weeklyRunningKm: /* computed from walkingRunningDistance or Apple Watch */ null,
    calorieBalance: /* computed from nutrition - activity */ null,
  });

  if (tradeoffs.length > 0) {
    goalLines.push("");
    goalLines.push("### Goal Conflicts Detected");
    for (const t of tradeoffs) {
      goalLines.push(`- [${t.severity.toUpperCase()}] ${t.message}`);
    }
  }
}
addSection("goals", goalLines);
```

**Note:** Several of the tradeoff context values (EA, HRV CV, etc.) are already computed earlier in the function. Store them in local variables so they can be passed to `detectTradeoffs`. Do NOT re-query the database.

### 2E. Update Coach API Route

**File:** `src/app/api/coach/route.ts`

1. Accept `focusGoalId` in the request body:

```typescript
const { sessionId, message, focusGoalId } = await request.json();
```

2. Pass it to the context builder:

```typescript
async function getCachedContext(focusGoalId?: string | null): Promise<string> {
  // Cache key should include focusGoalId so different goals get different context
  const cacheKey = focusGoalId ?? "all";
  if (cachedContext && cachedContext.key === cacheKey && Date.now() < cachedContext.expiry) {
    return cachedContext.text;
  }
  const text = await buildCoachContext(focusGoalId);
  cachedContext = { key: cacheKey, text, expiry: Date.now() + 5 * 60 * 1000 };
  return text;
}
```

3. Build the dynamic system prompt:

```typescript
// After fetching context, get the focus goal for the system prompt
const focusGoal = focusGoalId
  ? await prisma.goal.findUnique({ where: { id: focusGoalId } })
  : await prisma.goal.findFirst({ where: { isPrimary: true, status: "active" } });

const goalPromptSection = goalSystemPromptSection(focusGoal);
const systemPrompt = `${COACH_SYSTEM_PROMPT}${goalPromptSection}\n\n---\n\n${contextBlock}`;
```

Update the cache type:

```typescript
let cachedContext: { key: string; text: string; expiry: number } | null = null;
```

### 2F. Add Archived Goal Pattern Recall

When building the goals section of the context, also query for archived goals of the same type/subtype as the current focus goal. This enables the coach to reference past training blocks:

```typescript
// In the goals section builder, after the active goals list:
if (focusGoal) {
  const archivedSameType = await prisma.goal.findMany({
    where: {
      type: focusGoal.type,
      subtype: focusGoal.subtype ?? undefined,
      status: "archived",
      id: { not: focusGoal.id },
    },
    orderBy: { updatedAt: "desc" },
    take: 2,
  });

  if (archivedSameType.length > 0) {
    goalLines.push("");
    goalLines.push("### Past Goals (same type — for pattern reference)");
    for (const a of archivedSameType) {
      const completedDate = a.updatedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      goalLines.push(`- "${a.title}" — archived ${completedDate}${a.target ? ` (target: ${a.target})` : ""}${a.notes ? ` | notes: ${a.notes}` : ""}`);
    }
  }
}
```

**Important:** This query adds one more database call. Add it to the existing `Promise.allSettled` block rather than running it sequentially. It only runs when a focus goal exists, so wrap it in a conditional:

```typescript
// Add to the Promise.allSettled array:
focusGoalId
  ? prisma.goal.findMany({
      where: { type: /* determined after goals are fetched */, status: "archived" },
      orderBy: { updatedAt: "desc" },
      take: 2,
    })
  : Promise.resolve([]),
```

Since the focus goal's type isn't known until after goals are fetched, you have two options: (1) run this as a sequential query after the main batch, or (2) fetch all archived goals (limited to 5) in the main batch and filter client-side. Option 2 is simpler and avoids the extra round-trip:

```typescript
// In the Promise.allSettled block:
prisma.goal.findMany({
  where: { status: "archived" },
  orderBy: { updatedAt: "desc" },
  take: 5,
}),
```

Then filter in memory:

```typescript
const archivedGoals = val(results[XX], []) as Array<{ id: string; type: string; subtype: string | null; title: string; target: string | null; notes: string | null; updatedAt: Date }>;
// ... later, when building the goals section:
const archivedSameType = archivedGoals.filter(
  (a) => a.type === focusGoal?.type && (focusGoal?.subtype ? a.subtype === focusGoal.subtype : true)
);
```

This allows the coach to say things like: *"Last time you trained for a Hyrox, your readiness dropped to 58 during taper week. You're at 72 now — ahead of schedule."*

**Verify:** Run `npm run build`. Test the coach with and without a focus goal selected.

---

## Phase 3 — Coach UI (Mode Selector + Daily Brief)

### 3A. Fetch Goals on Coach Page

**File:** `src/app/coach/page.tsx`

Add a goals query alongside the existing session queries:

```typescript
const [sessions, currentSession, activeGoals] = await Promise.all([
  prisma.chatSession.findMany({ orderBy: { updatedAt: "desc" }, take: 30 }),
  sessionId
    ? prisma.chatSession.findUnique({
        where: { id: sessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : Promise.resolve(null),
  prisma.goal.findMany({
    where: { status: "active" },
    orderBy: [{ isPrimary: "desc" }, { deadline: "asc" }],
  }),
]);
```

Pass goals to ChatInterface:

```typescript
<ChatInterface
  initialSession={...}
  initialMessages={...}
  sessions={...}
  goals={activeGoals.map((g) => ({
    id: g.id,
    title: g.title,
    type: g.type,
    subtype: g.subtype,
    isPrimary: g.isPrimary,
    deadline: g.deadline?.toISOString() ?? null,
  }))}
/>
```

### 3B. Add Coaching Mode Selector to Chat Interface

**File:** `src/components/coach/chat-interface.tsx`

1. Add `goals` to the component props:

```typescript
interface GoalOption {
  id: string;
  title: string;
  type: string;
  subtype: string | null;
  isPrimary: boolean;
  deadline: string | null;
}

export function ChatInterface({
  initialSession,
  initialMessages,
  sessions,
  goals,
}: {
  initialSession: Session | null;
  initialMessages: Message[];
  sessions: Session[];
  goals: GoalOption[];
}) {
```

2. Add state for the selected coaching focus:

```typescript
const primaryGoal = goals.find((g) => g.isPrimary);
const [focusGoalId, setFocusGoalId] = useState<string | null>(
  primaryGoal?.id ?? null
);
```

3. Add a dropdown above the chat area (between the header and the chat panel, or at the top of the chat panel):

```tsx
{/* Coaching focus selector */}
{goals.length > 0 && (
  <div className="mb-3 flex items-center gap-2">
    <label className="text-xs text-[var(--color-text-muted)]">
      Coaching focus:
    </label>
    <select
      value={focusGoalId ?? "all"}
      onChange={(e) => {
        const val = e.target.value;
        setFocusGoalId(val === "all" || val === "today" ? null : val);
        // Invalidate context cache by including focusGoalId in the next message
      }}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs"
    >
      {primaryGoal && (
        <option value={primaryGoal.id}>
          ★ {primaryGoal.title}
          {primaryGoal.deadline
            ? ` (${Math.ceil((new Date(primaryGoal.deadline).getTime() - Date.now()) / 86400000)}d)`
            : ""}
        </option>
      )}
      {goals
        .filter((g) => !g.isPrimary)
        .map((g) => (
          <option key={g.id} value={g.id}>
            {g.title}
            {g.deadline
              ? ` (${Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000)}d)`
              : ""}
          </option>
        ))}
      <option value="all">All goals — holistic</option>
      <option value="today">Just today — daily brief</option>
    </select>
  </div>
)}
```

4. Include `focusGoalId` in the API call:

```typescript
const res = await fetch("/api/coach", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId: currentSessionId,
    message: messageText,
    focusGoalId: focusGoalId,
  }),
});
```

5. For "Just today" mode: when the user selects it and sends their first message, prepend an invisible system instruction. In the API route, if `focusGoalId` is `null` and the front-end signals "today" mode (e.g., via a `mode: "today"` field in the body), append this to the system prompt:

```
Today's coaching mode: DAILY BRIEF. The user wants a concise check-in. Structure your response as:
1. Body budget (readiness, sleep, physical capacity)
2. Mind budget (stress recovery, cognitive capacity)
3. Active goals check-in (one line per goal: on track / needs attention / conflict)
4. Today's recommendation (what to prioritize, what to eat, when to sleep)
Keep it under 250 words. Be direct and specific with numbers.
```

### 3C. Update Suggested Prompts

In the empty chat state, update the suggested prompts to be goal-aware:

```tsx
<button onClick={() => setInput("Give me today's brief — what should I focus on?")}>
  "Give me today's brief — what should I focus on?"
</button>
<button onClick={() => setInput("Am I on track for my primary goal? What needs to change?")}>
  "Am I on track for my primary goal? What needs to change?"
</button>
<button onClick={() => setInput("I have competing priorities this week. Help me prioritize.")}>
  "I have competing priorities this week. Help me prioritize."
</button>
```

**Verify:** Run `npm run build`. Test the coach page with goals. Verify the dropdown appears. Test sending messages with different goals selected. Verify the context changes (check server logs or add a temporary `console.log` of the system prompt length/first 200 chars).

---

## Phase 4 — Workout Tagging

### 4A. Create Goal Tag API

**File:** `src/app/api/workouts/[id]/goals/route.ts` (NEW FILE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiError } from "@/lib/utils";

// GET: list goals tagged to this workout
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tags = await prisma.goalWorkoutTag.findMany({
      where: { sessionId: id },
      include: { goal: { select: { id: true, title: true, type: true, subtype: true } } },
    });
    return NextResponse.json(tags.map((t) => t.goal));
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}

// PUT: replace all goal tags for this workout
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { goalIds } = await request.json();

    if (!Array.isArray(goalIds)) {
      return NextResponse.json({ error: "goalIds must be an array" }, { status: 400 });
    }

    // Delete existing tags and create new ones in a transaction
    await prisma.$transaction([
      prisma.goalWorkoutTag.deleteMany({ where: { sessionId: id } }),
      ...goalIds.map((goalId: string) =>
        prisma.goalWorkoutTag.create({ data: { goalId, sessionId: id } })
      ),
    ]);

    return NextResponse.json({ success: true, tagged: goalIds.length });
  } catch (error) {
    const { status, body } = apiError(error);
    return NextResponse.json(body, { status });
  }
}
```

### 4B. Add Post-Workout Tagging UI

This should appear after a workout is completed (when `completedAt` is set). Find the workout completion flow in the Body Mode UI — look for where `completedAt` is set or where session RPE is entered.

Create a new component:

**File:** `src/components/body/goal-tagger.tsx` (NEW FILE)

```typescript
"use client";

import { useState, useEffect, useTransition } from "react";

interface GoalOption {
  id: string;
  title: string;
  type: string;
  subtype: string | null;
}

// Auto-suggest which goals a workout should be tagged to
function suggestGoals(goals: GoalOption[], workoutType?: string): Set<string> {
  const suggested = new Set<string>();
  for (const goal of goals) {
    // Race goals: tag running workouts and functional fitness
    if (goal.type === "race") suggested.add(goal.id);
    // Strength/physique: tag strength workouts
    if (goal.type === "strength" || goal.type === "physique") suggested.add(goal.id);
    // Weight: all workouts help maintain/build muscle
    if (goal.type === "weight") suggested.add(goal.id);
  }
  return suggested;
}

export function GoalTagger({
  sessionId,
  goals,
  onDone,
}: {
  sessionId: string;
  goals: GoalOption[];
  onDone?: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => suggestGoals(goals));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle(goalId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      await fetch(`/api/workouts/${sessionId}/goals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goalIds: Array.from(selected) }),
      });
      setSaved(true);
      onDone?.();
    });
  }

  if (goals.length === 0) return null;
  if (saved) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-center text-xs text-[var(--color-text-muted)]">
        Goals tagged ✓
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="mb-3 text-sm font-medium">Which goals did this serve?</p>
      <div className="space-y-2">
        {goals.map((g) => (
          <label
            key={g.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(g.id)}
              onChange={() => toggle(g.id)}
              className="accent-white"
            />
            <span className="font-medium">{g.title}</span>
            <span className="text-[var(--color-text-muted)]">
              ({g.type}{g.subtype ? `/${g.subtype}` : ""})
            </span>
          </label>
        ))}
      </div>
      <button
        onClick={save}
        disabled={isPending}
        className="mt-3 w-full rounded-xl bg-white/10 py-2 text-xs font-medium hover:bg-white/20 disabled:opacity-30"
      >
        Save
      </button>
    </div>
  );
}
```

Integrate this component into the workout completion flow. Find where the workout session is marked complete and render `<GoalTagger>` below the session RPE input. You'll need to fetch active goals and pass them as props.

### 4C. Goal-Filtered Workout History (Optional — lower priority)

In the workout history/trends views, add a filter dropdown similar to the coach's coaching mode selector. When a goal is selected, filter the `workoutSession` query to only include sessions that have a `GoalWorkoutTag` for that goal:

```typescript
const sessions = await prisma.workoutSession.findMany({
  where: goalId
    ? { goalTags: { some: { goalId } } }
    : undefined,
  orderBy: { date: "desc" },
  // ... existing includes ...
});
```

This is a nice-to-have for Phase 4 — implement if time allows, otherwise note it as a follow-up.

**Verify:** Run `npm run build`. Complete a workout and verify the goal tagger appears. Check the database for `GoalWorkoutTag` records.

---

## Phase 5 — Verification & Tuning

### 5A. Test Each Goal Type

Create one goal of each type and test the coach with each selected:

1. **Race/Hyrox:** Verify context leads with running metrics, VO2max, HR zones. System prompt mentions Brandt 2025, station prep, concurrent training.
2. **Strength:** Verify context leads with volume/muscle, e1RM, protein. System prompt mentions MEV/MAV/MRV, deload timing.
3. **Cognitive:** Verify context leads with sleep detail (deep/REM breakdown), stress/recovery. System prompt mentions Marcora, Walker, Lieberman.
4. **Weight/Cut:** Verify context leads with nutrition, weight trend, EA. System prompt mentions Altini 2022 (deficit HRV is normal).
5. **Health:** Verify context leads with Oura metrics, resilience, SpO2. System prompt mentions environment data.
6. **All goals — holistic:** Verify all sections appear in the default order. No goal-specific system prompt section.
7. **Just today:** Verify the daily brief format (body budget, mind budget, goals check-in, recommendation).

### 5B. Test Tradeoff Detection

Set up conflicting goals and verify warnings fire:

1. Create a `cut` weight goal AND a `race` goal. Set EA near 30. Verify the EA conflict warning appears in coach context.
2. Create a `cognitive` goal with a deadline 3 days out. Set readiness to yellow. Verify the critical warning about exam proximity.
3. Create a `strength` goal AND a `race` goal simultaneously. Verify the interference effect info warning.
4. Log data that produces elevated HRV CV (>10%). Verify the overreaching warning.

### 5C. Test Primary Goal Behavior

1. Set a goal as primary. Open coach with no explicit selection. Verify it defaults to the primary goal's lens.
2. Change the primary goal. Verify the coach switches context ordering.
3. Remove all primary goals. Verify the coach falls back to "all goals" default ordering.

### 5D. Test Workout Tagging

1. Complete a workout. Verify the goal tagger appears with auto-suggestions.
2. Verify tags are saved to the database.
3. If goal-filtered history is implemented, verify it shows only tagged workouts.

### 5E. Verify No Data Is Lost

**Critical check:** Compare the output of `buildCoachContext()` (no goal) with `buildCoachContext(someGoalId)`. Verify that every section present in the ungrouped output is also present in the goal-focused output — just in a different order. NO section should be missing.

---

## Files Modified (Summary)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `subtype`, `isPrimary`, `priority` to Goal; add `GoalWorkoutTag` model; add `goalTags` to `WorkoutSession` |
| `src/app/api/goals/route.ts` | Accept new fields, enforce single-primary constraint |
| `src/app/api/goals/[id]/route.ts` | Accept new PATCH fields, archive instead of complete |
| `src/app/api/coach/route.ts` | Accept `focusGoalId`, build dynamic system prompt, update cache keying |
| `src/app/api/workouts/[id]/goals/route.ts` | **NEW** — GET/PUT for workout goal tags |
| `src/lib/coach-context.ts` | Refactor to sections + ordering, add `goalLenses`, `goalSystemPromptSection()`, `detectTradeoffs()` |
| `src/components/goals/goals-manager.tsx` | New type/subtype system, primary toggle, archive support |
| `src/components/coach/chat-interface.tsx` | Add coaching focus dropdown, pass `focusGoalId` to API |
| `src/components/body/goal-tagger.tsx` | **NEW** — post-workout goal tagging component |
| `src/app/coach/page.tsx` | Fetch active goals, pass to ChatInterface |
| `src/app/goals/page.tsx` | Include new fields in serialized props |

## Files NOT Modified

Do not modify these — they work correctly as-is:

- `src/lib/training.ts` — volume zones, e1RM, RPE logic unchanged
- `src/lib/baseline-score.ts` — score calculation unchanged
- `src/lib/insights.ts` — passive correlations unchanged
- `src/lib/tdee.ts` — TDEE calculation unchanged
- Any Mind Mode, nutrition, cycle phase, or sync code

---

## Key Constraints

1. **SQLite compatibility:** No array columns or JSON fields (SQLite doesn't support them natively in Prisma). Use join tables (like `GoalWorkoutTag`) instead of array fields.
2. **Single primary goal:** Enforce at the API level (`updateMany` to unset before setting new primary). The UI should reflect this but the API is the source of truth.
3. **Context window management:** The coach's system prompt + context gets large. The reordering strategy ensures the most relevant data appears first (where Claude attends most reliably). Do NOT truncate or remove sections to save tokens — the whole point is that all data stays available.
4. **Cache invalidation:** The context cache in `coach/route.ts` currently uses a 5-minute TTL. With goal-aware context, the cache key must include `focusGoalId` so switching goals produces fresh context immediately.
5. **Backward compatibility:** Existing goals with old types (`exam`, `performance`, `habit`) should still work after migration. Run the type migration in Phase 1G.
6. **No breaking changes to existing APIs:** The `/api/coach` POST endpoint adds an optional `focusGoalId` field. Existing calls without it continue to work (defaults to primary goal or null).
