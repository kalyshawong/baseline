# Baseline — Session Log

---

## Session: 2026-04-09 (continued) — Dashboard Reorganization + Body Mode Expansion

### What was done

**Dashboard Cleanup:**
- Removed VO2 Max card from dashboard (training metric → Body mode only)
- Removed WeightTrendChart from dashboard (full trend → Body mode only)
- Removed WeightGoalSettings from dashboard (profile settings → Body mode only)
- Dashboard retains: 6 MetricCards (Readiness, Sleep, HRV, Stress, SpO2, Resilience), Bedtime recommendation, Sessions, compact weight (WeightCard + WeightInput), TDEE Card, Sleep Breakdown

**New Component:**
- Created `src/components/body/running-metrics-card.tsx` — 9-metric grid using MetricCard for all Apple Watch running data + VO2 Max, with empty state when no data

**Body Mode Expansion (5 sections):**
1. Composition & Energy: WeightCard + WeightInput + WeightTrendChart + WeightGoalSettings + TdeeCard
2. Training Readiness: ReadinessTierCard + CyclePhaseGuidance + Fatigue Signal (existing)
3. Running & Cardio (NEW): RunningMetricsCard with all 10 Apple Watch metrics + VO2 Max
4. Strength Training: VolumeZones + Recent PRs + Recent Workouts (existing)
5. Recovery (NEW): Sleep Breakdown + Bedtime Recommendation + NutritionCheck + TrendsCharts

**Coach Context Update:**
- Added `dailyRunningMetrics` query to `Promise.allSettled` in `coach-context.ts`
- Added "Running & Cardio (Apple Watch)" section to context string with all 9 running fields

**Documentation:**
- Updated `docs/task-tracker.md` with Apple Watch Training Metrics section
- Updated `docs/session-log.md` with this entry

### Files created
- `src/components/body/running-metrics-card.tsx`

### Files modified
- `src/app/page.tsx` — removed VO2 Max card, WeightTrendChart, WeightGoalSettings
- `src/app/body/page.tsx` — full rewrite with 5 sections, added running/sleep/bedtime queries
- `src/lib/coach-context.ts` — added running metrics query + context section
- `docs/task-tracker.md`
- `docs/session-log.md`

### Verification
- `npx tsc --noEmit` passes clean with 0 errors

### Next priorities
1. Re-authenticate Oura at `/api/auth/oura` for tag + stress scopes
2. Do a tracked outdoor run with Apple Watch to discover remaining metric names
3. Update placeholder metric names in healthkit-sync once discovered
4. Commit and push all changes to GitHub

---

## Session: 2026-04-09 — Oura Sync Expansion + Health Auto Export Debugging

### What was done

**Oura Sync Expansion Spec:**
- Wrote `docs/oura-sync-expansion-spec.md` (~700 lines) covering 8 new Oura API V2 endpoints: SpO2, Enhanced Tags, Workouts, Sessions, Sleep Time, Resilience, VO2 Max, Personal Info
- Includes Prisma models, TAG_MAP for Enhanced Tags → ActivityTag mapping, Coach context enrichment, implementation prompt
- Updated `docs/task-tracker.md` with Oura Sync Expansion section

**Implementation (done in Claude Code session):**
- All 7 new sync functions added to `src/lib/sync.ts`
- 6 new Prisma models created and migrated
- OAuth scopes updated to include `tag` and `stress`
- Sync button updated to show all 12 endpoint counts

**Health Auto Export Debugging:**
- Fixed 401 errors: user had auth header set to "baseline" instead of "Bearer baseline" on some automations
- Discovered metric names via console.log debugging: `weight_body_mass`, `body_fat_percentage`, `body_mass_index`
- Fixed weight conversion bug: Health Auto Export sends weight in lbs, code was storing as kg (275.1 lb displayed instead of 124.8 lb)
- Confirmed BMI is silently dropped (not needed — Baseline calculates from weight/height)

**Oura Scope Issues Diagnosed:**
- Enhanced Tags returning 401: token missing `tag` scope
- Resilience returning 401: token missing `stress` scope
- VO2 Max returning 404: endpoint may not exist for user's ring model/subscription
- Fixed by adding `tag` and `stress` to OAuth scope string in both auth routes
- User needs to re-authenticate at `/api/auth/oura` to get new scopes

**Dashboard Spec:**
- Wrote `docs/oura-dashboard-spec.md` — frontend spec for displaying new Oura data
- Covers: SpO2 + Resilience MetricCards, VO2 Max card, Bedtime Recommendation card, Sessions section, Sync Button update
- Includes ASCII layout diagram, implementation prompt, testing checklist

