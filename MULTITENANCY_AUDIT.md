# Multi-Tenancy Landmine Map

_Targeted scan of single-tenant assumptions to fix during the Postgres migration.
Run June 16, 2026, against `prisma/schema.prisma` + `src/`._

**The headline you need first:** the schema columns are the easy, mechanical part. The
real exposure is **305 Prisma query call sites across 63 files** that implicitly mean
"the one user." The dangerous ones are the `findFirst()` calls (see Tier 3) — in a
single-user app `findFirst()` means "the row"; in multi-tenant it silently returns
*whichever* user's row the DB hands back. That's a cross-user data leak that **throws no
error**. You cannot hand-audit 305 sites perfectly, so the real safety net is a
**centralized scoped-query layer** that always injects `userId` — see the bottom.

> CORRECTION (June 16): an earlier version of this doc called RLS the backstop.
> That's wrong for THIS stack. Prisma connects as the database owner role, which
> **bypasses RLS**, so RLS does NOT catch a missing `where: { userId }` in Prisma
> code. RLS only constrains the Supabase Data API (which we've disabled). With a
> Prisma backend + Data API off, your tenant boundary is your app code, full stop.

---

## Tier 1 — Hard landmines (silent collisions / leaks if shipped multi-user)

### 1a. `day @unique` → must become `@@unique([userId, day])`
In single-user, one row per day is correct. With a 2nd user, two people physically
cannot have a row for the same day — inserts will fail or overwrite. **12 models:**

`DailyReadiness`, `DailySleep`, `DailyActivity`, `DailyStress`, `CyclePhaseLog`,
`NutritionLog`, `WeightLog`, `DailySpO2`, `SleepTimeRecommendation`, `DailyResilience`,
`DailyRunningMetrics`, `DailyVO2Max`

### 1b. Natural-key uniques that collide across users → add `userId` to the constraint
| Model | Current constraint | Fix |
|---|---|---|
| `HeartRateSample` | `@@unique([timestamp, source])` | `@@unique([userId, timestamp, source])` |
| `WorkoutTemplate` | `name @unique` | `@@unique([userId, name])` |
| `LifeContextDef` | `label @unique` | `@@unique([userId, label])` — two users both want "with partner" |
| `WorkoutNote` | `@@unique([workoutSource, workoutId])` | `@@unique([userId, workoutSource, workoutId])` |
| `HealthKitWorkout` | `externalId @unique` | `@@unique([userId, externalId])` |
| `ActivityTag` | `ouraTagId @unique` | `@@unique([userId, ouraTagId])` |

### 1c. Single-row singletons → make per-user
- **`UserProfile`** — `id Int @id @default(1)`, the literal smoking gun. This *is* the
  user record. Fold into / key off the new `User`. **Hardcoded `id: 1` appears in 12
  call sites** (`profile/route.ts`, `weight/route.ts`, `coach/tradeoffs/route.ts`,
  `training-call.ts`, `coach-context.ts`, `sync.ts`, `body/page.tsx`, `page.tsx`).
- **`OuraToken`** — one global row, fetched via `prisma.ouraToken.findFirst()` in
  `lib/oura.ts` (2×) and `auth/oura/callback/route.ts`. Becomes one token **per user**;
  the connect/refresh flow must look up by `userId`.
- **`EnvReading.deviceId`** — defaults to `"env-sensor-bedroom"` (your bedroom). Fine to
  keep as a default, but device→user ownership needs a `userId`.

---

## Tier 2 — Decision points (do NOT blindly add userId)

- **`Exercise`** (`name @unique`) — is this a **global catalog** shared by everyone, or
  per-user? Recommended: nullable `userId` (null = shared seed library, set = user's
  custom exercise), unique on `@@unique([userId, name])`. This is the one model where
  auto-adding userId would be wrong.
- **Child tables reached only via a parent FK** — `NutritionEntry`, `WorkoutSet`,
  `ExperimentLog`, `ChatMessage`, `LifeContextLog`, `HyroxSession`,
  `HyroxStationBenchmark`, `GoalWorkoutTag`, `HeartRateZoneSummary`. These are *already*
  scoped through their parent, so userId is technically redundant. **But** Supabase RLS
  policies are per-table and joining to a parent inside a policy is painful and slow.
  Recommended: **denormalize `userId` onto every table anyway** — it makes RLS trivial
  and queries simpler. Pick this once and apply uniformly.

---

## Tier 3 — Query blast radius (mechanical, but this is where the bugs hide)

- **305 Prisma query call sites in 63 files.** Every read/write that implicitly means
  "the user" needs `where: { userId }`.
- **`findFirst()` with no scope is the specific danger** — used heavily in
  `lib/coach-context.ts`, `lib/flags.ts`, `lib/hyrox-today.ts`, `lib/oura.ts`,
  `lib/baseline-score.ts`, `lib/cycle-phase.ts`, and many `api/` routes. Each one assumes
  a single user's latest row. Multi-tenant, these leak across users *silently*.

**Strategy, because 305 sites is too many to get right by hand:**
1. Add `userId` columns + the Tier 1 constraints in the migration.
2. Thread a `userId` (from the auth session) into the query layer — ideally centralize
   so routes can't forget it.
3. **Turn on Postgres Row-Level Security in Supabase as the backstop.** Even if you miss
   a `where: { userId }` in one of the 305 sites, RLS blocks the cross-user read at the
   database. For a public health app this isn't optional — it's the difference between
   "one missed filter" and "a data breach."

---

## Safe as-is (no change needed)

Constraints already scoped through a parent that will carry `userId`:
`ExperimentLog @@unique([experimentId, day])`, `GoalWorkoutTag @@unique([goalId, sessionId])`,
`HyroxPlan.goalId @unique`, `HyroxSession.workoutSessionId @unique`,
`ChatMessage`→`ChatSession`. (Still get a denormalized `userId` per the Tier 2 decision,
but their *uniqueness* is fine.)

---

## Bottom line

Order of operations for Phase 0: add `User` + `userId` everywhere (hardcoded to you) →
fix the Tier 1 constraints in the same migration → *then* migrate data.
Doing the constraint fixes **before** real user data exists is the whole point — after,
each one is a painful backfill.

For the 305-site query sweep: since RLS won't back you up here (Prisma bypasses it),
build a **centralized scoped-query helper** — a thin wrapper that always takes the
current `userId` and injects it into the `where`, so a route physically cannot forget
it. That's the real isolation mechanism for a Prisma backend, and it's why disabling
the Data API matters: your backend is then the *only* path to the data.
