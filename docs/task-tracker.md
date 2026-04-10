# Baseline — Task Tracker

**Last Updated:** 2026-04-10
**Stack:** Next.js 15, React 19, Prisma (SQLite), Tailwind CSS 4, Recharts, jstat, @anthropic-ai/sdk

---

## Phase 1 — MVP (Complete)

### Project Setup — Done

- [x] Initialize Git repo and project structure
- [x] Set up Next.js project with TypeScript + Tailwind
- [x] Configure Prisma ORM with SQLite
- [x] Define database schema: OuraToken, DailyReadiness, DailySleep, DailyStress, HeartRateSample, CyclePhaseLog, SyncLog
- [x] Set up environment variable management (.env, .env.example)
- [x] Configure .gitignore

### Oura Integration — Done (critical bugs fixed)

- [x] Register app on Oura developer portal
- [x] Implement OAuth2 authorization flow (redirect → callback → token exchange)
- [x] Build token storage with Prisma upsert pattern
- [x] Implement auto-refresh logic (5-min pre-expiry check)
- [x] Build Oura API client module (`src/lib/oura.ts`)
- [x] Create sync endpoint: pull readiness, sleep, stress, heart rate
- [x] Implement sync logging (SyncLog model)

### Baseline Score — Done (bugs 4 & 5 fixed)

- [x] Implement composite score calculation (readiness 40%, HRV 25%, sleep 20%, temp 15%)
- [x] Color-coded feedback (green/yellow/red thresholds)
- [x] HRV trend scoring (3-day vs 14-day rolling average)
- [x] **BUG 4 FIXED:** Null components now excluded with weight redistribution
- [x] **BUG 5 FIXED:** Temp deviation now cycle-phase-aware (luteal −0.4°C, ovulation −0.15°C offset)

### Dashboard — Done

- [x] Daily dashboard: readiness score, sleep, stress, cycle phase
- [x] Baseline Score card with component breakdown
- [x] Sync button with status display
- [x] Recharts trend visualization
- [x] Responsive grid layout
- [x] Conditional rendering: "Connect Oura" CTA vs data view
- [x] Date navigation (forward/back by day)
- [x] Activity card (steps, calories, active time)
- [x] Calorie balance card (intake vs burn)

### Cycle Phase Tracking — Done

- [x] Cycle phase selector UI (4 phases with color coding)
- [x] Store daily phase log with date + phase (upsert by day)
- [x] Display current phase on dashboard with training context notes

---

## Phase 2a — Mind Mode (Complete)

*See `phase-2-spec.md` for full specification*

### Data Models — Done

- [x] `Experiment` model (cuid, title, hypothesis, IV, DV, metric, source, lagDays, minDays, status)
- [x] `ExperimentLog` model (experimentId FK, day, independentValue boolean, intensity float, notes)
- [x] `ActivityTag` model (tag, category, timestamp, metadata JSON, optional experimentId)
- [x] `NutritionLog` model (day, calories, protein, carbs, fat) — bonus feature
- [x] `NutritionEntry` model (food parsing, meal type, eatenAt timestamp)
- [x] `EnvReading` model (deviceId, pm25, temperature, humidity, pressure, noiseDb, lux)
- [x] Prisma migration applied

### Experiment Framework — Done

- [x] Experiment creation UI (from templates or custom)
- [x] 5 pre-seeded templates (lo-fi/sleep, breathing/HR, sunlight/HRV, caffeine/sleep, meditation/readiness)
- [x] Experiment list/dashboard view (active, completed, draft)
- [x] Daily logging UI (treatment/control toggle + notes)
- [x] Experiment lifecycle (draft → active → completed → analyzed)
- [x] Experiment detail view with logs + analysis
- [x] API routes: CRUD experiments, logs, analyze

### Tagging System — Done

- [x] Quick-tag UI with 8 preset categories + color coding
- [x] Custom tag creation
- [x] Timestamps captured automatically
- [x] Optional experiment linking
- [x] Tag history/timeline view
- [x] API: create, list (date range + category filter), delete

