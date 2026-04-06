# Baseline — Product Requirements Document

**Version:** 0.3
**Author:** Kalysha
**Last Updated:** 2026-04-06
**Status:** Phase 2b (Body Mode in progress)

---

## 1. Problem Statement

There is no single system that connects biometric data (sleep, HRV, readiness), menstrual cycle physiology, strength training programming, and cognitive self-experimentation into one coherent feedback loop.

Current tools are fragmented:

- **Oura** tracks sleep and readiness but offers no training guidance.
- **Strong / Hevy** track lifts but ignore recovery signals.
- **Clue / Flo** track cycles but don't connect to performance.
- **Whoop** provides strain scores but locks data behind a subscription with no real programmability.
- **Exist.io / Gyroscope** attempt correlation but lack structured experimentation and training logic.

Athletes and self-optimizers — especially women — are left manually stitching together spreadsheets, apps, and intuition. Baseline eliminates that gap.

---

## 2. Target Users

**Primary:** Kalysha (dogfooding user — strength athlete, Hyrox competitor, self-experimenter).

**Future personas:**

- Women who strength train and want cycle-aware programming
- Biohackers running structured self-experiments on cognition, sleep, and recovery
- Coaches who want readiness-adjusted training recommendations for clients
- Hyrox / hybrid athletes preparing for competition

---

## 3. Product Modes

### 3.1 Dashboard — Daily Overview (Complete)

The home screen. Shows today's biometric snapshot with the Baseline Score — a composite metric that tells you how ready you are to train.

**Features (shipped):**