### Issues found
- Git lock file (`.git/index.lock`) still can't be removed from sandbox — user must run git commands locally
- VO2 Max endpoint may not be available for all Oura ring models/subscriptions

### Files created/modified
- `docs/oura-sync-expansion-spec.md` (created)
- `docs/oura-dashboard-spec.md` (created)
- `docs/task-tracker.md` (updated — added Oura Sync Expansion section)
- `docs/session-log.md` (updated — this entry)
- `src/app/api/auth/oura/route.ts` (modified — added tag, stress scopes)
- `src/app/api/auth/oura/callback/route.ts` (modified — added tag, stress scopes)
- `src/app/api/healthkit-sync/route.ts` (modified — weight conversion fix, debug logging)
- `src/lib/sync.ts` (modified — scope error handling improvements)
- `src/components/dashboard/sync-button.tsx` (modified — shows all 12 sync counts)

### Next priorities
1. Re-authenticate Oura at `/api/auth/oura` to grant tag + stress scopes
2. Implement dashboard cards from `docs/oura-dashboard-spec.md`
3. 17 medium/low bugs still open in `docs/bugs.md`
4. Auto cycle phase detection
5. Arduino environment sensor build

---

## Session: 2026-04-08 — HealthKit Integration + Apple Watch Setup

### What was done
- Wrote `docs/healthkit-sync-spec.md` (~600 lines) for Health Auto Export integration
- User purchased Health Auto Export annual plan ($6.99/year)
- Walked user through app setup: automations, URL, auth headers, data types
- Fixed `.env` typo: `HEALTHKIT_SYNC_K EY` → `HEALTHKIT_SYNC_KEY`
- HealthKit sync endpoint built and working (60K+ metrics syncing)
- 3 workouts synced successfully from Apple Watch
- Diagnosed data source overlap: Oura → Apple Health → Health Auto Export creates double counting risk
- Advised: only pull unique Apple Watch data (workout HR, weight from scale)
- Final setup: Health Metrics automation (weight only) + Workouts automation
- Researched all 15 Oura API V2 endpoints, identified 10 not being synced

---

## Session: 2026-04-06 — Comprehensive Code Audit & Documentation Update

### What was reviewed

Full codebase review covering all changes since the Phase 2a (Mind Mode) review. This session discovered that the codebase had expanded significantly beyond what was previously reviewed — Body Mode, Coach, Goals, and Weight Tracking were all built between reviews.

### New files discovered (48 untracked)

**API routes (15 new):**
- `/api/coach/route.ts` + `/api/coach/sessions/[id]/route.ts`
- `/api/exercises/route.ts`
- `/api/goals/route.ts` + `/api/goals/[id]/route.ts`
- `/api/profile/route.ts`
- `/api/templates/route.ts` + `/api/templates/[id]/route.ts`
- `/api/weight/route.ts` + `/api/weight/[id]/route.ts`
- `/api/workouts/route.ts` + `/api/workouts/[id]/route.ts`
- `/api/workouts/[id]/sets/route.ts` + `/api/workouts/[id]/sets/[setId]/route.ts`
- `/api/workouts/rpe-suggestions/route.ts` + `/api/workouts/trends/route.ts`

**Pages (4 new):**
- `/body` (workout list + new workout flow + workout detail)
- `/coach` (Claude-powered coaching chat)
- `/goals` (goal management)

**Components (20+ new):**
- `body/`: cycle-phase-guidance-card, nutrition-check, readiness-tier-card, trends-charts, volume-zones, workout-logger
- `coach/`: chat-interface
- `dashboard/`: activity-card, calorie-balance-card
- `goals/`: goals-manager
- `weight/`: tdee-card, weight-card, weight-goal-settings, weight-input, weight-trend-chart
- Shared: date-nav, nav

**Libraries (6 new):**
- `src/lib/coach-context.ts` — 541-line context aggregator for Claude coach
- `src/lib/date-utils.ts` — Date utilities
- `src/lib/exercise-library.ts` — Exercise definitions
- `src/lib/tdee.ts` — TDEE estimation from weight + calorie data
- `src/lib/training.ts` — Training intelligence utilities (RPE creep, HRV CV, fatigue scoring)
- `prisma/seed-exercises.ts` — Exercise library seeder

**Schema additions:**
- Exercise, WorkoutSession, WorkoutSet, WorkoutTemplate, UserProfile, Goal, ChatSession, ChatMessage, WeightLog, DailyActivity

### Modified files (14)

