# Migration Runbook — SQLite single-tenant → Postgres multi-tenant

_Drafted June 16, 2026. Pairs with `schema.draft.prisma` and `MULTITENANCY_AUDIT.md`._

**Strategy: transform-on-load, not in-place evolve.** You're moving SQLite → Postgres
*anyway*, so don't try to ALTER the live DB. Instead: dump the old data to JSON, stand up
a fresh Postgres with the new schema (tables born with `userId NOT NULL` — no backfill
dance because they start empty), then load the JSON back, stamping your `userId` on every
row. The old `dev.db` stays untouched as your rollback.

**The one trap to respect:** Prisma can't talk to SQLite and Postgres from the same
generated client. So you **dump while the schema is still SQLite**, then flip the provider,
then load. Order is not optional.

---

## Phase 0 — Pre-flight

1. Back up the current DB: `cp prisma/dev.db prisma/dev.db.bak`.
2. Snapshot row counts per table (you'll verify against these at the end):
   a one-off script printing `prisma.<model>.count()` for every model → save to `counts.before.json`.
3. Stop writing to the app (no syncs running) so the dump is consistent.
4. Commit current state to git so you can revert code too.

## Phase 1 — Dump old data (while still SQLite)

5. Write `scripts/dump.ts` using the **current** Prisma client: `findMany()` every model,
   write one JSON file per model to `migration-dump/<model>.json`. **Preserve all `id`s and
   foreign keys exactly** — do not regenerate them, or relationships break.
6. Run it. Confirm `migration-dump/` has a file per table and counts match `counts.before.json`.

## Phase 2 — Stand up Postgres + apply new schema

7. Create a Supabase project; grab the connection string. Put it in `.env` as `DATABASE_URL`
   (use the **pooled** URL for the app, the **direct** URL for migrations — Supabase gives both).
8. Replace `schema.prisma` with `schema.draft.prisma` (after you've eyeballed the two
   flagged decisions — see bottom).
9. `npx prisma migrate dev --name init_multitenant` → creates the baseline migration and all
   tables in Postgres. (This also establishes the `migrations/` folder you've never had.)
10. `npx prisma generate` → new Postgres client.

## Phase 3 — Create your User, then load

11. Seed your tenant: create the single `User` row (your email) + its `UserProfile`
    (mapped from the old `id:1` profile) + attach the old `OuraToken` to your `userId`.
    Record your `userId` — everything else gets stamped with it.
12. Write `scripts/load.ts` using the **new** client. For each model, read its JSON, add
    `userId: <yours>`, and insert. **Load in FK-dependency order** (parents before children):

    ```
    User
      → UserProfile, OuraToken, Exercise
      → Goal → HyroxPlan → HyroxStationBenchmark
      → WorkoutSession → WorkoutSet, GoalWorkoutTag
      → HyroxSession            (needs BOTH HyroxPlan and WorkoutSession first)
      → Experiment → ExperimentLog, ActivityTag
      → NutritionLog → NutritionEntry
      → ChatSession → ChatMessage
      → LifeContextDef → LifeContextLog
      → (standalone, User-only): DailyReadiness, DailySleep, DailyActivity,
        DailyStress, DailySpO2, DailyResilience, DailyRunningMetrics, DailyVO2Max,
        SleepTimeRecommendation, OuraWorkout, OuraSession, HeartRateSample,
        CyclePhaseLog, WeightLog, HealthKitSync, HealthKitWorkout,
        HeartRateZoneSummary, EnvReading, SyncLog
    ```
13. Watch for two type shifts during load:
    - **`MealSource`** is now a real Postgres enum — every existing `NutritionEntry.source`
      value must be one of the 4 members (or null). Validate before insert.
    - **Dates**: SQLite stored them loosely; ensure they parse to valid `DateTime`.

## Phase 4 — Compute baselines

14. Run a `scripts/recompute-baselines.ts` that, for each signal, computes
    `n / mean / sd / cv / span / isMature / maturityPct` from the loaded rows and upserts
    `UserBaseline`. (This is also the function the sync pipeline will call going forward.)

## Phase 5 — Verify (do not skip)

15. Re-run the count script against Postgres → `counts.after.json`. **Every table's count
    must equal `counts.before.json`.** Any mismatch = a load bug, usually an FK-order or
    enum issue.
16. Spot-check 3–4 relationships survived: e.g. a `WorkoutSession` still has its `WorkoutSet`s;
    a `NutritionLog` still has its `entries`.
17. Smoke-test the app pointed at Postgres (see Phase 6 first — it won't run until writes
    carry `userId`).

## Phase 6 — Keep the app working (the bridge)

The schema migration doesn't fix the **305 query call sites**. You don't need all 305 now —
only the subset that *breaks*:

18. Add a `getCurrentUserId()` shim in `lib/` that returns **your** `userId` (a constant for
    now). At the auth phase it gets swapped to read the session — one function, not 305 edits.
19. **Patch writes first.** Every `create` / `upsert` that sets scalar data now *requires*
    `userId` (it's `NOT NULL` with no default), so those throw until fixed. Reads (`findFirst`,
    `findMany`) still return your data fine while you're the only tenant — defer those to the
    auth phase.

## Phase 7 — Deferred to later phases (NOT now)

- **Centralized scoped-query helper** — a wrapper that always injects the current `userId`
  into `where`. This is the real tenant-isolation mechanism for a Prisma backend (NOT RLS —
  Prisma connects as the owner role and bypasses RLS). Build this when you do the read sweep.
- **The read-query sweep** — done gradually, routed through the scoped helper above.
- **Auth / login** — flips `getCurrentUserId()` from constant to session.
- **RLS** is only relevant if you ever re-enable the Supabase Data API (currently off). For a
  pure Prisma backend it does nothing, so it's not on the critical path.

---

## Rollback

At any point before you delete `dev.db.bak`: revert `schema.prisma` (git), point
`DATABASE_URL` back at `prisma/dev.db`, `npx prisma generate`. The new Postgres is additive
and independent, so rollback is just "use the old DB again." Keep `dev.db.bak` until the app
has run cleanly on Postgres for a few days.

---

## Two decisions to confirm before running (they change the load script)

| Decision | Options | My default |
|---|---|---|
| Existing `Exercise` rows | shared catalog (`userId = null`) vs your custom (`userId = yours`) | **Shared catalog (null)** — it's a reference library; new users should see it too |
| Child tables (`WorkoutSet`, `NutritionEntry`, …) | denormalized `userId` (as drafted) vs normalized (scope via parent) | **Denormalized** — makes RLS trivial; already in the draft |
