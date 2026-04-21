# Goal-Aware Coaching — Feature Specification

**Version:** 1.0
**Author:** Kalysha
**Date:** 2026-04-20 (updated with Perplexity review feedback)
**Status:** Draft
**Dependencies:** Goal model (schema.prisma), coach-context.ts, coach/route.ts

---

## 1. Problem Statement

The current coach sees all data but has no concept of *why the user is training*. It treats a Hyrox prep block, a CFA study sprint, and a body recomp cut as the same coaching problem. The user's actual question — "should I go hard today?" — has completely different answers depending on which goal is driving the decision.

Meanwhile, the current Goal model is a flat list with a type string and no connection to the coaching system. Goals don't shape advice. They're displayed but inert.

---

## 2. Design Principle: Weighted Lens, Not Data Filter

The research in `variable-research.md` demonstrates that every variable in Baseline has cross-domain relevance. Sleep affects strength AND running AND cognition. HRV predicts readiness for a heavy squat AND a long run AND a study session. Cycle phase modulates RPE during Hyrox stations AND memory consolidation during exam prep.

**Hard filtering is scientifically wrong.** If the coach can't see sleep data during a "strength" goal, it can't warn about the 18% MPS reduction from sleep deprivation (Lamon 2021). If it can't see running metrics during an "exam" goal, it can't flag that a 90-minute run the day before a final will impair next-day cognitive performance via glycogen depletion.

The correct model is a **relevance lens**: the goal determines what the coach *emphasizes*, *leads with*, and *optimizes for* — not what it can see.

### The Hierarchy

```
ALL DATA (always available to the coach)
  └── PRIMARY LENS (what the coach optimizes for)
       └── SECONDARY AWARENESS (what it monitors for conflicts)
            └── TRADEOFF ENGINE (when goals collide)
```

---

## 3. Goal Model Redesign

### 3.1 Schema Changes

