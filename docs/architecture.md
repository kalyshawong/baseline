# Baseline — System Architecture

**Last Updated:** 2026-04-02
**Status:** Phase 1 Design

---

## High-Level Overview

Baseline is a monolithic web application with a clear separation between data ingestion, business logic, and presentation. It is designed for single-user self-hosting in Phase 1, with a path toward multi-user and cloud deployment in later phases.

```
┌─────────────────────────────────────────────────┐
│                  React Frontend                  │
│         (Vite + React + TailwindCSS)             │
├─────────────────────────────────────────────────┤
│                  FastAPI Backend                  │
│  ┌───────────┬──────────┬──────────────────────┐ │
│  │  Oura     │ Workout  │  Recommendations     │ │
│  │  Sync     │ Logger   │  Engine              │ │
│  ├───────────┼──────────┼──────────────────────┤ │
│  │  Cycle    │ Mind     │  Dashboard           │ │
│  │  Tracker  │ Mode     │  Aggregator          │ │
│  └───────────┴──────────┴──────────────────────┘ │
├─────────────────────────────────────────────────┤
│          PostgreSQL + TimescaleDB                │
│       (biometrics, workouts, experiments)        │
└─────────────────────────────────────────────────┘
         ▲              ▲              ▲
         │              │              │
    Oura API V2    HealthKit (V2)   Arduino (V2/V3)
```

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React + Vite + TailwindCSS | Fast dev iteration, rich component ecosystem, utility-first styling |
| **Backend** | Python + FastAPI | Async-first, excellent for data pipelines, strong typing with Pydantic |
| **Database** | PostgreSQL + TimescaleDB | Robust relational DB with first-class time-series support via hypertables |
| **ORM** | SQLAlchemy 2.0 | Mature, async-compatible, works well with Alembic migrations |
| **Migrations** | Alembic | Standard for SQLAlchemy projects |
| **Task scheduling** | APScheduler (or cron) | Lightweight daily sync jobs; no need for Celery at single-user scale |
| **Containerization** | Docker Compose | Single command to spin up entire stack locally |
| **Auth (Oura)** | OAuth2 via `httpx` | Async HTTP client for token management and API calls |
| **Auth (App)** | Session-based (FastAPI) | Simple for single-user. JWT option for multi-user V2 |
| **Charts** | Recharts or Chart.js | Lightweight, React-native charting for dashboards |

---

## Backend Architecture

### Module Structure

```
baseline/
├── api/
│   ├── routes/
│   │   ├── auth.py          # Oura OAuth2 flow
│   │   ├── workouts.py      # Workout CRUD
│   │   ├── exercises.py     # Exercise library
│   │   ├── biometrics.py    # Biometric data queries
│   │   ├── cycle.py         # Cycle phase logging
│   │   ├── dashboard.py     # Aggregated daily view
│   │   └── experiments.py   # Mind Mode (V2)
│   └── dependencies.py      # Shared deps (DB session, auth)
├── core/
│   ├── config.py             # Settings via pydantic-settings
│   ├── database.py           # SQLAlchemy engine + session
│   └── security.py           # Token encryption, session mgmt
├── models/
│   ├── user.py
│   ├── biometric.py          # Readiness, sleep, activity, HR, etc.
│   ├── workout.py            # Session, set, exercise
│   ├── cycle.py              # Phase log
│   └── experiment.py         # Mind Mode (V2)
├── schemas/
│   ├── biometric.py          # Pydantic request/response models
│   ├── workout.py
│   ├── cycle.py
│   └── experiment.py
├── services/
│   ├── oura_client.py        # Oura API V2 wrapper
│   ├── oura_sync.py          # Daily sync job logic
│   ├── recommendation.py     # Training intensity engine
│   ├── cycle_logic.py        # Phase detection + adjustments
│   ├── overload_tracker.py   # Progressive overload calculations
│   └── correlation.py        # Mind Mode stats engine (V2)
├── tasks/
│   └── scheduler.py          # APScheduler job definitions
├── migrations/
│   └── versions/             # Alembic migration files
├── main.py                   # FastAPI app entry point
└── seed.py                   # Demo/test data seeder
```