### Correlation Engine — Done

- [x] Welch's t-test implementation (`src/lib/correlation.ts`)
- [x] Cohen's d effect size + significance labels
- [x] 95% confidence intervals
- [x] Lag days support (next-day experiments)
- [x] Minimum data threshold (3+ per condition)
- [x] Natural language insight generation
- [x] `/api/experiments/[id]/analyze` endpoint

### Insights System — Done

- [x] Passive tag-to-biometric correlation (`src/lib/insights.ts`)
- [x] 90-day rolling analysis
- [x] Auto-filters to tags with 5+ instances
- [x] Welch p-value filtering (p < 0.15)
- [x] Recommendation generation
- [x] InsightsFeed component

### Nutrition Logger — Done (bonus)

- [x] Claude API macro estimation from natural language (`src/lib/usda.ts`)
- [x] NutritionEntry records with per-food breakdown
- [x] Meal type tagging (breakfast/lunch/dinner/snack)
- [x] Time-of-day precision (eatenAt timestamp)
- [x] Daily NutritionLog aggregation
- [x] MacroSummary display component
- [x] Delete entries with auto-decremented totals

### Environment Sensor Integration — Done

- [x] HTTP POST endpoint with Bearer auth (`/api/env-readings`)
- [x] GET endpoint for recent readings
- [x] EnvCard component (latest conditions)

### Mind Mode Dashboard — Done

- [x] `/mind` page with full integration
- [x] TodayContext card (readiness, sleep, HRV, cycle, stress)
- [x] QuickTag interface
- [x] NutritionInput + MacroSummary
- [x] Active experiments with progress bars
- [x] InsightsFeed
- [x] EnvCard
- [x] TagTimeline

---

## Phase 2b — Body Mode (In Progress)

*See `phase-3-spec.md` for full specification*
*Scientific foundation: `body-mode-research.md` (27 peer-reviewed citations)*

### Research — Complete

- [x] HRV and readiness science (Plews, Flatt, Kiviniemi)
- [x] Recovery time per muscle group and training frequency (Schoenfeld)
- [x] Sleep quality → muscle protein synthesis (Lamon, Dattilo)
- [x] Volume landmarks: MEV/MAV/MRV (Israetel, Schoenfeld dose-response)
- [x] Velocity-based training thresholds (González-Badillo, Banyard)
- [x] Autoregulation methods: RPE vs velocity vs HRV (Zourdos)
- [x] Deload timing and fatigue markers (Pritchard, Cadegiani)
- [x] Protein timing/distribution and per-meal dose (Schoenfeld, Aragon, Moore, Morton)
- [x] Caloric intake and recovery metrics (Loucks, Altini)
- [x] Cycle-phase effects on strength, fatigue, injury (McNulty, Wikström-Frisén, Sung, Hewett, Wojtys)

### Data Models — Done

- [x] `Exercise` model (name, muscleGroup, movementPattern, equipment, isCompound, defaults)
- [x] `WorkoutSession` model (date, duration, readinessScore, cyclePhase, sessionRPE, templateName)
- [x] `WorkoutSet` model (exerciseId, sessionId, setNumber, reps, weight, rpe, restSeconds, isWarmup, isPR)
- [x] `WorkoutTemplate` model (name, split, exercises JSON)
- [x] `UserProfile` model (bodyWeight, bodyFat, height, age, sex, experienceLevel, goals, units)
- [x] `Goal` model (title, type, target, deadline, status)
- [x] `ChatSession` + `ChatMessage` models (coach conversation history)
- [x] `WeightLog` model (day, weightKg, bodyFatPct, muscleMassKg)
- [x] `DailyActivity` model (steps, calories, active time, sedentary time)
- [x] Prisma migration applied
- [x] Seed exercise library (`prisma/seed-exercises.ts`)

### Workout Logger — Done

