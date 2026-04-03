# Baseline — Task Tracker

**Last Updated:** 2026-04-03 (reviewed — no code changes since Phase 1 commit; 6 bugs still open)

---

## Phase 1 — MVP

*Stack: Next.js 15, React, Prisma (SQLite), Tailwind CSS, Recharts*

### Project Setup

- [x] Initialize Git repo and project structure
- [x] Set up Next.js project with TypeScript + Tailwind
- [x] Configure Prisma ORM with SQLite
- [x] Define database schema: OuraToken, DailyReadiness, DailySleep, DailyStress, HeartRateSample, CyclePhaseLog, SyncLog
- [x] Set up environment variable management (.env, .env.example)
- [x] Configure .gitignore (node_modules, .env, prisma/dev.db)

### Oura Integration

- [x] Register app on Oura developer portal
- [x] Implement OAuth2 authorization flow (redirect → callback → token exchange)
- [x] Build token storage with Prisma upsert pattern
- [x] Implement auto-refresh logic (5-min pre-expiry check)
- [x] Build Oura API client module (`src/lib/oura.ts`)
- [x] Create sync endpoint: pull readiness, sleep, stress, heart rate
- [x] Implement sync logging (SyncLog model)
- [ ] **BUG:** Fix token refresh on 401 — currently re-calls `getValidToken()` which may return same expired token. Need forced refresh path.
- [ ] Add retry logic with exponential backoff for rate limits (429)
- [ ] Add fetch timeout (30s) to prevent hanging syncs
- [ ] Add pagination handling for `next_token` in API responses (needed for 90-day backfill)
- [ ] Implement 90-day backfill command on first run
- [ ] Add resilience and VO2 max endpoint sync
- [ ] Test: verify synced data matches Oura app for a given date range

### Data Models & Storage

- [x] Prisma schema with models for biometrics, tokens, cycle phases, sync logs
- [x] Upsert pattern for deduplication across all endpoints
- [ ] Add `updatedAt`, `source`, `syncedAt` fields to biometric models
- [ ] Add `userId` field to all models (prep for future multi-user)
- [ ] Migrate from SQLite to PostgreSQL (before deploying or scaling)
- [ ] Create exercise library table (movement pattern + muscle group tags)
- [ ] Create workout session and sets tables
- [ ] Seed initial exercise library (compound + accessory movements)
- [ ] Write CRUD API endpoints for exercises, workouts, sets

### Baseline Score

- [x] Implement composite score calculation (readiness 40%, HRV 25%, sleep 20%, temp 15%)
- [x] Color-coded feedback (green/yellow/red thresholds)
- [x] HRV trend scoring (3-day vs 14-day rolling average)
- [ ] **BUG:** Null components treated as 0 instead of excluded — needs weight redistribution when data is missing
- [ ] **BUG:** Temperature deviation scoring penalizes luteal phase unfairly — needs cycle-phase-aware adjustment
- [ ] Soften HRV trend formula (current 200x multiplier causes 40-point swings from noise)
- [ ] Add confidence indicator (low/medium/high based on data point count)

### Body Mode — Workout Logger

- [ ] Build workout session creation flow (select exercises → log sets)
- [ ] Implement progressive overload tracking (volume calc, estimated 1RM)
- [ ] Build set logging UI: quick-entry for reps × weight
- [ ] Display previous session's numbers per exercise (target to beat)
- [ ] Calculate and display session volume
- [ ] Build exercise search/filter (by muscle group, movement pattern)
- [ ] Add workout templates (save and reuse groupings)
- [ ] Build workout history view

### Readiness-Based Training Recommendations

- [x] Build readiness score display on daily dashboard
- [x] Display training recommendation based on readiness tier
- [x] Cross-reference readiness with current cycle phase
- [ ] Implement full intensity tier logic (85+ / 70–84 / 55–69 / <55) with distinct UI states
- [ ] Add manual override option (user can train harder/lighter)
- [ ] Show readiness trend (last 7 days) on dashboard

### Cycle Phase Tracking (Manual V1)