```prisma
model Goal {
  id          String    @id @default(cuid())
  title       String
  type        String    // race | strength | physique | cognitive | weight | health | custom
  subtype     String?   // hyrox | marathon | half_marathon | 5k | powerlifting_meet | bodybuilding | cfa | finals | cut | bulk | recomp | sleep_optimization | hrv_baseline | custom
  target      String?   // "Finish Hyrox under 90 min" | "Pass CFA Level I" | "Hit 135 lb BW"
  deadline    DateTime?
  status      String    @default("active")    // active | completed | abandoned | archived
  isPrimary   Boolean   @default(false)       // only one goal can be primary at a time
  priority    Int       @default(0)           // ordering among active goals
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

**Key changes from current model:**
- `subtype` enables specific coaching behavior per race/exam/etc
- `isPrimary` creates the focus hierarchy (max 1 primary). Enforced at the application layer: both POST and PATCH goal routes cascade `isPrimary = false` across all other goals before setting the new primary, wrapped in a `prisma.$transaction()`. SQLite does not support partial unique indexes, so a DB-level constraint is not used.
- `GoalWorkoutTag` connects workouts to goals for filtered views
- `archived` status preserves completed goal data for pattern analysis. Note: when a goal is abandoned (status = `abandoned`), its workout tags and HyroxPlan/HyroxSession rows remain intact. Pattern recall (§7.2) should filter by `status IN ('archived', 'completed')` and exclude `abandoned` goals to avoid surfacing incomplete training blocks as reference patterns.

### 3.2 Goal Types and Their Coaching Lenses

Each goal type defines a **relevance weight map** — not a data filter. The coach always has access to everything but leads with what matters most.

#### RACE (hyrox | marathon | half_marathon | 5k | 10k | triathlon)

**Lead with:** VO2max trend, weekly running volume, HR zone distribution, running biomechanics (GCT, vertical oscillation, stride length), cardio recovery, weight trend, carb intake
**Monitor for conflicts:** Energy availability, sleep debt, overreaching signals (HRV CV), cycle phase RPE inflation during luteal
**Coaching frame:** "You're preparing for [race] on [date]. [X] weeks out. Here's where your fitness and readiness stand relative to race demands."

*Hyrox-specific additions:* Functional strength metrics (sled-relevant e1RM for squat/deadlift), station-specific muscular endurance (wall ball reps, lunge capacity), concurrent training balance (Brandt 2025: running = 60% of race time, but stations determine finish position)

*Marathon/half/distance-specific:* Long run progression, weekly mileage ramp rate (acute:chronic ratio), glycogen availability, taper timing

#### STRENGTH (powerlifting_meet | bodybuilding | general_strength)

**Lead with:** Volume load per muscle group vs MEV/MAV/MRV, e1RM trends on primary lifts, RPE trends (creep detection), session density, protein intake vs 1.6g/kg target, deload timing
**Monitor for conflicts:** Sleep quality (deep sleep → GH → MPS), energy availability, cycle phase (follicular = PR window, ovulation = ACL caution), HRV depression from caloric deficit vs training overload
**Coaching frame:** "Your strength block is in week [X]. Here's your progressive overload status and recovery capacity."

*Powerlifting-specific:* Competition lift e1RM tracking, peaking protocols, weight class management
*Bodybuilding-specific:* Per-muscle volume balance, body composition trend, training split adherence

#### COGNITIVE (cfa | finals | certification | study)

**Lead with:** Sleep quality (especially deep sleep → memory consolidation, REM → learning integration), stress/recovery balance, HRV as cognitive readiness proxy, active Mind Mode experiments related to focus/learning, caffeine timing experiments
**Monitor for conflicts:** Training load competing for recovery resources, glycogen depletion from exercise impairing brain function, physical fatigue reducing study effectiveness
**Coaching frame:** "Your exam is in [X] days. Here's your cognitive readiness today based on sleep, stress, and recovery."

*Research basis (additional):*
- Marcora (2009): Mental fatigue reduces endurance performance by ~15% at the same physiological load. The reverse is also true — physical fatigue impairs cognitive performance.
- Walker (2017): Deep sleep consolidates declarative memory; REM consolidates procedural memory. Study of new material requires adequate deep sleep the night after studying.
- Lieberman et al. (2005): Sleep deprivation impairs cognitive performance more severely than physical performance — mood and executive function decline before strength does.

#### WEIGHT (cut | bulk | recomp | maintain)

**Lead with:** Daily calorie balance (intake vs expenditure), protein intake, weight trend (7-day rolling average), energy availability, body composition changes, TDEE estimate
**Monitor for conflicts:** HRV depression from deficit (distinguish from overtraining — Altini 2022), training volume sustainability during deficit, cycle disruption from low EA, strength loss signals during cut
**Coaching frame:** "You're [X] weeks into your [cut/bulk]. Here's your energy balance and whether your body is responding well."

*Cut-specific:* EA must stay above 30 kcal/kg FFM. Rate of loss should be 0.5-1% BW/week max to preserve muscle. HRV decline is expected and normal during modest deficit.
*Bulk-specific:* Surplus of 300-500 kcal targets. Track whether weight gain is accompanied by strength increases (muscle) or just scale movement (fat).

#### HEALTH (sleep_optimization | hrv_baseline | stress_management | custom)

**Lead with:** The specific health metric being targeted (e.g., HRV 30-day trend, sleep architecture breakdown, stress/recovery ratios), environment sensor data, Mind Mode experiments, lifestyle factors
**Monitor for conflicts:** Training load that might undermine the health goal, nutrition patterns affecting the target metric
**Coaching frame:** "Your health goal is [target]. Here's the trend and what's helping or hurting."

---

## 4. Coach Interface Changes

### 4.1 Coaching Mode Selector

Add a dropdown at the top of the coach chat page:

```
┌─────────────────────────────────────────────┐
│  Coaching focus:  [ Primary: Hyrox Prep ▾ ] │
│                                             │
│  Options:                                   │
│  ● Primary: Hyrox Prep (Jun 14)            │
│  ○ Strength: Squat 225 lb                  │
│  ○ Weight: Maintain 135 lb                 │
│  ○ All goals — holistic                    │
│  ○ Just today — daily brief                │
└─────────────────────────────────────────────┘
```

**Behavior:**
- Default: primary goal (if set), otherwise "All goals — holistic"
- "All goals — holistic" = current behavior with added tradeoff synthesis
- "Just today" = a quick-read daily brief that considers all active goals but optimizes for "what should I do right now"
- Selecting a specific goal changes the system prompt lens AND adjusts which context sections appear first (but does NOT remove any)

### 4.2 Context Builder Changes (coach-context.ts)

The existing `buildCoachContext()` function stays largely intact — it already gathers all data. The change is **section ordering and annotation**.

```typescript
export async function buildCoachContext(focusGoalId?: string): Promise<string> {
  // ... existing data fetching stays the same ...

  // NEW: if a focus goal is selected, reorder sections
  // so the most relevant data appears first in the context window
  const goal = focusGoalId
    ? goals.find(g => g.id === focusGoalId)
    : goals.find(g => g.isPrimary) ?? null;

  if (goal) {
    lines.push(`## PRIMARY FOCUS: ${goal.title}`);
    lines.push(`Type: ${goal.type}/${goal.subtype ?? 'general'}`);
    if (goal.deadline) {
      const daysOut = Math.ceil((goal.deadline.getTime() - Date.now()) / 86400000);
      lines.push(`Deadline: ${goal.deadline.toLocaleDateString()} (${daysOut} days out)`);
    }
    lines.push(`Target: ${goal.target ?? 'not specified'}`);
    lines.push('');

    // Reorder remaining sections based on goal type relevance
    // (implementation: build section map, then emit in priority order)
  }

  // ... rest of context builder, now with section ordering ...
}
```

The key insight: **context window position matters**. Claude attends more reliably to content near the beginning of the context. By putting the most goal-relevant data first, the coach naturally weights its advice correctly — no data is removed, but emphasis shifts through ordering.

#### Section Order by Goal Type

This table defines the exact `sectionOrder` array for each goal type. Sections not listed still appear — they're appended after the prioritized ones in their default order.

| Goal Type | Section Order (highest priority → lowest) |
|---|---|
| **race/hyrox** | `hyrox_plan` → `hyrox_pace_gap` → `readiness` → `recent_workouts` → `weekly_volume` → `cycle` → `nutrition` |
| **race/other** | `vo2max` → `running_metrics` → `zones` → `body_comp` → `sleep` → `nutrition` → `strength` |
| **strength** | `volume_e1rm` → `sleep_deep` → `protein` → `rpe_trends` → `body_comp` → `running` |
| **cognitive** | `sleep_deep_rem` → `stress_recovery` → `hrv` → `training_load` → `nutrition` |
| **weight** | `nutrition` → `body_comp` → `energy_availability` → `sleep` → `training_load` |
| **health** | `sleep` → `hrv` → `stress` → `nutrition` → `activity` |
| **custom** | `readiness` → `sleep` → `nutrition` → `training_load` → `body_comp` |

For `race/hyrox`, the `hyrox_plan` and `hyrox_pace_gap` sections are built by the Hyrox module (see `hyrox-module-spec.md`). They only appear when an active `HyroxPlan` exists for the goal.

### 4.3 System Prompt Changes

The system prompt gains a dynamic section based on the active goal:

```typescript
function goalSystemPromptSection(goal: Goal): string {
  const lensMap: Record<string, string> = {
    race: `You are coaching the user through race preparation for their ${goal.subtype ?? 'race'}. 
Their target: ${goal.target ?? 'finish strong'}. 
Deadline: ${goal.deadline?.toLocaleDateString() ?? 'not set'}.

Prioritize: aerobic fitness progression, running economy, race-specific preparation, fueling strategy, taper timing.
Always consider: recovery status, injury risk, sleep quality, cycle phase effects on endurance.
When other goals conflict with race prep, frame the tradeoff explicitly and recommend what protects race performance.`,

    strength: `You are coaching the user through a strength training block.
Their target: ${goal.target ?? 'get stronger'}.

Prioritize: progressive overload (volume trends, e1RM), recovery between sessions, protein intake, deload timing.
Always consider: sleep quality (deep sleep → GH → MPS), cycle phase (follicular = PR window), energy availability.
When other goals conflict, protect training stimulus and recovery first.`,

    cognitive: `You are coaching the user through a cognitive performance period.
Their target: ${goal.target ?? 'peak mental performance'}.

Prioritize: sleep quality (deep sleep for memory, REM for learning), stress/recovery balance, cognitive load management.
Always consider: training load that competes for recovery resources, glycogen/nutrition supporting brain function.
Physical training recommendations should be calibrated to SUPPORT cognitive performance, not compete with it.
Reference Marcora (2009): mental fatigue reduces endurance by ~15%. The reverse applies — physical exhaustion impairs studying.`,

    weight: `You are coaching the user through a body composition change.
Their target: ${goal.target ?? 'optimize body composition'}.

Prioritize: energy balance, protein intake, weight trend (7-day rolling avg, not daily fluctuations), EA threshold.
Always consider: HRV depression is EXPECTED during caloric deficit (Altini 2022) — distinguish from overtraining.
Protect training volume to maintain muscle during cuts. Flag EA below 30 kcal/kg FFM immediately.`,

    health: `You are coaching the user toward a health optimization goal.
Their target: ${goal.target ?? 'improve baseline health metrics'}.

Prioritize: the specific metric they're targeting (HRV, sleep, stress, etc), environment factors, lifestyle experiments.
Frame all training and nutrition advice through the lens of whether it supports or undermines the health target.`,
  };

  return lensMap[goal.type] ?? '';
}
```

### 4.4 "Just Today" Mode

When the user selects "Just today," the coach produces a structured daily brief:

```
## Today's Brief — April 9, 2026