- Baseline Score card with component breakdown (readiness 40%, HRV trend 25%, sleep quality 20%, temp deviation 15%)
- Color-coded readiness: green (Go Hard, 80+), yellow (Moderate, 60–79), red (Recover, <60)
- Null-component weight redistribution (missing data doesn't drag the score to 0)
- Cycle-phase-aware temperature scoring (luteal and ovulation offsets)
- Daily readiness, sleep, stress, and cycle phase display
- Activity card (steps, calories, active time by intensity)
- Calorie balance card (intake from nutrition logger vs burn from Oura)
- Date navigation (browse historical days)
- Oura sync button with status feedback
- Recharts trend visualization (7-day snapshots)

### 3.2 Mind Mode — Cognitive Self-Experimentation (Complete)

A structured framework for running personal A/B tests that correlate tagged behaviors with biometric outcomes.

**Features (shipped):**

- Experiment builder with 5 pre-seeded templates (lo-fi/sleep, breathing/HR, sunlight/HRV, caffeine/sleep, meditation/readiness)
- Experiment lifecycle: draft → active → completed → analyzed
- Daily logging with treatment/control toggle + optional intensity + notes
- Activity tagging with 8 preset categories + custom tags
- Correlation engine: Welch's t-test, Cohen's d effect size, 95% confidence intervals, lag day support
- Passive insights: auto-correlates tags with biometric outcomes (90-day rolling, p < 0.15 filter)
- Nutrition logger: Claude-powered natural language macro estimation with per-food breakdown
- Environment sensor endpoint (HTTP POST with Bearer auth) + EnvCard display
- Full Mind Mode dashboard at `/mind`

### 3.3 Body Mode — Strength Training Companion (In Progress)

The training interface. Body Mode combines workout logging with readiness-adjusted recommendations and progressive overload tracking.

**Features (shipped):**

- Exercise library with muscle group, movement pattern, equipment classification
- Workout session logging with set-by-set entry (reps × weight × RPE)
- Workout templates (save and reuse workout structures)
- Progressive overload tracking: volume load trends, estimated 1RM (Epley formula)
- Readiness tier card with training intensity recommendations
- Cycle phase guidance card with phase-specific training advice
- RPE suggestions API
- Workout history and detail views
- Trends charts (volume over time per exercise)
- Training intelligence utilities: RPE creep detection, HRV CV calculation, composite fatigue scoring

**Features (not yet shipped):**

- HRV CV as overreaching signal (UI not connected)
- Deload recommendation engine (logic exists, no UI trigger)
- ACL injury risk flag during ovulation (Hewett: 3–6× higher)
- Volume zone display (MEV/MAV/MRV per muscle group)
- Weekly sets per muscle group tracking
- Energy availability warning (<30 kcal/kg FFM)
- Per-meal protein flag (>30g threshold)

### 3.4 Coach — AI-Powered Coaching Chat (Complete, unplanned)

A conversational AI coach that has full context of the user's biometric data, training history, nutrition, experiments, and goals.

**Features (shipped):**

- Claude-powered chat at `/coach`
- Rich context aggregation (541-line context builder pulling from all data sources)
- Chat session persistence with history
- Session management (create new, resume existing)

### 3.5 Goals — Goal Tracking (Complete, unplanned)

Simple goal management with typed goals and status tracking.

**Features (shipped):**

- Goal CRUD at `/goals`
- Goal types: weight, race, exam, performance, habit, custom
- Status tracking: active, completed, abandoned
- Deadline support

### 3.6 Weight Tracking — Body Composition (Complete, unplanned)

Daily weight logging with TDEE estimation and trend visualization.

**Features (shipped):**

- Weight log with optional body fat % and muscle mass
- Weight trend chart (Recharts)
- TDEE estimation from weight + calorie data over time
- Weight goal settings

### 3.7 Cycle Tracking — Cross-Cutting Overlay (Complete)

Menstrual cycle phase data overlaid on both Body and Mind modes. Cycle phase is a first-class data dimension.

**V1 — Manual logging (shipped):**

- 4-phase selector: Menstrual → Follicular → Ovulation → Luteal
- Phase-specific training recommendations
- Baseline Score temperature adjustment per phase
- Phase history stored for pattern detection

**V2 — Auto-sync (planned):**

- Pull menstrual data from Apple HealthKit
- Use Oura body temperature deviation as proxy signal for phase detection

---

## 4. Data Sources

### 4.1 Oura Ring API V2 (Active)

| Endpoint | Key Fields | Usage |
|---|---|---|
| `daily_readiness` | Score, temperature deviation, HRV balance, recovery index | Training intensity adjustment |
| `daily_sleep` | Total sleep, REM/deep/light duration, efficiency, latency, HRV, HR | Recovery context |
| `daily_activity` | Active calories, steps, movement index | Activity baseline |
| `heartrate` | BPM, source (rest/sleep/workout) | HRV trends, resting HR |
| `daily_stress` | Stress level, recovery periods | Mental load tracking |

**Auth:** OAuth2. See `oura-api-research.md`.
**Rate limit:** 5000 requests per 5-minute window.

### 4.2 Anthropic Claude API (Active)

- **Nutrition parsing:** Natural language → structured macro estimates (calories, protein, carbs, fat per food item)
- **Coaching chat:** Full-context conversational coaching with access to all user data
- **Model:** Hardcoded (should be env variable — BUG-018)

### 4.3 ESP32 Environment Sensor (Endpoint ready, hardware pending)

- **PM2.5** — Air quality (PMS5003)
- **Temperature + Humidity** — Room climate (BME280)
- **Noise level (dB)** — Sleep/focus disruption (MAX4466)
- **Light level (lux)** — Circadian alignment (future sensor)
- Parts ordered (~$47). Need breadboard + wires (~$18).

### 4.4 Arduino IMU — Bar Velocity (Not started)

- ESP32 + MPU6050 6-axis IMU mounted on barbell
- BLE GATT protocol for real-time velocity data
- See `arduino-build-guide.md` for full hardware + firmware spec

### 4.5 Apple HealthKit (Planned — Phase 3)

- Heart rate zones during workouts
- Workout summaries
- Menstrual cycle data
- Requires native iOS/macOS integration

---

## 5. Architecture Overview

See `architecture.md` for full details.

**Stack:** Next.js 15, React 19, TypeScript 5.8, Prisma (SQLite), Tailwind CSS 4, Recharts, jstat, @anthropic-ai/sdk

**Key architectural principles:**

- All data stored locally — user owns their data
- Full-stack monolith with clean module separation (lib/ for logic, api/ for routes, components/ for UI)
- Time-series-first schema — every data point has a timestamp
- AI-augmented, not AI-dependent — core features work without Claude API

---

## 6. Success Metrics

### Phase 1 (MVP) — Complete

| Metric | Target | Status |
|---|---|---|
| Daily Oura data sync reliability | 99%+ uptime | Working (bugs in error reporting) |
| Training recommendation accuracy | Subjective alignment with perceived readiness | Working |
| Daily usage | Used every training day for 30 consecutive days | In progress |

### Phase 2 — In Progress

| Metric | Target | Status |
|---|---|---|
| Mind Mode experiment completion rate | > 80% of started experiments run to conclusion | Feature complete |
| Workout logging friction | < 30 seconds to log a set | Feature complete |
| Correlation engine statistical validity | p < 0.05 for surfaced insights | Feature complete |
| Coach response relevance | Contextually accurate coaching advice | Feature complete |

### Phase 3+ — Future

| Metric | Target |
|---|---|
| Cycle phase prediction accuracy (temp proxy) | Within 2 days of actual phase transition |
| Environment sensor uptime | 95%+ continuous logging |
| User retention (if opened to others) | 60% weekly active at 30 days |

---

## 7. Roadmap

### Phase 1 — MVP (Complete)

- [x] Oura OAuth2 integration and daily data sync
- [x] Baseline Score calculation with cycle-phase awareness
- [x] Manual cycle phase logging with training adjustments
- [x] Dashboard with trend visualization

### Phase 2a — Mind Mode (Complete)

- [x] Experiment builder with templates
- [x] Activity tagging system
- [x] Welch's t-test correlation engine
- [x] Passive insights generation
- [x] Nutrition logger with Claude-powered macro estimation
- [x] Environment sensor data endpoint

### Phase 2b — Body Mode (In Progress)

- [x] Exercise library and workout logging
- [x] Progressive overload tracking (volume load, e1RM)
- [x] Readiness-adjusted training recommendations
- [x] Workout templates
- [x] Coach chat with full-context AI
- [x] Goals and weight tracking
- [ ] Volume zone alerts (MEV/MAV/MRV)
- [ ] Deload detection UI
- [ ] **Critical bug fixes (30 bugs cataloged — see bugs.md)**

### Phase 2c — Arduino IMU (Not Started)

- [ ] BLE velocity tracking hardware build
- [ ] Real-time velocity display during sets
- [ ] Velocity-load profiling and 1RM estimation

### Phase 3 — Scale

- [ ] Environment sensor hardware build
- [ ] Apple HealthKit integration
- [ ] Auto cycle phase detection
- [ ] Multi-user support (PostgreSQL migration)
- [ ] Mobile app
- [ ] Data export and public API

---

## Appendix: Related Documents

- [`architecture.md`](./architecture.md) — System architecture and technical design
- [`task-tracker.md`](./task-tracker.md) — Implementation task tracking
- [`bugs.md`](./bugs.md) — Bug audit (30 issues cataloged)
- [`session-log.md`](./session-log.md) — Development session history
- [`phase-2-spec.md`](./phase-2-spec.md) — Mind Mode specification
- [`phase-3-spec.md`](./phase-3-spec.md) — Body Mode specification
- [`body-mode-research.md`](./body-mode-research.md) — Scientific foundation (27 citations)
- [`arduino-build-guide.md`](./arduino-build-guide.md) — IMU hardware + firmware spec
- [`oura-api-research.md`](./oura-api-research.md) — Oura API V2 endpoint documentation
- [`cycle-phase-logic.md`](./cycle-phase-logic.md) — Cycle phase definitions and training logic
- [`competitive-analysis.md`](./competitive-analysis.md) — Competitive landscape
- [`build-sequence-rationale.md`](./build-sequence-rationale.md) — Why Mind Mode shipped before Body Mode