- [x] Build cycle phase selector UI (4 phases with color coding)
- [x] Store daily phase log with date + phase (upsert by day)
- [x] Display current phase on dashboard with training context notes
- [ ] **BUG:** No error handling on save — optimistic update doesn't revert on failure
- [ ] Add loading indicator during save
- [ ] Build phase history timeline view
- [ ] Pre-populate phase durations from typical ranges, allow user customization

### Dashboard

- [x] Build daily dashboard: readiness score, sleep, stress, cycle phase
- [x] Baseline Score card with component breakdown
- [x] Sync button with status display
- [x] Recharts trend visualization
- [x] Responsive grid layout
- [x] Conditional rendering: "Connect Oura" CTA vs data view
- [ ] **BUG:** Timezone/date handling inconsistent — can show wrong day's data depending on user timezone. Standardize on UTC ISO strings.
- [ ] Fix sync button to use SWR/revalidation instead of hard page reload
- [ ] Show date (not just time) on last sync display
- [ ] Add skeleton loaders to prevent layout shift
- [ ] Show "yesterday's performance vs readiness" context
- [ ] Add quick-start workout button

### Infrastructure & DevOps

- [x] Environment variable management
- [x] .gitignore configured
- [ ] Write Dockerfile and docker-compose.yml
- [ ] Add structured logging (replace console.error)
- [ ] Write health check endpoint
- [ ] Create seed script for demo/test data
- [ ] Set up error tracking (Sentry)
- [ ] Write integration tests for OAuth flow
- [ ] Set up CI pipeline (GitHub Actions: lint, test, build)

### Critical Bugs — Fix Before Next Phase

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | CRITICAL | `src/lib/oura.ts` | 401 retry re-calls `getValidToken()` which may return same expired token |
| 2 | HIGH | `src/lib/sync.ts` | All endpoint sync errors swallowed silently; SyncLog always says "success" |
| 3 | HIGH | `src/app/page.tsx` | UTC date construction can fetch wrong day's data in non-UTC timezones |
| 4 | MEDIUM | `src/lib/baseline-score.ts` | Null components scored as 0 instead of excluded from weighted average |
| 5 | MEDIUM | `src/lib/baseline-score.ts` | Temp deviation scoring penalizes normal luteal phase elevation |
| 6 | MEDIUM | `src/components/dashboard/cycle-phase-selector.tsx` | Optimistic update doesn't revert on API failure |

---

## Phase 2a — Mind Mode (Differentiator)

*Ships before Body Mode — see `build-sequence-rationale.md` and `phase-2-spec.md`*

### Prerequisites — Phase 1 Bug Fixes

- [ ] Fix forced token refresh on 401 (`src/lib/oura.ts`)
- [ ] Fix sync error tracking — partial/failed status in SyncLog (`src/lib/sync.ts`)
- [ ] Fix timezone/date handling — standardize on UTC ISO strings across codebase
- [ ] Fix null component scoring in Baseline Score (`src/lib/baseline-score.ts`)
- [ ] Fix temp deviation to be cycle-phase-aware (`src/lib/baseline-score.ts`)
- [ ] Fix cycle selector optimistic update revert on failure

### Data Models (Prisma)

- [ ] Add `Experiment` model (id, title, hypothesis, independentVariable, dependentVariable, dependentMetric, startDate, endDate, minDays, status, createdAt)
- [ ] Add `ExperimentLog` model (id, experimentId, date, independentValue, notes, createdAt) with FK to Experiment
- [ ] Add `ActivityTag` model (id, tag, category, timestamp, metadata JSON, experimentId nullable)
- [ ] Add `EnvReading` model (id, timestamp, pm25, temperature, humidity, noiseDb, lux, deviceId)
- [ ] Run Prisma migration
- [ ] Add API routes: CRUD for experiments, logs, tags

### Experiment Framework

- [ ] Build experiment creation UI (hypothesis, IV, DV, metric selection, duration)
- [ ] Build experiment list/dashboard view (active, completed, draft)
- [ ] Build daily logging UI for active experiments (value input + notes)
- [ ] Implement experiment lifecycle (draft → active → completed → analyzed)
- [ ] Seed 5 starter experiment templates (lo-fi/sleep, breathing/RHR, sunlight/HRV, pre-workout/RPE, caffeine/sleep)
- [ ] Build individual experiment detail view with log history