### Key Design Decisions

**Why FastAPI over Django:** Baseline is API-first with a React frontend. FastAPI's async support, automatic OpenAPI docs, and Pydantic integration make it ideal for a data-heavy application. Django's ORM and admin panel aren't needed.

**Why TimescaleDB over plain Postgres:** Biometric data is inherently time-series. TimescaleDB hypertables give automatic time-based partitioning, efficient range queries, and built-in aggregation functions (e.g., `time_bucket`) without changing the Postgres tooling.

**Why monolith over microservices:** Single user, single developer, Phase 1. A monolith with clean module boundaries is faster to build and easier to debug. Extract services later if needed.

---

## Database Schema (Phase 1)

### Core Tables

**users**
- `id` (UUID, PK)
- `email` (string, unique)
- `name` (string)
- `oura_access_token` (encrypted string)
- `oura_refresh_token` (encrypted string)
- `oura_token_expires_at` (timestamp)
- `created_at`, `updated_at`

**biometric_daily** (TimescaleDB hypertable, partitioned by `day`)
- `id` (UUID, PK)
- `user_id` (FK → users)
- `day` (date)
- `source` (enum: oura, healthkit, manual)
- `readiness_score` (integer, nullable)
- `sleep_score` (integer, nullable)
- `activity_score` (integer, nullable)
- `hrv_average` (float, nullable)
- `rhr` (integer, nullable)
- `temperature_deviation` (float, nullable)
- `stress_high_seconds` (integer, nullable)
- `recovery_high_seconds` (integer, nullable)
- `resilience_level` (string, nullable)
- `vo2_max` (float, nullable)
- `total_sleep_seconds` (integer, nullable)
- `deep_sleep_seconds` (integer, nullable)
- `rem_sleep_seconds` (integer, nullable)
- `sleep_efficiency` (integer, nullable)
- `raw_json` (JSONB — full API response for future field extraction)
- `synced_at` (timestamp)

**exercises**
- `id` (UUID, PK)
- `user_id` (FK → users)
- `name` (string)
- `muscle_group` (enum: chest, back, shoulders, arms, legs, core, full_body)
- `movement_pattern` (enum: push, pull, hinge, squat, carry, isolation, cardio)
- `equipment` (enum: barbell, dumbbell, cable, machine, bodyweight, kettlebell, other)
- `notes` (text, nullable)
- `is_active` (boolean, default true)

**workout_sessions**
- `id` (UUID, PK)
- `user_id` (FK → users)
- `date` (date)
- `started_at` (timestamp)
- `finished_at` (timestamp, nullable)
- `readiness_score` (integer, nullable — snapshot from that day)
- `cycle_phase` (enum, nullable — snapshot from that day)
- `notes` (text, nullable)
- `total_volume` (float, computed — sum of sets × reps × weight)

**workout_sets**
- `id` (UUID, PK)
- `session_id` (FK → workout_sessions)
- `exercise_id` (FK → exercises)
- `set_number` (integer)
- `reps` (integer)
- `weight_kg` (float)
- `rpe` (float, nullable — rate of perceived exertion 1–10)
- `notes` (text, nullable)
- `velocity_mean` (float, nullable — V2, from IMU)

**cycle_phase_log**
- `id` (UUID, PK)
- `user_id` (FK → users)
- `date` (date)
- `phase` (enum: menstrual, follicular, ovulation, luteal)
- `source` (enum: manual, auto_temp, healthkit)
- `confidence` (enum: high, medium, low)
- `notes` (text, nullable)

### Indexes

- `biometric_daily`: composite index on (`user_id`, `day`), hypertable time index on `day`
- `workout_sessions`: index on (`user_id`, `date`)
- `workout_sets`: index on (`session_id`), index on (`exercise_id`)
- `cycle_phase_log`: index on (`user_id`, `date`)

---

## Data Flow

### Daily Oura Sync

