# Baseline — System Architecture

**Last Updated:** 2026-04-06
**Status:** Phase 2b (Body Mode in progress)

---

## High-Level Overview

Baseline is a full-stack Next.js application that combines biometric data ingestion, strength training logging, cognitive self-experimentation, and AI-powered coaching into a single self-hosted system. It is designed for single-user operation with a path toward multi-user deployment.

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js 15 (App Router)                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                  React 19 Frontend                     │ │
│  │  ┌──────────┬──────────┬─────────┬────────┬─────────┐ │ │
│  │  │Dashboard │ Mind     │ Body    │ Coach  │ Goals   │ │ │
│  │  │+ Score   │ Mode     │ Mode    │ (Chat) │ + Weight│ │ │
│  │  └──────────┴──────────┴─────────┴────────┴─────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │               API Routes (/api/*)                      │ │
│  │  ┌────────┬──────────┬─────────┬──────────┬────────┐  │ │
│  │  │ Oura   │Experiment│Workout  │ Coach    │Nutrition│  │ │
│  │  │ Sync   │ CRUD     │ CRUD    │ Chat     │ Logger │  │ │
│  │  ├────────┼──────────┼─────────┼──────────┼────────┤  │ │
│  │  │ Auth   │ Tags     │Exercise │ Goals    │Weight  │  │ │
│  │  │ OAuth2 │ CRUD     │ Library │ CRUD     │ CRUD   │  │ │
│  │  └────────┴──────────┴─────────┴──────────┴────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                 Business Logic Layer                    │ │
│  │  ┌──────────────┬───────────────┬───────────────────┐  │ │
│  │  │ Baseline     │ Correlation   │ Training          │  │ │
│  │  │ Score Engine │ Engine (stats)│ Intelligence      │  │ │
│  │  ├──────────────┼───────────────┼───────────────────┤  │ │
│  │  │ Coach Context│ TDEE          │ Nutrition (Claude) │  │ │
│  │  │ Aggregator   │ Estimator     │ Macro Parser      │  │ │
│  │  └──────────────┴───────────────┴───────────────────┘  │ │
│  └────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│              Prisma ORM → SQLite Database                    │
│  (biometrics, workouts, experiments, nutrition, chat, goals) │
└─────────────────────────────────────────────────────────────┘
        ▲              ▲              ▲              ▲
        │              │              │              │
   Oura API V2    Anthropic API   ESP32 Sensor   Arduino IMU
   (biometrics)   (coach + food)  (environment)  (velocity)
```

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | Full-stack React with API routes, SSR, and file-based routing |
| **Frontend** | React 19 + Tailwind CSS 4 | Server components, streaming, utility-first styling |
| **Language** | TypeScript 5.8 | End-to-end type safety |
| **Database** | SQLite via Prisma | Zero-config, embedded, sufficient for single-user. Migrate to PostgreSQL for multi-user. |
| **ORM** | Prisma | Type-safe queries, schema-driven migrations, excellent DX |
| **Charts** | Recharts | Lightweight, React-native charting with responsive containers |
| **Statistics** | jstat | Welch's t-test, t-distribution CDF for correlation engine |
| **AI** | @anthropic-ai/sdk | Claude API for nutrition macro estimation and coaching chat |
| **Auth (Oura)** | OAuth2 | Token exchange and refresh via Oura API V2 |
| **Styling** | Tailwind CSS 4 | Utility-first, no separate CSS files, responsive by default |

---

## Application Structure

```
baseline/
├── prisma/
│   ├── schema.prisma          # 18 models, ~300 lines
│   ├── seed-exercises.ts      # Exercise library seeder
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── page.tsx           # Dashboard (home)
│   │   ├── layout.tsx         # Root layout + global nav
│   │   ├── mind/
│   │   │   ├── page.tsx       # Mind Mode dashboard
│   │   │   └── layout.tsx
│   │   ├── body/
│   │   │   ├── page.tsx       # Body Mode (workout list)
│   │   │   └── workout/
│   │   │       ├── new/page.tsx    # New workout flow
│   │   │       └── [id]/page.tsx   # Workout detail
│   │   ├── coach/
│   │   │   └── page.tsx       # AI coaching chat
│   │   ├── goals/
│   │   │   └── page.tsx       # Goals manager
│   │   └── api/
│   │       ├── auth/oura/         # OAuth2 flow (2 routes)
│   │       ├── sync/              # Oura data sync
│   │       ├── cycle-phase/       # Cycle phase logging
│   │       ├── experiments/       # Experiment CRUD + analyze (4 routes)
│   │       ├── tags/              # Activity tag CRUD
│   │       ├── nutrition/         # Nutrition logging
│   │       ├── env-readings/      # Environment sensor data
│   │       ├── exercises/         # Exercise library
│   │       ├── workouts/          # Workout CRUD + sets + trends (7 routes)
│   │       ├── templates/         # Workout templates (2 routes)
│   │       ├── coach/             # AI coach chat + sessions (2 routes)
│   │       ├── goals/             # Goal CRUD (2 routes)
│   │       ├── weight/            # Weight log CRUD (2 routes)
│   │       └── profile/           # User profile
│   ├── components/
│   │   ├── dashboard/             # Score card, sync button, activity, calories (7)
│   │   ├── mind/                  # Experiments, tags, nutrition, insights (8)
│   │   ├── body/                  # Workout logger, trends, volume zones (6)
│   │   ├── coach/                 # Chat interface (1)
│   │   ├── goals/                 # Goals manager (1)
│   │   ├── weight/                # Weight input, trends, TDEE, goals (5)
│   │   ├── date-nav.tsx           # Shared date navigation
│   │   └── nav.tsx                # Global navigation bar
│   └── lib/
│       ├── db.ts                  # Prisma client singleton
│       ├── oura.ts                # Oura API client + token management
│       ├── sync.ts                # Data sync orchestration
│       ├── baseline-score.ts      # Composite score calculation
│       ├── correlation.ts         # Welch's t-test + Cohen's d
│       ├── insights.ts            # Passive tag-to-biometric correlation
│       ├── experiment-templates.ts # 5 pre-seeded experiment templates
│       ├── usda.ts                # Claude-powered macro estimation
│       ├── coach-context.ts       # 14-query context builder for AI coach
│       ├── training.ts            # RPE creep, HRV CV, fatigue scoring
│       ├── tdee.ts                # TDEE estimation from weight + calories
│       ├── exercise-library.ts    # Exercise definitions
│       └── date-utils.ts          # Date utilities
└── docs/
    ├── PRD.md
    ├── architecture.md            # This file
    ├── task-tracker.md
    ├── bugs.md                    # 30 cataloged bugs
    ├── session-log.md
    ├── phase-2-spec.md            # Mind Mode spec
    ├── phase-3-spec.md            # Body Mode spec
    ├── body-mode-research.md      # 27 peer-reviewed citations
    ├── arduino-build-guide.md     # IMU hardware + firmware spec
    ├── oura-api-research.md
    ├── cycle-phase-logic.md
    ├── competitive-analysis.md
    └── build-sequence-rationale.md
```

---

## Database Schema (18 models)

### Biometric Data (from Oura)
- **OuraToken** — OAuth2 access/refresh tokens with expiry
- **DailyReadiness** — Score, temp deviation, HRV balance, recovery index
- **DailySleep** — Score, durations (total/REM/deep/light), efficiency, HRV, HR
- **DailyActivity** — Steps, calories (active/total), active time by intensity
- **DailyStress** — Stress/recovery highs, day summary
- **HeartRateSample** — BPM + source + timestamp (unique on timestamp+source)
- **CyclePhaseLog** — Manual phase logging (menstrual/follicular/ovulation/luteal)
- **SyncLog** — Sync status and details

### Mind Mode
- **Experiment** — Hypothesis, IV/DV, metric source, lag days, status lifecycle
- **ExperimentLog** — Daily treatment/control log with optional intensity
- **ActivityTag** — Quick-tagged activities with category, timestamp, optional experiment link
- **NutritionLog** — Daily macro totals (calories, protein, carbs, fat)
- **NutritionEntry** — Per-food breakdown with Claude-estimated macros

### Body Mode
- **Exercise** — Library of exercises with muscle group, movement pattern, equipment
- **WorkoutSession** — Training session with date, RPE, volume, readiness context
- **WorkoutSet** — Individual set: reps × weight × RPE, warmup/PR flags
- **WorkoutTemplate** — Reusable workout templates (exercises stored as JSON)

### User & Goals
- **UserProfile** — Body stats, experience level, activity level, goals, unit preference
- **Goal** — Typed goals (weight/race/exam/performance/habit) with deadline and status
- **WeightLog** — Daily weight + optional body fat and muscle mass

### Coach
- **ChatSession** — Conversation thread with title
- **ChatMessage** — Individual messages (user/assistant) with session FK

### Environment
- **EnvReading** — Sensor data: PM2.5, temperature, humidity, pressure, noise, light

---

## Data Flow

### Daily Oura Sync
```
[User clicks Sync / Scheduled trigger]
  → POST /api/sync (with SYNC_API_KEY)
  → getValidToken() — check expiry, refresh if needed
  → Fetch: readiness, sleep, activity, stress, heart rate
  → Upsert each record by day (unique constraint)
  → Log to SyncLog (status + details)
```

### Baseline Score Calculation
```
[Dashboard loads / date changes]
  → getScoreForDate(date)
  → Fetch: latest readiness, sleep (with HRV), 3-day + 14-day HRV, cycle phase
  → Compute: readiness (40%) + HRV trend (25%) + sleep quality (20%) + temp deviation (15%)
  → Null components excluded with weight redistribution
  → Cycle-phase-aware temp scoring (luteal −0.4°C, ovulation −0.15°C)
  → Return: { overall, color, label, components }
```

### Coach Chat
```
[User sends message]
  → POST /api/coach
  → buildCoachContext() — 14 Prisma queries aggregating all user data
  → Anthropic API: system prompt + context + conversation history
  → Stream response to UI
  → Save both messages to ChatSession/ChatMessage
```

### Nutrition Logging
```
[User types "3 eggs and toast"]
  → POST /api/nutrition
  → estimateMacros(text) via Claude API — returns per-food breakdown
  → Create NutritionEntry records for each food item
  → Upsert NutritionLog daily totals (sum of entries)
```

### Workout Logging
```
[User starts workout from template or blank]
  → POST /api/workouts — create WorkoutSession
  → For each set: POST /api/workouts/[id]/sets — create WorkoutSet
  → On completion: PATCH /api/workouts/[id] — set completedAt, sessionRPE, volume
  → Trends: GET /api/workouts/trends — volume load over time per exercise
```

---

## External Integrations

| Service | Protocol | Purpose | Status |
|---|---|---|---|
| Oura API V2 | OAuth2 + REST | Biometric data sync | Active |
| Anthropic Claude | API key + REST | Nutrition parsing + coach chat | Active |
| ESP32 Environment Sensor | WiFi HTTP POST | Room conditions (PM2.5, temp, humidity, noise, light) | Endpoint ready, hardware pending |
| Arduino IMU (ESP32 + MPU6050) | BLE GATT | Bar velocity tracking | Not started |
| Apple HealthKit | Native bridge | HR zones, workouts, menstrual data | Planned (Phase 3) |

---

## Security Considerations

- Oura tokens stored in database (SQLite file) — not encrypted at rest
- API keys in environment variables, never committed (.env in .gitignore)
- SYNC_API_KEY protects the sync endpoint from unauthorized triggers
- SENSOR_API_KEY (when enabled) protects environment sensor POST endpoint
- ANTHROPIC_API_KEY — no rate limiting on coach endpoint (BUG-004 — critical)
- Single-user, localhost-only in Phase 1 — no user auth needed
- CORS not explicitly configured (Next.js same-origin by default)

---

## Key Design Decisions

**Why Next.js over separate frontend + backend:** Baseline started as a planned Python/FastAPI + React/Vite stack but was implemented as a Next.js monolith. The App Router provides API routes alongside React pages, eliminating the need for a separate backend service. This simplifies deployment, reduces boilerplate, and enables server components for data-heavy pages.

**Why SQLite over PostgreSQL:** Single user, single device. SQLite is zero-config, embedded in the application process, and has no external dependencies. Prisma abstracts the database layer, so migrating to PostgreSQL later requires only changing the datasource provider and connection string.

**Why Prisma over raw SQL:** Type-safe queries that match the TypeScript frontend. Schema-driven migrations. Excellent autocomplete in the IDE. The main tradeoff is less control over complex queries, but Baseline's queries are straightforward CRUD + aggregation.

**Why Claude for nutrition parsing:** USDA API requires exact food name matching. Claude can interpret natural language ("3 eggs and a piece of toast with butter") and return structured macro estimates. The tradeoff is API cost and latency, but it dramatically reduces input friction.

**Why monolith:** Single developer, single user, Phase 1. Clean module boundaries within the monolith (lib/ for business logic, api/ for routes, components/ for UI) provide enough separation. Extract services if/when needed for multi-user scale.

---

## Future Architecture Changes

- **PostgreSQL + TimescaleDB:** Required for multi-user and time-series query optimization
- **Redis:** Cache coach context (currently 14 queries per message), rate limiting
- **Background jobs:** Replace manual sync with scheduled cron (Vercel Cron or node-cron)
- **WebSocket:** Real-time velocity display from Arduino IMU during workouts
- **Mobile:** React Native sharing the API layer, or native Swift for HealthKit integration
- **Auth:** Add NextAuth.js for multi-user with Google/email login
