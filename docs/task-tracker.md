# Baseline — Task Tracker

**Last Updated:** 2026-04-02

---

## Phase 1 — MVP

### Project Setup

- [ ] Initialize Git repo and project structure
- [ ] Set up Python environment (pyproject.toml, virtual env)
- [ ] Set up FastAPI project scaffold with folder structure
- [ ] Set up PostgreSQL with TimescaleDB extension (Docker Compose)
- [ ] Define database schema: users, workouts, exercises, sets, biometric_data, cycle_phases
- [ ] Create Alembic migrations for initial schema
- [ ] Set up React frontend with Vite
- [ ] Configure Docker Compose for full local dev stack (API + DB + frontend)

### Oura Integration

- [ ] Register app on Oura developer portal
- [ ] Implement OAuth2 authorization flow (redirect → callback → token exchange)
- [ ] Build token storage with encrypted refresh token persistence
- [ ] Implement auto-refresh logic for expired access tokens
- [ ] Build Oura API client module with methods for each endpoint
- [ ] Create daily sync job: pull readiness, sleep, activity, stress, resilience, HR
- [ ] Implement backfill command (last 90 days on first run)
- [ ] Add error handling: retries, 429 backoff, graceful degradation
- [ ] Write sync status logging and monitoring
- [ ] Test: verify data matches Oura app for a given date range

### Data Models & Storage

- [ ] Design time-series schema for biometric data (TimescaleDB hypertables)
- [ ] Create exercise library table with movement pattern + muscle group tags
- [ ] Create workout session table (date, duration, readiness_score, cycle_phase)
- [ ] Create sets table (exercise_id, reps, weight, RPE, notes)
- [ ] Create cycle_phase_log table (date, phase, source: manual/auto, confidence)
- [ ] Seed initial exercise library (common compound + accessory movements)
- [ ] Write API endpoints: CRUD for exercises, workouts, sets

### Body Mode — Workout Logger

- [ ] Build workout session creation flow (select exercises → log sets)
- [ ] Implement progressive overload tracking (volume calculation, estimated 1RM)
- [ ] Build set logging UI: quick-entry for reps × weight, with +/- buttons
- [ ] Display previous session's numbers for each exercise (target to beat)
- [ ] Calculate and display session volume (total sets × reps × weight)
- [ ] Build exercise search/filter (by muscle group, movement pattern, recent)
- [ ] Add workout templates (save and reuse exercise groupings)
- [ ] Build workout history view (list of past sessions with summary stats)

### Readiness-Based Training Recommendations

- [ ] Build readiness score display on daily dashboard
- [ ] Implement intensity tier logic (85+ / 70–84 / 55–69 / <55)
- [ ] Display training recommendation based on today's readiness
- [ ] Cross-reference readiness with current cycle phase for combined recommendation
- [ ] Add manual override option (user can choose to train harder/lighter)
- [ ] Show readiness trend (last 7 days) on dashboard

### Cycle Phase Tracking (Manual V1)

- [ ] Build cycle phase selector UI (4 phases)
- [ ] Store daily phase log with date and phase
- [ ] Display current phase on dashboard with training context
- [ ] Show phase-specific training adjustments (from cycle-phase-logic.md)
- [ ] Build phase history timeline view
- [ ] Pre-populate phase durations from typical ranges, allow user customization

### Dashboard

- [ ] Build daily dashboard: today's readiness score, sleep score, current cycle phase
- [ ] Show today's training recommendation (combined readiness + cycle)
- [ ] Display last workout summary (exercises, volume, date)
- [ ] Show 7-day readiness trend chart
- [ ] Show 7-day HRV trend chart
- [ ] Add quick-start workout button

### Infrastructure & DevOps

- [ ] Write Docker Compose file (API, DB, frontend, maybe nginx)
- [ ] Set up environment variable management (.env, secrets)
- [ ] Add basic logging (structured JSON logs)
- [ ] Write a health check endpoint
- [ ] Create seed script for demo/test data
- [ ] Write basic API tests (pytest)
- [ ] Set up CI pipeline (GitHub Actions: lint, test, build)

---

## Phase 2 — Intelligence Layer (Planned)

- [ ] Mind Mode: experiment builder
- [ ] Mind Mode: activity tagging system
- [ ] Mind Mode: correlation engine
- [ ] Apple HealthKit integration
- [ ] Auto cycle phase detection (Oura temp proxy)
- [ ] Arduino IMU: bar velocity tracking
- [ ] Hyrox race-prep module

## Phase 3 — Environment + Scale (Planned)

- [ ] ESP32 environment sensor integration
- [ ] Environment ↔ sleep/recovery correlation
- [ ] Multi-user support
- [ ] Mobile app
- [ ] Data export / portability