```
[Cron / APScheduler: 6:00 AM]
        │
        ▼
[oura_sync.py: check token validity]
        │
        ├── expired? → refresh_token flow → update DB
        │
        ▼
[oura_client.py: GET each endpoint for yesterday]
        │
        ▼
[Parse responses → map to biometric_daily schema]
        │
        ▼
[Upsert into biometric_daily (ON CONFLICT update)]
        │
        ▼
[Log sync status + timestamp]
```

### Workout Logging

```
[User opens Body Mode]
        │
        ▼
[Frontend: GET /dashboard → readiness + cycle phase + recommendation]
        │
        ▼
[User starts workout → POST /workouts/sessions]
        │
        ▼
[User logs sets → POST /workouts/sessions/{id}/sets]
        │ (each set saved immediately — no data loss on crash)
        ▼
[User finishes → PATCH /workouts/sessions/{id} (finished_at, total_volume)]
        │
        ▼
[Frontend shows session summary + progressive overload comparison]
```

### Training Recommendation Engine

```
[GET /dashboard/recommendation]
        │
        ▼
[Fetch today's readiness_score from biometric_daily]
        │
        ▼
[Fetch current cycle_phase from cycle_phase_log]
        │
        ▼
[recommendation.py: apply intensity tier logic]
        │
        ├── readiness_score → base intensity tier
        ├── cycle_phase → modifier (see cycle-phase-logic.md)
        └── combine → final recommendation
        │
        ▼
[Return: { intensity_tier, description, suggested_volume_modifier, warnings[] }]
```

---

## API Design

RESTful JSON API. All endpoints prefixed with `/api/v1/`.

### Key Endpoints (Phase 1)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/auth/oura/login` | Redirect to Oura OAuth2 |
| GET | `/auth/oura/callback` | Handle OAuth2 callback |
| GET | `/dashboard` | Today's aggregated view |
| GET | `/dashboard/recommendation` | Training recommendation |
| GET | `/biometrics?start=&end=` | Biometric data range query |
| GET | `/biometrics/trends?metric=&days=` | Trend data for charts |
| POST | `/workouts/sessions` | Start a workout session |
| PATCH | `/workouts/sessions/{id}` | Update / finish session |
| POST | `/workouts/sessions/{id}/sets` | Log a set |
| GET | `/workouts/history?limit=&offset=` | Past sessions |
| GET | `/exercises` | Exercise library |
| POST | `/exercises` | Add custom exercise |
| POST | `/cycle/log` | Log cycle phase |
| GET | `/cycle/current` | Current phase + history |

---

## Deployment (Phase 1 — Local)

```yaml
# docker-compose.yml (simplified)
services:
  db:
    image: timescale/timescaledb:latest-pg16
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: baseline
      POSTGRES_USER: baseline
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - "5432:5432"

  api:
    build: ./backend
    depends_on:
      - db
    environment:
      DATABASE_URL: postgresql+asyncpg://baseline:${DB_PASSWORD}@db:5432/baseline
      OURA_CLIENT_ID: ${OURA_CLIENT_ID}
      OURA_CLIENT_SECRET: ${OURA_CLIENT_SECRET}
      SECRET_KEY: ${SECRET_KEY}
    ports:
      - "8000:8000"

  frontend:
    build: ./frontend
    depends_on:
      - api
    ports:
      - "3000:3000"

volumes:
  pgdata:
```

---

## Security Considerations

- Oura tokens encrypted at rest (Fernet symmetric encryption via `cryptography` library)
- All API calls over HTTPS
- Environment variables for secrets (never committed)
- Single-user Phase 1 simplifies auth — session cookie is sufficient
- CORS restricted to frontend origin
- Rate limiting on API endpoints (even locally, good hygiene)

---

## Future Architecture Changes (V2+)

- **HealthKit adapter:** Native Swift/Kotlin bridge or use a HealthKit-to-API proxy
- **Arduino data ingestion:** BLE → phone app → API websocket, or BLE → ESP32 → WiFi → API
- **Correlation engine:** Pandas/NumPy statistical processing, potentially as a separate background worker
- **Multi-user:** Migrate from session auth to JWT, add role-based access for coach view
- **Mobile:** React Native sharing API layer, or native Swift app for HealthKit integration
