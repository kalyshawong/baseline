# Baseline — Product Requirements Document

**Version:** 0.1
**Author:** Kalysha
**Last Updated:** 2026-04-02
**Status:** Draft

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
- Hyrox / hybrid athletes preparing for competition (V2)

---

## 3. Product Modes

### 3.1 Body Mode — Strength Training Companion

The daily training interface. Body Mode pulls Oura readiness data and cycle phase to adjust training recommendations in real time.

**Core features:**

- **Progressive overload tracker:** Log sets × reps × weight per exercise. Track volume, estimated 1RM, and PR history.
- **Readiness-adjusted training:** Oura readiness score maps to training intensity tiers:
  - **85+:** Full send — PR attempts, heavy compounds, high volume
  - **70–84:** Standard training — programmed work, moderate intensity
  - **55–69:** Deload bias — reduce volume 20–30%, focus on technique
  - **Below 55:** Active recovery only — mobility, light cardio, stretching
- **Cycle-phase overlay:** Adjusts recommendations based on current menstrual cycle phase (see `cycle-phase-logic.md`).
- **Exercise library:** User-defined exercises with muscle group tags, movement pattern classification (push/pull/hinge/squat/carry), and equipment requirements.
- **Session history:** Full workout log with volume metrics, duration, and associated readiness/cycle context.

**V2 additions:**

- Hyrox race-prep module (running/rowing intervals, sled work, wall balls)
- Bar velocity tracking via Arduino IMU sensor
- Auto-regulation: real-time velocity feedback adjusts prescribed weight

### 3.2 Mind Mode — Cognitive Self-Experimentation

A structured framework for running personal A/B tests that correlate tagged behaviors with biometric outcomes.

**Core features:**

- **Experiment builder:** Define hypothesis, independent variable (tagged activity), dependent variable (biometric metric), duration, and control conditions.
  - Example: *"Does 20 min lo-fi music before studying improve next-day HRV?"*
- **Activity tagging:** Quick-tag system for logging activities, supplements, habits, and environmental factors throughout the day.
- **Correlation engine:** After sufficient data points (minimum 14 days per condition), compute statistical correlation between tagged activities and biometric outcomes.
- **Experiment dashboard:** Visualize A vs B conditions with confidence intervals, effect size, and recommended next steps.

**V2 additions:**

- Suggested experiments based on detected patterns in existing data
- Multi-variable experiment support
- Integration with environment sensor data as variables

### 3.3 Cycle Tracking — Cross-Cutting Overlay

Menstrual cycle phase data overlaid on both Body and Mind modes. Cycle phase is a first-class data dimension, not an afterthought.

**V1 — Manual logging:**

- User selects current phase: Menstrual → Follicular → Ovulation → Luteal
- System adjusts training recommendations and provides phase-specific context
- Phase history stored for pattern detection

**V2 — Auto-sync:**

- Pull menstrual data from Apple HealthKit (synced from Clue or other cycle apps)
- Use Oura body temperature deviation as a proxy signal for phase detection
- Combine manual + automated signals for higher-confidence phase estimation

---

## 4. Data Sources

### 4.1 Oura Ring API V2 (Phase 1)

| Endpoint | Key Fields | Usage |
|---|---|---|
| `daily_readiness` | Score, temperature deviation, HRV balance, recovery index | Training intensity adjustment |
| `daily_sleep` | Total sleep, REM/deep/light duration, efficiency, latency | Recovery context |
| `daily_activity` | Active calories, steps, movement index | Activity baseline |
| `heartrate` | BPM, source (rest/sleep/workout) | HRV trends, resting HR |
| `daily_stress` | Stress level, recovery periods | Mental load tracking |
| `daily_resilience` | Resilience level, sleep/HRV/daytime contributors | Longitudinal fitness |
| `vo2_max` | VO2 max estimate | Aerobic capacity trend |

**Auth:** OAuth2 with PKCE. See `oura-api-research.md` for details.
**Rate limit:** 5000 requests per 5-minute window.

### 4.2 Apple HealthKit (Phase 2)

