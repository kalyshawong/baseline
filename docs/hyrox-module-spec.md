# Hyrox Race-Prep Module — Spec

**Status:** Draft
**Author:** Claude + Kalysha
**Last updated:** 2026-04-10
**Related docs:** `goal-coach-redesign-spec.md`, `apple-watch-training-spec.md`, `task-tracker.md`

## Context

Kalysha has an active primary goal: **Hyrox Mixed Doubles Open, sub-85 minutes, 2026-06-02** (~53 days out at time of writing). The goal-coach redesign already gives the coach a race lens and tradeoff detection, but it reasons over generic biometric + workout data. It has no structured model of:

- What Hyrox actually is (8 × 1km runs interleaved with 8 workout stations)
- Where in the block periodization she currently is
- Whether her pace, station times, and compromised-running capacity are on track
- What specific session she should do today

This spec defines a dedicated Hyrox race-prep module that sits inside **Body mode** and feeds structured data into the **Coach** via new context sections.

---

## Goals

1. **Daily session recommendation** — answer "what should I do today?" using the active plan, today's readiness, and days-to-race
2. **Pace math** — translate a sub-85 goal into per-km run splits and per-station time budgets
3. **Compromised-running logger** — the signature Hyrox session type (run 1km → station → run 1km → station). Log it, trend it
4. **Station PR tracker** — per-station benchmark times with trends
5. **Taper automation** — auto-scale volume in the final 10-14 days
6. **Feed the coach** — expose all of this as a new `hyrox_plan` section that the race lens consumes

## Non-goals (v1)

- Multi-athlete or team support (solo focus until after June 2)
- Support for other race formats (marathon, triathlon) — extend later
- Live in-session tracking (wearable integration during the actual Hyrox race is out of scope)
- Nutrition timing module (already partially handled by existing nutrition logger)
- Video form analysis

---

## Scientific foundation

All references already captured in `research/body-mode-research.md` and `research/variable-research.md`. Key citations specific to Hyrox:

- **Brandt et al. (2025)** — "Physical determinants of Hyrox performance": VO2max, endurance training volume, and body-fat % are the significant predictors. Running time = ~60% of total race time. Recommended training split: 60-70% aerobic, 20-30% strength/functional, 10% compromised-running specific.
- **Hickson (1980)** — Concurrent interference: endurance gains compromise strength gains when both are trained hard in the same week. Mitigation: separate by ≥6 hours, prioritize one primary goal per day.
- **Issurin (2010)** — Block periodization: 2-week accumulation → 2-week transmutation → 1-week realization (peak) → 1-week taper works better than linear for race prep.
- **Bosquet et al. (2007)** — Taper meta-analysis: 41-60% volume reduction over 8-14 days maximizes race-day performance without detraining. Keep intensity high, cut volume.
- **Laursen & Jenkins (2002)** — HIIT + threshold work drives VO2max gains in already-trained athletes faster than high-volume steady-state.

---

## Data model

### New Prisma models