- [x] Session creation flow (select exercises → log sets)
- [x] Set logging UI: reps × weight × RPE quick-entry
- [x] Previous session comparison per exercise
- [x] Session volume calculation + display
- [x] Exercise search/filter
- [x] Workout templates (save/reuse)
- [x] Workout history view
- [x] Individual workout detail view (`/body/workout/[id]`)

### Progressive Overload Tracking — Done

- [x] Volume load trends (sets × reps × weight over time)
- [x] Estimated 1RM calculation (Epley formula)
- [x] Workout trends API endpoint
- [x] Trends charts component

### Training Intelligence — Done

- [x] Readiness tier card with training recommendations
- [x] Cycle phase guidance card with phase-specific advice
- [x] RPE suggestions API endpoint
- [x] Training utility functions (`src/lib/training.ts`): RPE creep detection, HRV CV, fatigue score
- [x] HRV CV overreaching badge on readiness tier card (threshold: 10%, Flatt & Esco 2016)
- [x] Deload detection card: composite fatigue score from real data (weeksSinceDeload, HRV below baseline, HRV CV, sleep decline, RHR elevated, RPE creep, volume near MRV) with deload protocol display
- [x] ACL injury risk flag during ovulation: expanded warning with specific training recs (Hewett 2007, Wojtys 2002)
- [x] Volume zone alerts: below MEV (red), approaching MRV (yellow/red) inline banners
- [x] MEV/MAV/MRV volume zone display: color-coded position markers per zone status

### Coach — Done (new feature, unplanned)

- [x] Claude-powered coaching chat (`/coach` page)
- [x] Rich context builder (`src/lib/coach-context.ts`) — aggregates all biometric, training, nutrition, and experiment data
- [x] Chat session persistence (ChatSession + ChatMessage models)
- [x] Session management (create new, resume existing)
- [x] Chat interface component

### Goals — Done (new feature, unplanned)

- [x] Goal CRUD API (`/api/goals`)
- [x] Goals manager component
- [x] Goal types: weight, race, exam, performance, habit, custom
- [x] Goal status tracking: active, completed, abandoned
- [x] Goals page (`/goals`)

### Weight Tracking — Done (new feature, unplanned)

- [x] Weight log CRUD API (`/api/weight`)
- [x] Weight input component
- [x] Weight trend chart (Recharts)
- [x] TDEE estimation (`src/lib/tdee.ts`)
- [x] TDEE card component
- [x] Weight goal settings

### Navigation — Done

- [x] Global navigation component
- [x] Date navigation component (shared across pages)

### Nutrition Integration — Done

- [x] Show protein intake (from existing NutritionLog)
- [x] Nutrition check component on body page
- [x] Daily protein vs 1.6 g/kg target comparison (Morton 2018) — bar + percentage
- [x] Per-meal protein flag: <20g yellow, >30g amber excess (Moore 2009)
- [x] Energy availability warning: <30 kcal/kg FFM (Loucks 2011) with red alert card

---

## HealthKit / Apple Watch Integration — Done

*Via Health Auto Export iOS app ($4.99)*

- [x] Prisma models: HealthKitSync, HealthKitWorkout, HeartRateZoneSummary
- [x] POST /api/healthkit-sync — webhook endpoint for Health Auto Export
  - Bearer auth via HEALTHKIT_SYNC_KEY
  - Processes metrics (heart rate, resting HR, steps, active energy, weight, body fat)
  - Processes workouts (name, duration, calories, distance, HR zones)
  - Processes cycle tracking (menstrual flow → CyclePhaseLog with source="healthkit")
  - Per-section error tracking, partial/failed status logging
  - Manual entries take priority over HealthKit for cycle phase
