# Baseline — Session Log

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