- Heart rate zones during workouts
- Workout summaries (type, duration, calories)
- Menstrual cycle data (period start, flow, symptoms)
- Requires native iOS/macOS integration via HealthKit framework

### 4.3 Arduino IMU Sensor (Phase 2)

- 6-axis IMU (accelerometer + gyroscope) mounted on barbell
- BLE communication to phone/laptop
- Captures: peak velocity, mean velocity, acceleration curve per rep
- Used for velocity-based training (VBT) auto-regulation

### 4.4 Environment Sensor — Arduino ESP32 (Phase 3)

- **PM2.5** — Air quality
- **Temperature + Humidity** — Room climate
- **Noise level (dB)** — Sleep/focus disruption
- **Light level (lux)** — Circadian alignment
- Logs to local DB via WiFi, correlated with sleep/recovery data

---

## 5. Architecture Overview

See `architecture.md` for full details.

**High-level stack:**

- **Frontend:** React (web-first, mobile V2)
- **Backend:** Python (FastAPI)
- **Database:** PostgreSQL with TimescaleDB extension for time-series biometric data
- **Auth:** OAuth2 flow for Oura; session-based auth for user accounts
- **Data pipeline:** Scheduled sync jobs pulling Oura data daily; real-time logging for workouts and tags
- **Hosting:** Self-hosted initially (Docker Compose on home server or VPS), cloud option later

**Key architectural principles:**

- All biometric data stored locally first — user owns their data
- Modular data source adapters — easy to add new integrations
- Time-series-first schema — every data point has a timestamp and source tag
- Separation of data ingestion, processing, and presentation layers

---

## 6. Success Metrics

### Phase 1 (MVP) — Dogfooding

| Metric | Target |
|---|---|
| Daily Oura data sync reliability | 99%+ uptime |
| Workout logging friction | < 30 seconds to log a set |
| Training recommendation accuracy | Subjective alignment with perceived readiness |
| Daily usage | Kalysha uses it every training day for 30 consecutive days |

### Phase 2 — Feature Completeness

| Metric | Target |
|---|---|
| Mind Mode experiment completion rate | > 80% of started experiments run to conclusion |
| Cycle phase prediction accuracy (temp proxy) | Within 2 days of actual phase transition |
| HealthKit sync reliability | Seamless background sync |

### Phase 3+ — Scale Readiness

| Metric | Target |
|---|---|
| User retention (if opened to others) | 60% weekly active at 30 days |
| Data correlation statistical validity | p < 0.05 for surfaced insights |
| Environment sensor uptime | 95%+ continuous logging |

---

## 7. Roadmap

### Phase 1 — MVP (Current)

- Oura OAuth2 integration and daily data sync
- Workout logger with progressive overload tracking
- Readiness-based training intensity recommendations
- Manual cycle phase logging with training adjustments
- Basic dashboard: today's readiness, last workout, current cycle phase
- Local-first data storage (PostgreSQL)

### Phase 2 — Intelligence Layer

- Mind Mode: experiment builder, activity tagging, correlation engine
- Apple HealthKit integration (HR zones, workouts, menstrual data)
- Auto cycle phase detection via Oura body temperature
- Arduino IMU: bar velocity tracking and VBT auto-regulation
- Hyrox race-prep training module
- Enhanced visualizations: trends, phase overlays, experiment results

### Phase 3 — Environment + Scale

- ESP32 environment sensor integration
- Room condition ↔ sleep/recovery correlation
- Multi-user support and coach view
- Mobile app (React Native or Swift)
- Export and data portability features
- Public API for third-party integrations

---

## Appendix: Related Documents

- [`oura-api-research.md`](./oura-api-research.md) — Oura API V2 endpoint documentation
- [`cycle-phase-logic.md`](./cycle-phase-logic.md) — Cycle phase definitions and training adjustment logic
- [`task-tracker.md`](./task-tracker.md) — Phase 1 implementation tasks
- [`architecture.md`](./architecture.md) — System architecture and technical design
- [`competitive-analysis.md`](./competitive-analysis.md) — Competitive landscape