- [x] GET /api/healthkit-sync — sync history
- [x] GET /api/workouts/apple-watch — list Apple Watch workouts
- [x] HealthKit status card on dashboard (last sync, today's workout summary)
- [x] Coach context enriched with Apple Watch workout data + cycle source
- [x] HEALTHKIT_SYNC_KEY added to .env.example

---

## Oura Sync Expansion — Data Ingestion Done

*See `oura-sync-expansion-spec.md` for full specification*

### New Endpoints — Done

- [x] Prisma models: DailySpO2, OuraWorkout, OuraSession, SleepTimeRecommendation, DailyResilience, DailyVO2Max
- [x] ActivityTag model: add `ouraTagId` and `source` fields
- [x] Prisma migration (db push)
- [x] syncSpO2() — blood oxygen during sleep
- [x] syncEnhancedTags() — Oura user tags → ActivityTag (correlation engine)
- [x] syncOuraWorkouts() — Oura-native workouts (skip Apple Health source)
- [x] syncSessions() — meditation, breathing, naps with HR/HRV
- [x] syncSleepTime() — bedtime recommendations
- [x] syncResilience() — longitudinal recovery capacity
- [x] syncVO2Max() — aerobic capacity trend
- [x] syncPersonalInfo() — auto-populate UserProfile on first connect
- [x] Handle 403 scope errors with reauth flag (OuraScopeError class)
- [x] Update OAuth scope string (add spo2, workout, session, personal, tag, stress)
- [x] Update coach-context.ts with new data sections (SpO2, resilience, VO2 max, sessions, bedtime rec)
- [x] Update SyncLog to include new endpoint counts
- [x] Update sync-button.tsx to show all 12 endpoint counts

### Known Scope Issues

- Enhanced Tags: requires `tag` scope — added to OAuth, needs re-auth
- Resilience: requires `stress` scope — added to OAuth, needs re-auth
- VO2 Max: 404 — may not be available for ring model/subscription

### Dashboard Components — Done

*See `oura-dashboard-spec.md` for full frontend specification*

- [x] SpO2 MetricCard in top grid
- [x] Resilience MetricCard in top grid
- [x] Bedtime recommendation card
- [x] Sessions section (meditation/breathing/naps)
- [x] VO2 Max card moved to Body mode (training metric, not daily vital)

### Health Auto Export Fixes — Done

- [x] Fixed weight conversion (lbs → kg)
- [x] Fixed 401 auth on Health Metrics automation (Bearer prefix)
- [x] Confirmed metric names: weight_body_mass, body_fat_percentage, body_mass_index

---

## Apple Watch Training Metrics — Done

*See `apple-watch-training-spec.md` for full specification*

### Backend — Done

- [x] DailyRunningMetrics Prisma model (10 fields: running speed, power, GCT, vertical oscillation, stride length, cardio recovery, walking+running distance, respiratory rate, physical effort)
- [x] 10 new HealthKit sync cases in `src/app/api/healthkit-sync/route.ts` (3 confirmed names + 7 placeholders)
- [x] VO2 Max rerouted from Apple Watch instead of Oura (Oura 404)
- [x] syncVO2Max() commented out in `src/lib/sync.ts`
- [x] `npx prisma db push` applied

### Dashboard Reorganization — Done

- [x] Removed VO2 Max card from dashboard (moved to Body mode)
- [x] Removed WeightTrendChart from dashboard (moved to Body mode)
- [x] Removed WeightGoalSettings from dashboard (moved to Body mode)
- [x] Dashboard retains: 6 MetricCards, Bedtime, Sessions, compact weight + TDEE, Sleep Breakdown

### Body Mode Expansion — Done

- [x] New RunningMetricsCard component (`src/components/body/running-metrics-card.tsx`)
- [x] 5-section Body mode layout: Composition & Energy, Training Readiness, Running & Cardio, Strength Training, Recovery
- [x] Full weight section moved to Body (WeightCard + WeightInput + WeightTrendChart + WeightGoalSettings + TDEE)
- [x] Sleep Breakdown added to Body Recovery section
- [x] Bedtime Recommendation added to Body Recovery section
- [x] Coach context updated with Running & Cardio section

### Pending — Discovery

- [ ] Discover remaining Apple Watch metric names (running speed, power, GCT, vertical oscillation, stride length, VO2 Max, cardio recovery) — requires tracked outdoor run
- [ ] Update placeholder case names in healthkit-sync once discovered

---

## Goal-Coach Redesign — Done

*See `goal-coach-redesign-spec.md` and `goal-coach-implementation-instructions.md`*

### Phase 1: Schema + Goal Lens System — Done

- [x] Add `subtype`, `isPrimary`, `priority` fields to Goal model
- [x] `GoalLens` type system: 6 goal types (race, strength, physique, cognitive, weight, health) with sectionOrder + coachingFrame
- [x] Schema migration via `prisma db push`

### Phase 2: Section-Based Context Builder — Done

- [x] Rewrite `buildCoachContext()` to assemble `Map<string, string[]>` of named sections
- [x] Reorder sections dynamically based on active goal's sectionOrder
- [x] 14+ named sections: score, readiness, sleep, nutrition, weight_trend, running_cardio, vo2max, apple_watch_workouts, strength_sets, experiments, goals, etc.

### Phase 3: Dynamic System Prompt Injection — Done

- [x] `goalSystemPromptSection(goal)` returns goal-type-specific directives
- [x] Wired into `/api/coach/route.ts` POST handler

### Phase 4: Tradeoff Detection Engine — Done

- [x] `detectTradeoffs()` function with 5 rules:
  - [x] Deficit + race goal (energy availability < race demands)
  - [x] Exam + low readiness (cognitive goal conflict)
  - [x] Concurrent interference (strength + endurance overlap)
  - [x] HRV CV overreaching (Flatt & Esco 2016 threshold)
  - [x] Luteal + race (ACL/performance risk window)
- [x] `/api/coach/tradeoffs` GET endpoint
- [x] Tradeoffs surfaced in coach context block

### Phase 5: Workout → Goal Tagging — Done

- [x] `GoalWorkoutTag` join model (goalId, sessionId, unique pair)
- [x] `goal-tagger.tsx` component with regex-based goal suggestion (running/strength keywords)
- [x] `/api/workouts/[id]/goals` endpoint
- [x] Wired into workout logger
- [x] `scripts/verify-phase5.ts` verification script

---

## Goals & Coach UI Redesign — Done

*See `goals-coach-ui-implementation.md` and `ui-redesign-prompts.md`*

### Phase 1: Bug Fixes — Done

- [x] Fix WEIGHT badge on Hyrox goal (type/subtype display)
- [x] Distinguish Done vs Archive actions (separate status transitions)
- [x] Fix `suggestGoals` to consider workout context (name regex matching)

### Phase 2: Inline Editing — Done

- [x] `editingId` + `editFields` state in goals-manager
- [x] Inline edit form with title, type pill selector, subtype pill selector, target, deadline, notes, Save/Cancel
- [x] Per-type hex colors for visual pills

### Phase 3: Countdown Rings — Done

- [x] `countdown-ring.tsx` SVG component
- [x] Calculates % time elapsed between createdAt and deadline
- [x] Shows days remaining as center text
- [x] Integrated into goal cards

### Phase 4: Visual Focus Pills + Dynamic Prompts — Done

- [x] Replace `<select>` lens dropdown with horizontal pill buttons in chat-interface
- [x] `getSuggestedPrompts()` returns goal-type-specific starter prompts
- [x] Lens indicator line above each assistant message ("Responding through {type} lens — {title}")

### Phase 5: Tradeoff Alert Banner — Done

- [x] Fetch `/api/coach/tradeoffs` on focus change
- [x] Amber alert banner with tradeoff text + research citation
- [x] Renders between focus pills and chat area

### Phase 6: Session Timestamps — Done

- [x] Relative date timestamps on session sidebar (Today / Mon / Apr 5 / etc.)
- [x] Session list re-orders on updatedAt

---

## Resilience Improvements — Done

- [x] `src/lib/anthropic-retry.ts` helper: `withAnthropicRetry()` with exponential backoff (1s→2s→4s→8s + jitter)
- [x] Retryable error detection (529, 429, 500, 502, 503 + overloaded_error, api_error, rate_limit_error, service_unavailable)
- [x] Wired into `/api/coach/route.ts` coach message call
- [x] Wired into `src/lib/usda.ts` `estimateMacros()` for meal parsing
- [x] 4 attempts max, non-retryable errors re-thrown immediately

---

## Phase 2c — Arduino IMU (Not Started)

*See `arduino-build-guide.md` for hardware details*

- [ ] BLE data ingestion endpoint
- [ ] Velocity-load profile builder per exercise
- [ ] Real-time velocity display during sets
- [ ] Velocity loss threshold alerts (Banyard: 10–30% by phase)
- [ ] 1RM estimation from velocity (González-Badillo: r = −0.97)

---

## Phase 3 — Scale

### Environment Sensor Hardware

- [x] Order core parts: ESP32, BME280, PMS5003, MAX4466 (~$47)
- [ ] Order breadboard, jumper wires, resistor kit (~$18)
- [ ] Build sensor firmware (Arduino C++)
- [ ] Wire voltage divider for PMS5003 (10kΩ + 20kΩ)
- [ ] WiFi data push to Baseline HTTP endpoint
- [ ] Build enclosure (3D printed or project box)

### Integrations

- [ ] Apple HealthKit (HR zones, workouts, menstrual data)
- [ ] Auto cycle phase detection (Oura temp proxy)
- [ ] Hyrox race-prep module

### Scale

- [ ] Multi-user support (add userId FK across all models)
- [ ] Migrate SQLite → PostgreSQL + TimescaleDB
- [ ] Mobile app (React Native or Swift)
- [ ] Data export / portability
- [ ] Public API for third-party integrations

---

## Bug Fixes — Priority Queue

*Full details in `docs/bugs.md` (30 bugs cataloged)*

### Critical (7) — All FIXED

- [x] BUG-001: Oura 401 retry — `forceRefreshToken()` bypasses cache, max 1 retry, 30s timeout
- [x] BUG-002: Sync errors — per-endpoint error tracking, partial/failed status in SyncLog
- [x] BUG-003: API error handling — `apiError()` utility, all 45 handlers wrapped in try-catch
- [x] BUG-004: Coach rate limiting — 10 req/min limiter, 5-min context cache, model via env var
- [x] BUG-005: JSON safety — `safeJsonParse()` utility, replaced all raw JSON.parse() calls
- [x] BUG-006: Coach context — `Promise.allSettled`, `?.` on nested access, fallback context
- [x] BUG-007: Workout trends — confirmed single query with `include`, added 13-week cap

### High (6) — All FIXED

- [x] BUG-008: UTC date shows wrong day in non-UTC timezones
- [x] BUG-009: No error feedback in 8+ client components
- [x] BUG-010: Cycle phase optimistic update doesn't revert on failure
- [x] BUG-011: Missing input validation on workout set data
- [x] BUG-012: Missing input validation on weight logging
- [x] BUG-013: Training utility functions have no input validation

### Medium (10) + Low (7) — See bugs.md

---

## Open Issues (non-blocking)

- [ ] Claude API model hardcoded in `src/lib/usda.ts` — should be env variable (coach route already uses env)
- [ ] No pagination in insights/tags — may be slow at scale
- [ ] Experiment minimum threshold (3 days) not shown in UI
- [ ] No experiment state validation in API (can skip states)
- [ ] No dark mode / theme support
- [ ] Workout template exercises stored as JSON string (should be relational)
- [ ] VO2 Max + advanced running metrics not populated in DB — needs HAE app config change (enable metrics + tracked outdoor run) then update placeholder case names in `healthkit-sync/route.ts`
- [ ] Coach context cache is process-global (not per-user) — fine for single-user dev, would break on multi-user

---

## Next Up

- **Hyrox race-prep module** — see `hyrox-module-spec.md` (to be written). Highest priority given active goal 54 days out (race date: 2026-06-03).
- **Apple Watch metric discovery** — unblock VO2/running metrics for the coach by enabling in HAE + updating placeholder case names after next outdoor run.