### Tagging System

- [ ] Build quick-tag UI with preset buttons (music, breathing, caffeine, alcohol, meditation, exercise, social, study)
- [ ] Implement custom tag creation
- [ ] Timestamp all tags with ISO datetime
- [ ] Link tags to active experiments (optional association)
- [ ] Build tag history/timeline view
- [ ] API endpoints: create tag, list tags by date range, delete tag

### Correlation Engine

- [ ] Build biometric data retrieval for experiment date ranges (pull from DailyReadiness, DailySleep, DailyStress, HeartRateSample)
- [ ] Implement Pearson correlation between IV values and DV biometric
- [ ] Implement A/B group comparison (tagged days vs control days) with Welch's t-test
- [ ] Calculate p-value and effect size (Cohen's d)
- [ ] Set minimum data threshold (14 days per condition) before showing results
- [ ] Build insight surfacing: natural language summary of findings
- [ ] Build experiment results visualization (A vs B bar chart, trend overlay, confidence intervals)

### Environment Sensor Integration

- [ ] Build HTTP POST endpoint for sensor data ingestion (`/api/env-readings`)
- [ ] Validate and store EnvReading records
- [ ] Build env data dashboard (current room conditions, 24h trends)
- [ ] Correlate env readings with next-night sleep quality
- [ ] Surface env insights ("PM2.5 above 25 μg/m³ correlates with 15% lower deep sleep")

### Mind Mode Dashboard

- [ ] Active experiments summary card
- [ ] Recent tags timeline
- [ ] Top insights from completed experiments
- [ ] "Start new experiment" CTA with templates
- [ ] Environment conditions card (when sensor connected)

---

## Phase 2b — Body Mode (Workout Logger)

*Built on Mind Mode's tagging and correlation infrastructure*
*Scientific foundation: `body-mode-research.md` (27 peer-reviewed citations)*

### Research (Complete)

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

### Workout Logger

- [ ] Create exercise library table (name, muscle group, movement pattern, equipment)
- [ ] Create workout session and sets tables
- [ ] Seed initial exercise library (compound + accessory movements)
- [ ] Build workout session creation flow (select exercises → log sets)
- [ ] Build set logging UI: quick-entry for reps × weight
- [ ] Implement progressive overload tracking (volume calc, estimated 1RM)
- [ ] Display previous session's numbers per exercise (target to beat)
- [ ] Build workout history view
- [ ] Add workout templates (save and reuse groupings)

### Training Intelligence

- [ ] Implement full intensity tier logic (85+ / 70–84 / 55–69 / <55) with distinct UI states
- [ ] Add manual override (train harder/lighter than recommended)
- [ ] Show readiness trend (last 7 days) on dashboard
- [ ] Correlate workout volume/intensity with next-day readiness (via correlation engine)

### Integrations

- [ ] Apple HealthKit integration (HR zones, workouts, menstrual data)
- [ ] Auto cycle phase detection (Oura temp proxy — algorithm in `cycle-phase-logic.md`)

---

## Phase 2c — Hardware Integrations

- [ ] Arduino IMU: bar velocity tracking + VBT auto-regulation
- [ ] Hyrox race-prep module (intervals, sled, wall balls)

---

## Phase 3 — Scale

### Environment Sensor Hardware

- [x] Order parts: ESP32 Dev Board, BME280, PMS5003, MAX4466 (Amazon, ~$65 total)
- [ ] Order breadboard, jumper wires, resistor kit (~$18)
- [ ] Build sensor firmware (Arduino C++ or MicroPython)
- [ ] Wire voltage divider for PMS5003 (5V→3.3V on ESP32 RX)
- [ ] WiFi data push to Baseline HTTP endpoint
- [ ] Build enclosure (3D printed or project box)

### Scale

- [ ] Multi-user support (add userId FK across all models)
- [ ] Mobile app (React Native or Swift)
- [ ] Data export / portability
- [ ] Public API for third-party integrations