```prisma
model HyroxPlan {
  id              String         @id @default(cuid())
  goalId          String         @unique
  goal            Goal           @relation(fields: [goalId], references: [id], onDelete: Cascade)
  raceDate        DateTime
  targetTime      Int            // total seconds (e.g., 85min = 5100)
  startDate       DateTime       @default(now())

  // Weekly targets (hours) — auto-derived from block at creation, user-editable
  weeklyRunHours         Float   @default(3.0)
  weeklyStrengthHours    Float   @default(2.0)
  weeklyCompromisedHours Float   @default(1.0)

  // Block schedule (in days) — auto-scaled at creation based on weeksToRace,
  // user-editable thereafter. 0 allowed for accumulation on very short runways.
  accumulationDays  Int          @default(14)
  transmutationDays Int          @default(14)
  realizationDays   Int          @default(11)  // ~1.5 weeks
  taperDays         Int          @default(14)

  // Current block state (computed from startDate + above, cached for display)
  currentBlock    String         @default("accumulation") // accumulation | transmutation | realization | taper | complete
  blockStartDate  DateTime       @default(now())

  // Lifecycle: active while race is upcoming; auto-archived after raceDate
  status          String         @default("active")  // active | archived

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  sessions          HyroxSession[]
  stationBenchmarks HyroxStationBenchmark[]
}

model HyroxSession {
  id              String         @id @default(cuid())
  planId          String
  plan            HyroxPlan      @relation(fields: [planId], references: [id], onDelete: Cascade)

  // FK to WorkoutSession (the canonical training record). NEVER duplicate
  // sets, reps, weights, HR — all of that lives on WorkoutSession. HyroxSession
  // is a thin race-specific layer.
  workoutSessionId String?       @unique
  workoutSession   WorkoutSession? @relation(fields: [workoutSessionId], references: [id], onDelete: SetNull)

  day             DateTime
  sessionType     String         // easy_run | tempo | intervals | long_run | strength | compromised | station_work | recovery | race_simulation

  // Race-specific layer (fields that only make sense for Hyrox-flavored sessions)
  stationOrderJson    String?    // JSON array of station keys in the order performed (for compromised/simulation)
  transitionTimesJson String?    // JSON array of seconds per transition (run→station, station→run)
  racePaceTargetJson  String?    // JSON { kmPaceSeconds, perStationBudget: { [key]: seconds } }
  intervalsJson       String?    // compromised running: JSON of { runMeters, runSeconds, station, stationReps, stationSeconds }[]

  // Plan-level metadata — actual performance numbers live on WorkoutSession
  // (sets, HR) or are derived from intervalsJson
  prescriptionNotes   String?    // what the recommender prescribed
  rationale           String?    // why this session today

  createdAt       DateTime       @default(now())
}

model HyroxStationBenchmark {
  id            String      @id @default(cuid())
  planId        String
  plan          HyroxPlan   @relation(fields: [planId], references: [id], onDelete: Cascade)
  station       String      // ski_erg | sled_push | sled_pull | burpee_broad_jump | row | farmers_carry | sandbag_lunges | wall_balls
  timeSeconds   Int
  weightKg      Float?      // for sled/sandbag (women's standard: 102kg push, 78kg pull, 20kg sandbag)
  notes         String?
  recordedAt    DateTime    @default(now())
}
```

### Standard station definitions (static config)

```typescript
// src/lib/hyrox-constants.ts
export const HYROX_STATIONS = [
  { key: "ski_erg",          label: "Ski Erg",              distance: 1000, unit: "m", womenWeight: null },
  { key: "sled_push",        label: "Sled Push",            distance: 50,   unit: "m", womenWeight: 102 },
  { key: "sled_pull",        label: "Sled Pull",            distance: 50,   unit: "m", womenWeight: 78 },
  { key: "burpee_broad_jump",label: "Burpee Broad Jumps",   distance: 80,   unit: "m", womenWeight: null },
  { key: "row",              label: "Rowing",               distance: 1000, unit: "m", womenWeight: null },
  { key: "farmers_carry",    label: "Farmers Carry",        distance: 200,  unit: "m", womenWeight: 16 }, // per hand
  { key: "sandbag_lunges",   label: "Sandbag Lunges",       distance: 100,  unit: "m", womenWeight: 20 },
  { key: "wall_balls",       label: "Wall Balls",           reps: 100,      unit: "reps", womenWeight: 4 },
] as const;

export const HYROX_RUN_DISTANCE = 1000; // m, 8 repeats
export const HYROX_TOTAL_RUN_DISTANCE = 8000; // m
```

---

## Architecture

### Pace math (pure function, no DB)

```typescript
// src/lib/hyrox-pace.ts
export interface HyroxPaceBudget {
  totalSeconds: number;
  runSeconds: number;            // ~60% of total per Brandt 2025
  stationSeconds: number;        // ~35%
  transitionSeconds: number;     // ~5%
  kmPaceSeconds: number;         // seconds per km for running
  perStationBudget: Record<string, number>;
}

export function computePaceBudget(targetSeconds: number): HyroxPaceBudget { ... }
```

For a sub-85 (5100s) goal:
- Running budget: 3060s / 8km = **6:22/km** average
- Station budget: 1785s across 8 stations = **~223s/station** average
- Transitions: 255s

The per-station split isn't equal in reality — wall balls and sandbag lunges are slower than ski erg and row for most athletes. The UI should show the average but allow the user to shift time between stations based on strengths.

### Block periodization engine