**Body budget:** Readiness 78/100 (green). Your body can handle a hard session.
Deep sleep was solid (1h 42m), HRV stable at 52ms. No red flags.

**Cycle phase:** Follicular (day 8). Peak performance window — good day for intensity or PR attempts.

**Mind budget:** Stress recovery at 68%. Moderate cognitive load available.
Sleep latency was elevated (28 min) — may indicate ambient stress.

**Active goals check-in:**
- Hyrox Prep (Jun 14, 66 days): On track. Running volume this week is 22km vs 25km target. Today's a good day for a tempo run.
- CFA Level I (Jul 1, 83 days): No conflict with training today. Prioritize 8h sleep tonight for memory consolidation.
- Maintain 135 lb: Weight 136.2 (7d avg 135.4). Within range. No action needed.

**Recommendation:** Hard training session today. Tempo run or race simulation. 
Eat 6+ g/kg carbs to fuel it. Protein target: 98g (you've logged 32g so far).
Aim for bed by 10:30 PM (Oura optimal window).
```

**Data freshness rules:**
- "Last night's" sleep and readiness data (Oura) is always available by the time the user checks the brief
- Same-day nutrition: show "no meals logged yet today" rather than omitting the line when no entries exist. Once entries appear, show running totals.
- Cycle phase: use the latest `CyclePhaseLog` entry. If no entry within 35 days, omit the cycle line entirely rather than showing stale data.
- The brief considers data through the current moment — it is not pre-generated. Each open of "Just today" runs a fresh `buildCoachContext()`.

---

## 5. Workout Tagging

### 5.1 Tagging Flow

When completing a workout in Body Mode, show a post-session prompt:

```
┌──────────────────────────────────────────┐
│  Nice work. Which goals did this serve?  │
│                                          │
│  ☑ Hyrox Prep (auto-suggested)          │
│  ☑ Maintain 135 lb (auto-suggested)     │
│  ☐ CFA Level I                          │
│                                          │
│  [ Save ]                                │
└──────────────────────────────────────────┘
```

**Auto-suggestion logic:**
- Running workouts → auto-check any `race` goal
- Strength workouts → auto-check any `strength` or `physique` goal
- Any workout → auto-check any `weight` goal (training preserves muscle)
- Hyrox: both running and functional strength workouts get auto-tagged

The user can override any suggestion. Workouts can belong to multiple goals.

### 5.2 Goal-Scoped Views

In Body Mode, add a filter dropdown to the workout history:

```
Workout History  [ All workouts ▾ ]
                 [ Hyrox Prep    ]
                 [ Squat 225     ]
```

When filtered, only workouts tagged to that goal appear. Volume charts, e1RM trends, and frequency stats update accordingly. This lets the user see "how is my Hyrox-specific training progressing?" separate from "how is my overall strength block going?"

---

## 6. Tradeoff Engine

### 6.1 Conflict Detection Rules

The coach proactively warns when active goals are in tension. These rules run when building context:

```typescript
interface Tradeoff {
  goals: [string, string];    // the two conflicting goal IDs
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

function detectTradeoffs(goals: Goal[], context: CoachContext): Tradeoff[] {
  const tradeoffs: Tradeoff[] = [];

  // DEFICIT + HIGH TRAINING VOLUME
  const weightGoal = goals.find(g => g.subtype === 'cut');
  const raceGoal = goals.find(g => g.type === 'race');
  if (weightGoal && raceGoal && context.energyAvailability < 35) {
    tradeoffs.push({
      goals: [weightGoal.id, raceGoal.id],
      severity: 'warning',
      message: `Cutting weight while training for ${raceGoal.title}. EA is ${context.energyAvailability.toFixed(0)} kcal/kg FFM — approaching the 30 threshold. High training volume + deficit = compromised recovery. Consider reducing deficit to -250 cal or adding a rest day.`
    });
  }

  // EXAM + HEAVY TRAINING on low readiness
  const cogGoal = goals.find(g => g.type === 'cognitive');
  if (cogGoal && cogGoal.deadline) {
    const daysToExam = Math.ceil((cogGoal.deadline.getTime() - Date.now()) / 86400000);
    if (daysToExam <= 5 && context.readinessScore < 70) {
      tradeoffs.push({
        goals: [cogGoal.id, goals.find(g => g.type !== 'cognitive')?.id ?? ''],
        severity: 'critical',
        message: `${cogGoal.title} is ${daysToExam} days away and readiness is ${context.readinessScore} (yellow). Heavy training will compete for the same recovery resources your brain needs. Recommend: swap intense sessions for light movement until the exam. Marcora (2009): physical fatigue reduces cognitive performance.`
      });
    }
  }

  // HYROX + STRENGTH PEAKING (concurrent interference)
  const strengthGoal = goals.find(g => g.type === 'strength');
  if (raceGoal && strengthGoal) {
    tradeoffs.push({
      goals: [raceGoal.id, strengthGoal.id],
      severity: 'info',
      message: `Running for ${raceGoal.title} and peaking for ${strengthGoal.title} simultaneously. Hickson (1980): concurrent training creates an interference effect — strength gains plateau after ~8 weeks of combined training. Prioritize one and maintain the other.`
    });
  }

  // CYCLE PHASE + GOAL TIMING
  if (context.cyclePhase === 'luteal' && raceGoal) {
    const daysToRace = raceGoal.deadline
      ? Math.ceil((raceGoal.deadline.getTime() - Date.now()) / 86400000)
      : null;
    if (daysToRace && daysToRace <= 14) {
      tradeoffs.push({
        goals: [raceGoal.id, raceGoal.id],
        severity: 'info',
        message: `Race is ${daysToRace} days out and you're in the luteal phase. RPE will feel 0.5-1 point higher at the same intensity (Sung 2014). Thermoregulation is impaired (+0.3-0.5°C core temp). This is normal physiology, not fitness loss. If race day falls in luteal, practice hydration and pacing strategy accordingly.`
      });
    }
  }

  return tradeoffs;
}
```

### 6.2 Tradeoff Presentation

Tradeoffs are injected into the coach context as a dedicated section:

```
## ⚠ Goal Conflicts Detected

- [WARNING] Cutting weight while training for Hyrox. EA is 28 kcal/kg FFM — below 
  the 30 threshold. Suggest reducing deficit to -250 cal or adding a rest day.
- [INFO] Concurrent strength + endurance training may create interference. 
  Prioritize one domain and maintain the other.
```

The coach is instructed to address the highest-severity tradeoff first in its response.

---

## 7. Goal Completion & Historical Pattern Analysis

### 7.1 Archiving

When a goal is completed (race happens, exam taken, target weight hit):
1. Status moves to `archived` (not `completed` — archived implies data preservation)
2. All associated workout tags, context snapshots, and date ranges are preserved
3. The goal drops out of active coaching but remains queryable

### 7.2 Pattern Recall

The coach can reference archived goals:

```
## Archived Goals (for pattern reference)
- [race/hyrox] "Hyrox Chicago 2025" — completed Nov 2025
  Result: 87:42 finish. Training block: 12 weeks. 
  Notes: Readiness dropped to 58 during taper week. 
  HRV CV elevated weeks 9-10 (possible overreaching).
```

This enables coaching like: *"Last time you trained for Hyrox, your readiness dropped into yellow during taper week. You're 2 weeks out now and readiness is 72 — ahead of where you were last time. Stay the course."*

### 7.3 Implementation

Archive queries use date-bounded lookups:

```typescript
// When building context for a race goal, check for prior goals of same subtype
const priorRaces = await prisma.goal.findMany({
  where: {
    type: 'race',
    subtype: goal.subtype,
    status: 'archived',
  },
  orderBy: { updatedAt: 'desc' },
  take: 2,
});
```

---

## 8. Implementation Plan

### Phase 1 — Schema + Goal Model (1 session)
- [ ] Migrate Goal model: add `subtype`, `isPrimary`, `priority` fields
- [ ] Create `GoalWorkoutTag` model
- [ ] Update goals-manager.tsx: subtype picker, primary toggle
- [ ] Seed migration for existing goals

### Phase 2 — Context Builder (1 session)
- [ ] Add `focusGoalId` parameter to `buildCoachContext()`
- [ ] Implement section reordering based on goal type
- [ ] Build `goalSystemPromptSection()` dynamic prompt injection
- [ ] Add tradeoff detection engine
- [ ] Wire tradeoffs into context output

### Phase 3 — Coach UI (1 session)
- [ ] Add coaching mode dropdown to coach page
- [ ] Wire dropdown selection to API call (`focusGoalId` parameter)
- [ ] Implement "Just today" brief mode
- [ ] Add archived goal context for pattern recall

### Phase 4 — Workout Tagging (1 session)
- [ ] Post-workout goal tagging prompt in Body Mode
- [ ] Auto-suggestion logic based on workout type
- [ ] Goal-filtered workout history view
- [ ] Goal-scoped volume/e1RM charts

### Phase 5 — Verify & Tune (1 session)
- [ ] Test each goal type with realistic data scenarios
- [ ] Verify tradeoff engine fires correctly
- [ ] Tune system prompt per goal type (iterate on coaching quality)
- [ ] Test "Just today" output format
- [ ] Confirm archived goals surface useful patterns

---

## 9. Why This Approach Over the Alternatives

### vs. "Hard Data Filtering" (Approach 1 in the original prompt)

Hard filtering is faster to implement but scientifically flawed. The variable research shows:
- Sleep affects strength (GH secretion, MPS), running (glycogen replenishment), AND cognition (memory consolidation) — filtering it out of any goal type is wrong
- HRV depression during a caloric deficit looks identical to overtraining unless the coach can see nutrition data — filtering nutrition from a "race" goal creates false overtraining alarms
- Cycle phase affects every domain differently — it must always be visible

Hard filtering also creates a maintenance burden: every new variable requires manual classification into every goal type's filter list. The weighted-lens approach is self-maintaining because the coach (Claude) already understands cross-domain relevance from the research in its system prompt.

### vs. "Pure Mind-Body Integration" (Approach 2 in the original prompt)

The mind-body framework is philosophically correct but lacks operational structure. Telling the coach "consider everything" without goal-type-specific guidance produces generic advice. The body/mind budget framing ("your body can do X, your mind can sustain Y") is a useful output format but isn't a sufficient system design.

This spec takes the mind-body principle (never filter data) and adds the operational structure of Approach 1 (goal types, workout tagging, tradeoff rules, coaching mode selector) — producing advice that is both holistic AND focused.

### The Synthesis

```
Approach 1: Strong structure, wrong data model (filtering)
Approach 2: Right philosophy, weak structure (too open-ended)
This spec:   Strong structure + right data model (weighted lens)
```

---

## References

- Brandt, M., et al. (2025). "Acute physiological responses and performance determinants in Hyrox©." *Frontiers in Physiology*.
- Hickson, R.C. (1980). "Interference of strength development by simultaneously training for strength and endurance." *European Journal of Applied Physiology*.
- Lamon, S., et al. (2021). "The effect of acute sleep deprivation on skeletal muscle protein synthesis." *Physiological Reports*.
- Lieberman, H.R., et al. (2005). "Effects of caffeine, sleep loss, and stress on cognitive performance." *Psychopharmacology*.
- Loucks, A.B., et al. (2011). "Energy availability in athletes." *Journal of Sports Sciences*.
- Marcora, S.M., Staiano, W., & Manning, V. (2009). "Mental fatigue impairs physical performance in humans." *Journal of Applied Physiology*.
- Sung, E., et al. (2014). "Effects of follicular versus luteal phase-based strength training in young women." *SpringerPlus*.
- Walker, M.P. (2017). *Why We Sleep*. Scribner.
- Altini, M. (2022). "Caloric deficit and heart rate variability." HRV4Training.