- `prisma/schema.prisma` — Major expansion with 10+ new models
- `src/app/page.tsx` — Expanded dashboard with date nav, activity card, calorie balance
- `src/app/layout.tsx` — Added global navigation
- `src/app/mind/page.tsx` + `layout.tsx` — Mind mode refinements
- `src/lib/baseline-score.ts` — Function renamed to `getScoreForDate`, added date parameter
- `src/lib/sync.ts` — Modified sync logic
- `src/lib/usda.ts` — Nutrition estimation updates
- `src/components/dashboard/baseline-score-card.tsx` — UI updates
- `src/components/dashboard/sync-button.tsx` — UI updates
- `src/components/mind/nutrition-input.tsx` — UI updates
- `src/components/mind/quick-tag.tsx` — UI updates

### Build & type check results

- **TypeScript:** Clean — `npx tsc --noEmit` passed with 0 errors
- **Next.js build:** Timed out in sandbox (resource constraint, not code error)

### Bugs found

30 total bugs cataloged in `docs/bugs.md`:
- 7 CRITICAL (missing error handling across API routes, unmetered Claude API, JSON parsing safety)
- 6 HIGH (timezone issues, no client-side error feedback, missing input validation)
- 10 MEDIUM (no pagination, hardcoded values, state machine gaps)
- 7 LOW (no undo, no dark mode, JSON string storage for templates)

### Environment variables

No new environment variables added this session. Current set:
- `DATABASE_URL` — SQLite connection string
- `OURA_CLIENT_ID` — Oura OAuth2 client ID
- `OURA_CLIENT_SECRET` — Oura OAuth2 client secret
- `OURA_REDIRECT_URI` — OAuth2 callback URL
- `NEXT_PUBLIC_APP_URL` — App base URL
- `ANTHROPIC_API_KEY` — Claude API key (for nutrition estimation + coach)
- `SYNC_API_KEY` — API key for sync endpoint
- `SENSOR_API_KEY` — API key for environment sensor (commented out in .env.example)

### Next priorities

1. **Fix critical bugs** — Add try-catch to all 25 unprotected API routes (BUG-003), safe JSON parsing utility (BUG-005), Oura token refresh fix (BUG-001)
2. **Rate limit coach** — Add throttling + context caching to prevent Claude API cost runaway (BUG-004)
3. **Input validation** — Add validation to workout sets, weight, and training utilities (BUG-011, BUG-012, BUG-013)
4. **Complete training intelligence** — Wire up deload detection, HRV CV overreaching signal, volume zone alerts
5. **Arduino breadboard order** — Need breadboard, jumper wires, resistor kit (~$18) to start environment sensor build
6. **Start environment sensor firmware** — Arduino C++ for ESP32 + BME280 + PMS5003 + MAX4466

---

## Session: 2026-04-03 — Phase 2b Specification & Arduino Guide

### What was done
- Reviewed Mind Mode build, confirmed all features working
- Updated task-tracker.md with Phase 2a completion
- Wrote `docs/phase-3-spec.md` (724 lines) — Full Body Mode specification covering exercise models, workout logging, progressive overload with MEV/MAV/MRV, readiness adjustment, cycle-phase recommendations, nutrition integration, RPE autoregulation, cross-mode integration, and Arduino IMU velocity spec
- Wrote `docs/arduino-build-guide.md` (398 lines) — Hardware spec, wiring diagram, firmware architecture, BLE protocol, Web Bluetooth integration, mounting options

---

## Session: 2026-04-02 — Body Mode Research

### What was done
- Searched peer-reviewed literature on recovery science, progressive overload, nutrition & muscle growth, and cycle-phase training
- Wrote `docs/body-mode-research.md` (415 lines) with 27 peer-reviewed citations
- Research covers: HRV-guided training (Plews, Flatt), volume landmarks (Israetel, Schoenfeld), VBT (González-Badillo, Banyard), protein dosing (Morton, Moore), cycle-phase effects (McNulty, Hewett, Sung)

---

## Session: 2026-04-02 — Mind Mode Specification

### What was done
- Reviewed Phase 1 build, identified bugs 1–6
- Updated task-tracker.md
- Wrote `docs/phase-2-spec.md` (546 lines) — Full Mind Mode spec with data models, API routes, experiment lifecycle, 5 example experiments, tagging system, correlation engine (Welch's t-test), environment sensor spec

---

## Session: 2026-04-01 — Project Initialization

### What was done
- Created initial documentation structure (6 files)
- `docs/PRD.md` — Product requirements
- `docs/oura-api-research.md` — Oura API V2 reference
- `docs/cycle-phase-logic.md` — Cycle phase definitions and training logic
- `docs/task-tracker.md` — Phase 1 task tracker
- `docs/architecture.md` — System architecture
- `docs/competitive-analysis.md` — Competitive landscape
- `docs/build-sequence-rationale.md` — Why Mind Mode ships before Body Mode
- Helped order environment sensor parts (~$47: ESP32, BME280, PMS5003, MAX4466)