```typescript
// src/lib/hyrox-blocks.ts
export type Block = "accumulation" | "transmutation" | "realization" | "taper" | "complete";

// Run at plan creation (and on explicit "Recalculate blocks" user action)
export function autoScaleBlocks(weeksToRace: number): {
  accumulationDays: number;
  transmutationDays: number;
  realizationDays: number;
  taperDays: number;
} {
  const totalDays = Math.max(weeksToRace * 7, 0);

  // Default ratio: 2 / 2 / 1.5 / 2 = 7.5 weeks canonical
  const RATIO = { accum: 2/7.5, trans: 2/7.5, real: 1.5/7.5, taper: 2/7.5 };

  // Taper clamped to [10, 21] days (Bosquet 2007 range)
  const taperDays = Math.round(Math.min(Math.max(totalDays * RATIO.taper, 10), 21));
  // Realization clamped to [7, 14] days
  const realizationDays = Math.round(Math.min(Math.max(totalDays * RATIO.real, 7), 14));
  // Transmutation takes its share
  const transmutationDays = Math.round(totalDays * RATIO.trans);
  // Accumulation absorbs any remainder (can be 0 on very short runways)
  const accumulationDays = Math.max(totalDays - taperDays - realizationDays - transmutationDays, 0);

  return { accumulationDays, transmutationDays, realizationDays, taperDays };
}

// Run on every recommender call — reads the cached block fields on HyroxPlan
export function currentBlock(plan: HyroxPlan, today: Date): {
  block: Block;
  dayInBlock: number;
  weekInBlock: number;
  daysToRace: number;
  volumeMultiplier: number;   // 1.0 = baseline, 0.5 = taper wk 2
  intensityMultiplier: number;
} { ... }
```

**Schedule for Kalysha's 53-day runway** (auto-scaled from 7.5w canonical):
- Days 53-40 (2w): **accumulation** — high volume, moderate intensity
- Days 39-26 (2w): **transmutation** — high intensity, moderate volume (compromised running dominates)
- Days 25-15 (1.5w): **realization** — race-pace rehearsals, station PRs
- Days 14-0 (2w): **taper** — volume −50%, intensity preserved, sharpness sessions

**Example scaled schedules:**
| Weeks to race | Accum | Trans | Real | Taper |
|---|---|---|---|---|
| 16 | 6.0w | 4.5w | 2.0w | 3.0w *(clamped to 21d)* |
| 10 | 3.0w | 2.5w | 1.5w | 3.0w *(clamped to 21d)* |
| 7.5 | 2.0w | 2.0w | 1.5w | 2.0w |
| 6 | 1.5w | 1.5w | 1.0w | 2.0w |
| 4 | 0w | 1.5w | 1.0w | 1.5w *(clamped to 10d min)* |
| 2 | 0w | 0.5w | 0w | 2.0w |

User can override any block length on the plan edit page. Auto-scale only runs at plan creation or on explicit "Recalculate blocks" button click.

### Daily session recommender

```typescript
// src/lib/hyrox-session-recommender.ts
export function recommendSession(params: {
  plan: HyroxPlan;
  readiness: number | null;
  hrvCv: number | null;
  sleepHours: number | null;
  cyclePhase: string | null;
  daysSinceLastHardSession: number;
  today: Date;
}): {
  sessionType: string;
  title: string;
  prescription: string;       // "4 x 1km @ 6:15 w/ 2min rest"
  durationMin: number;
  rationale: string;          // "You're in transmutation wk 1, readiness 72, last hard session 2 days ago"
  warnings: string[];         // tradeoffs surfaced from existing detectTradeoffs()
} { ... }
```

Rules (in order of precedence):
1. If readiness < 50 OR sleep < 5h → `recovery` session regardless of plan
2. If HRV CV > 10% → downgrade to easy_run
3. If cycle phase = luteal AND planned session = intervals → swap for tempo
4. If days since last hard session ≥ 4 AND block = transmutation → force intervals
5. Otherwise → follow block template rotation (Mon: intervals, Tue: strength, Wed: easy, Thu: compromised, Fri: rest/strength, Sat: long run, Sun: rest)

---

## Coach integration

Add new context sections consumed by `buildCoachContext()`:

```typescript
// In coach-context.ts sectionOrder for race subtype hyrox:
["hyrox_plan", "hyrox_recent_sessions", "hyrox_pace_gap", "readiness", ...]

function buildHyroxPlanSection(plan, today) {
  return [
    "## Hyrox Race Plan",
    `- Race date: ${plan.raceDate} (${daysToRace} days)`,
    `- Target: sub-${Math.round(plan.targetTime/60)}min`,
    `- Current block: ${plan.currentBlock} (week ${weekInBlock})`,
    `- This week: ${weekRunMin}min run / ${weekStrMin}min strength / ${weekCompMin}min compromised`,
  ];
}
```

`goalSystemPromptSection(goal)` already has a `subtype === "hyrox"` branch — extend it to reference these new sections explicitly so the coach knows the plan is available:

> "You have access to the full Hyrox plan including current block, pace budget, and recent session types. When asked about race readiness, quote numbers from `## Hyrox Race Plan` and `## Hyrox Pace Gap`."

---

## UI layout

### `/body` summary card (new)

When an active HyroxPlan exists, add a single card at the top of the Body mode page:

```
┌─────────────────────────────────────────────┐
│ 🏁 Hyrox Mixed Doubles Open                 │
│ [countdown ring]  53 days out · Accumulation│
│                                              │
│ Today's session: Tempo run, 40min @ 6:00/km │
│ View plan →                                  │
└─────────────────────────────────────────────┘
```

Card hides when no active plan exists (status=active). Keeps `/body` clean for general strength training when no race is active.

### `/body/hyrox` — canonical Hyrox page

New route. All the Hyrox-specific detail lives here:

### Header card
- Countdown ring (reuse `countdown-ring.tsx`) centered on race date
- Current block + week-in-block
- Target time + current projected time based on recent sessions

### Today's session card
- Recommended session from `recommendSession()`
- One-click "Start this session" → creates a WorkoutSession with pre-filled template
- Rationale (why this session today)
- Any active tradeoffs from `detectTradeoffs()`

### Pace budget card
- Table: station / target time / last recorded time / delta
- Editable per-station allocation (user can shift budget)
- Visual bar showing run vs station vs transition split

### Station benchmarks card
- Last 5 per-station times with sparkline
- "Record new benchmark" CTA per station

### Compromised-running sessions card
- Log form: sequence of (run distance + time) → (station + reps/distance + time) pairs
- Total time, avg run pace, station-weighted score

### Volume this week card
- Actual vs target for run/strength/compromised hours
- Color-coded: under → yellow, on target → green, over → red

---

## Phased implementation

### MVP (Phase 1) — 2-3 days of work
**Goal:** get the pace math and daily session recommender into the coach by end of next weekend.

1. Schema: add `HyroxPlan`, `HyroxSession`, `HyroxStationBenchmark` models with all race-specific fields + auto-scale block day fields + archive status; `prisma db push`
2. `src/lib/hyrox-constants.ts`: stations, distances, standard weights
3. `src/lib/hyrox-pace.ts`: pure pace math (unit-test as pure function)
4. `src/lib/hyrox-blocks.ts`: `autoScaleBlocks(weeksToRace)` pure function + `currentBlock(plan, today)` accessor
5. `src/lib/hyrox-session-recommender.ts`: daily session rule engine
6. **Goal integration hook** — modify `POST /api/goals` and `PATCH /api/goals/[id]` to auto-create a HyroxPlan when a goal with `type=race, subtype=hyrox` is saved (and the goal has a deadline). Use `autoScaleBlocks` to populate block day fields. Parse `target` for the time goal (regex for "sub 85", "sub-85 minutes", "1:25:00"). All wrapped in the existing transaction from BUG-C3 fix.
7. **Plan archive cron-less check** — on any `GET /api/hyrox/*` call, if `raceDate < today` and status is active, flip status to archived. No separate cron needed.
8. `GET /api/hyrox/plan?goalId=X` — fetch active plan by goal
9. `GET /api/hyrox/today` — returns today's recommended session from the rule engine
10. `PATCH /api/hyrox/plan/[id]` — edit block day overrides + "Recalculate blocks" action
11. Extend `buildCoachContext()`: add `hyrox_plan`, `hyrox_pace_gap` sections keyed to the hyrox subtype
12. Extend `goalSystemPromptSection()`: reference the new sections in the `subtype === "hyrox"` branch
13. Minimal UI:
    - Summary card on `/body` page (countdown + today's session + "View plan →" link) — hides when no active plan
    - New route `/body/hyrox` — header card with countdown + block state, today's session card, "Start this session" CTA that pre-fills a WorkoutSession template
14. Smoke test: delete the existing `cmnruzcrp0005ij8s6hvkbd06` Hyrox goal, re-create it with `subtype=hyrox`, verify plan auto-creates with correct 2/2/1.5/2 block schedule

**Acceptance:**
- Editing the Hyrox goal to `subtype=hyrox` auto-creates a HyroxPlan
- `/body/hyrox` shows today's recommended session
- Coach can answer "what should I do today?" with the same specific prescription
- Coach can answer "am I on pace?" with numbers pulled from logged HyroxSessions (even if just 1-2 logged)

### Phase 2 — Station tracking (1-2 days)

1. `POST /api/hyrox/benchmark` — record a station benchmark
2. `GET /api/hyrox/benchmarks` — list with trend per station
3. Station benchmark card UI
4. Add `hyrox_stations` section to coach context
5. Extend session recommender to prescribe specific station work when deltas are worst

### Phase 3 — Compromised running logger (1-2 days)

1. Compromised-session logging UI (interval editor)
2. `intervalsJson` parsing + stats (avg run pace, station average, total time)
3. Charts: total time trend, run pace under fatigue trend
4. Coach context: last compromised session summary

### Phase 4 — Taper automation + polish (1 day)

1. Auto-detect entry into taper block (14 days out); show banner
2. Taper volume multiplier applied to recommender
3. "Race week checklist" (sleep, nutrition, travel, equipment)
4. Block transition notifications

### Phase 5 — Post-race (nice-to-have)

1. Post-race debrief form
2. Archive plan, carry forward learnings
3. Comparison report: target vs actual per station

---

## Integration with existing systems

| System | Integration |
|---|---|
| **Goals** | HyroxPlan is keyed by `goalId` (unique). When a goal with `type=race, subtype=hyrox` is created OR when an existing race goal's subtype is changed to `hyrox`, a HyroxPlan is auto-created with defaults (targetTime parsed from goal.target if possible, raceDate = goal.deadline, blocks auto-scaled from weeksToRace). After raceDate passes, plan auto-archives (status=archived) but all HyroxSession + HyroxStationBenchmark rows remain for post-race analysis. |
| **Workout logger** | HyroxSession links 1:1 to WorkoutSession via `workoutSessionId @unique`. All training data (sets, reps, weights, HR, duration) lives on WorkoutSession — HyroxSession only adds race-specific metadata. Deleting the WorkoutSession sets HyroxSession.workoutSessionId to null (via `onDelete: SetNull`) so the race-plan layer survives. |
| **Coach context** | New sections `hyrox_plan`, `hyrox_pace_gap`, `hyrox_recent_sessions`, `hyrox_stations` added to the 6-goal-lens sectionOrder map for race. |
| **Tradeoff engine** | Existing `detectTradeoffs()` catches "deficit + race", "HRV CV overreaching", "luteal + race" — all three directly apply. Add one Hyrox-specific rule: "compromised session + readiness < 60" (Hyrox-specific interference). |
| **Countdown ring** | Already built for goal cards — reuse on the Hyrox header card with larger size. |
| **Nutrition** | Existing energy-availability warning (Loucks 2011) is the cutoff for race-prep sustainability. No new logic needed. |
| **HealthKit sync** | Running metrics (VO2 max, running power, GCT, stride length) are the key telemetry. **Currently blocked** — see `task-tracker.md` → Apple Watch metric discovery. |

---

## Resolved decisions (2026-04-10)

1. **HyroxPlan lifecycle** — Auto-create when a goal with `type=race, subtype=hyrox` is saved. No separate "Start race plan" click. When the race date passes, auto-archive the plan (status=archived) but keep all HyroxSession and HyroxStationBenchmark rows as historical data for post-race analysis and future race prep.
2. **HyroxSession ↔ WorkoutSession** — Link via FK (`workoutSessionId`). Never duplicate workout data. HyroxSession is a thin race-specific layer on top of WorkoutSession adding: station order, transition times, race-pace targets for this specific session, and compromised-running intervals. Strength/station work that happens inside a Hyrox-flavored session still lives as WorkoutSets on the underlying WorkoutSession.
3. **UI location** — New route `/body/hyrox` is the canonical place for everything Hyrox. `/body` stays clean for general strength/body mode. Add a single "Active race plan" summary card on `/body` that shows race name, countdown, current block, today's recommended session, and a "View plan →" link to `/body/hyrox`. Card hides when no active plan exists.
4. **Block schedule** — Keep the 2w/2w/1.5w/2w as the **default ratio** but auto-scale block lengths based on weeks-until-race. Also allow per-plan overrides.

   Scaling logic:
   - Compute `weeksToRace` from `raceDate - startDate`
   - Default ratio: accumulation 28.6% / transmutation 28.6% / realization 21.4% / taper 21.4% (= 2/2/1.5/2 out of 7.5 total weeks)
   - Multiply each by `weeksToRace / 7.5` and round to nearest half-week
   - Taper is clamped to `[10 days, 21 days]` regardless of total duration (research floor + ceiling)
   - Realization is clamped to `[1 week, 2 weeks]`
   - Accumulation absorbs any remainder

   Examples:
   - 7.5 weeks → 2w / 2w / 1.5w / 2w (canonical)
   - 16 weeks → 6w / 4.5w / 2w / 3w (taper clamps at 21d, accumulation absorbs extra)
   - 6 weeks → 1.5w / 1.5w / 1w / 2w (taper clamps at 10d minimum? No — 2w fits in 6w, so use the actual scaled 2w)
   - 4 weeks → 0w / 1.5w / 1w / 1.5w (no accumulation phase; start at transmutation; taper clamps at 10d minimum)

   Per-plan overrides: editable `accumulationDays`, `transmutationDays`, `realizationDays`, `taperDays` fields on HyroxPlan. Auto-scaling only runs on plan creation; user edits are preserved thereafter. Add a "Recalculate blocks" button that re-runs the auto-scale on demand.

5. **Solo vs Mixed Doubles** — Deferred. V1 treats Kalysha's race as solo pace target. Flag for V2 if relevant post-race.
6. **Run logging source** — Both paths supported. Auto-populate from Apple Watch (via existing healthkit-sync) when a run is detected within the plan's time window. Allow manual HyroxSession creation as override. Contingent on HAE running-metrics fix landing.

---

## Success metrics

- **Usage:** user opens `/body/hyrox` ≥ 5 days/week during the 53-day runway
- **Signal quality:** coach answers "am I on pace?" in <5 seconds with citations to logged sessions
- **Outcome:** sub-85 race time on 2026-06-02 (or at minimum, known delta with attributable cause)

---

## Risks

| Risk | Mitigation |
|---|---|
| Schema bloat — adding 3 models for one goal type | HyroxPlan is keyed 1:1 with Goal and only instantiates when needed. Other race types would follow same pattern. |
| Coach context size balloons | Hyrox sections are only included when active goal is hyrox (sectionOrder filters this). |
| User doesn't log sessions → empty recommender → bad UX | Seed fallback session templates per block so an empty plan still shows something useful on day 1. |
| HAE running metrics still broken at race time | Session recommender degrades gracefully: pace targets work off manual logs if Apple Watch data is unavailable. |
| 53 days is already tight — by the time this ships, less | Ship MVP in 3 days. Phases 2-4 nice-to-have. |

---

## Decisions needed before Phase 1

1. ✅ Confirmed: race date = 2026-06-02, target = 5100s (sub-85 min)
2. ❓ Should the plan auto-create on goal create/edit, or require explicit "Start race plan" click? **Recommendation:** auto-create with sensible defaults the moment a race/hyrox goal is saved.
3. ❓ Should HyroxSession duplicate WorkoutSession data or link by FK? **Recommendation:** link by FK (avoid duplication, single source of truth for workouts).
4. ❓ UI location — new `/body/hyrox` route or expanded Body mode section? **Recommendation:** new route so it can be linked from the goal card, but with a summary card on `/body` dashboard.

---

## Next action

Ready to kick off Phase 1. The scope is tight enough to build in one focused session. Before starting:
- Decide on the 4 open questions above
- Confirm the 53-day schedule (accumulation → transmutation → realization → taper) matches your training style or should be adjusted
- Fix the HAE VO2/running-metrics issue in parallel so Phase 1 has real telemetry to work with
