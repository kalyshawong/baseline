# Oura Sync Expansion Spec — Additional V2 Endpoints

**Version:** 0.1 (Draft)
**Date:** 2026-04-08
**Status:** Draft
**Depends on:** Existing Oura sync (`src/lib/sync.ts`, `src/lib/oura.ts`)

---

## Problem Statement

Baseline currently syncs 5 of 15 available Oura API V2 endpoints (readiness, sleep, stress, heart rate, activity). The remaining 10 endpoints contain valuable biometric and behavioral data that would improve the Coach context, correlation engine, and training intelligence features. In particular, SpO2 data, user-created tags, workout/session records, sleep timing recommendations, resilience scores, and VO2 max estimates are all available through the API but not being captured.

## Goals

1. Sync 8 additional Oura endpoints into Baseline's database (SpO2, Enhanced Tags, Workouts, Sessions, Sleep Time, Resilience, VO2 Max, Personal Info)
2. Feed new data into Coach context for richer coaching responses
3. Feed Enhanced Tags into the Mind Mode correlation engine automatically
4. Surface new biometric trends on the dashboard (SpO2, VO2 max, resilience)
5. Auto-populate UserProfile from Oura Personal Info on first connect

## Non-Goals

- Ring Configuration endpoint (no user-facing value, just firmware info)
- Rest Mode Period endpoint (low priority — can add later if user manually activates rest mode)
- Building new dashboard pages for every endpoint — start with data ingestion + Coach context
- Changing the sync cadence (stays daily via sync button or cron)

## Scope

Add the following OAuth scopes to the Oura app registration (via developer portal):

**Current scopes:** `daily`, `heartrate`

**Add:** `spo2`, `workout`, `session`, `personal`

**Note:** `daily` scope already covers resilience, sleep_time, and stress. `spo2` is a separate scope. `workout` and `session` each require their own scope. `personal` is needed for personal_info.

---

## New Endpoints — Detailed Spec

### 1. Daily SpO2

**Oura endpoint:** `GET /v2/usercollection/daily_spo2`
**Query params:** `start_date`, `end_date` (YYYY-MM-DD)
**Scope:** `spo2`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date (YYYY-MM-DD) |
| `spo2_percentage` | object | Contains `average` (float, 0–100) |

**Prisma model:**

```prisma
model DailySpO2 {
  id         String   @id
  day        DateTime @unique
  avgSpO2    Float?   // spo2_percentage.average
  createdAt  DateTime @default(now())
}
```

**Baseline usage:**
- Dashboard: SpO2 trend card (flag if average drops below 95%)
- Coach context: altitude training recovery, illness detection, sleep apnea signal
- Correlation engine: correlate SpO2 with sleep quality, HRV

**Priority:** HIGH — blood oxygen is a clinically meaningful signal that Oura collects every night. Low SpO2 + high HRV CV could flag overtraining or illness before symptoms appear.

---

### 2. Enhanced Tags

**Oura endpoint:** `GET /v2/usercollection/enhanced_tag`
**Query params:** `start_date`, `end_date` (YYYY-MM-DD)
**Scope:** `daily`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `tag_type_code` | string | Tag category (e.g., `tag_generic_nocaffeine`, `tag_generic_alcohol`) |
| `start_time` | string | ISO 8601 timestamp |
| `end_time` | string | ISO 8601 timestamp (nullable) |
| `start_day` | string | Date (YYYY-MM-DD) |
| `end_day` | string | Date (nullable) |
| `comment` | string | Freeform user notes (nullable) |

**Known tag_type_code values** (from Oura app — non-exhaustive):

- `tag_generic_nocaffeine`, `tag_generic_caffeine`
- `tag_generic_alcohol`, `tag_generic_noalcohol`
- `tag_generic_late_meal`, `tag_generic_big_meal`
- `tag_generic_meditation`, `tag_generic_breathing_exercise`
- `tag_generic_sauna`, `tag_generic_ice_bath`
- `tag_generic_sick`, `tag_generic_injured`
- `tag_generic_period`, `tag_generic_hormonal_treatment`
- `tag_generic_stressful_day`, `tag_generic_relaxing_day`
- `tag_generic_workout`, `tag_generic_rest_day`
- `tag_generic_travel`, `tag_generic_jet_lag`
- Custom tags: `tag_custom_*` prefix with user-defined text

**Mapping to existing ActivityTag model:**

Rather than creating a new model, Enhanced Tags from Oura should be ingested into the existing `ActivityTag` table with `source: "oura"`. This feeds them directly into the correlation engine and InsightsFeed.

```typescript
// Mapping: tag_type_code → { tag, category }
const TAG_MAP: Record<string, { tag: string; category: string }> = {
  "tag_generic_nocaffeine":   { tag: "No Caffeine",   category: "caffeine" },
  "tag_generic_caffeine":     { tag: "Caffeine",      category: "caffeine" },
  "tag_generic_alcohol":      { tag: "Alcohol",       category: "alcohol" },
  "tag_generic_noalcohol":    { tag: "No Alcohol",    category: "alcohol" },
  "tag_generic_late_meal":    { tag: "Late Meal",     category: "custom" },
  "tag_generic_big_meal":     { tag: "Big Meal",      category: "custom" },
  "tag_generic_meditation":   { tag: "Meditation",    category: "meditation" },
  "tag_generic_breathing_exercise": { tag: "Breathing", category: "breathing" },
  "tag_generic_sauna":        { tag: "Sauna",         category: "exercise" },
  "tag_generic_ice_bath":     { tag: "Ice Bath",      category: "exercise" },
  "tag_generic_sick":         { tag: "Sick",          category: "custom" },
  "tag_generic_stressful_day":{ tag: "Stressful Day", category: "custom" },
  "tag_generic_relaxing_day": { tag: "Relaxing Day",  category: "custom" },
  "tag_generic_workout":      { tag: "Workout",       category: "exercise" },
  "tag_generic_rest_day":     { tag: "Rest Day",      category: "exercise" },
  "tag_generic_travel":       { tag: "Travel",        category: "custom" },
  "tag_generic_jet_lag":      { tag: "Jet Lag",       category: "custom" },
};
```

**Deduplication:** Use `ouraTagId` field on ActivityTag to track which tags came from Oura. Before inserting, check if an ActivityTag with that `ouraTagId` already exists. This requires adding an optional `ouraTagId` field to the ActivityTag model.

```prisma
model ActivityTag {
  // ... existing fields ...
  ouraTagId  String?  @unique  // Oura enhanced_tag ID for dedup
  source     String   @default("manual") // manual | oura | healthkit
}
```

**Baseline usage:**
- Correlation engine: auto-correlate "Alcohol" tags with next-day HRV, sleep quality
- InsightsFeed: "On days you tagged 'Sauna' in Oura, your HRV averaged 12% higher the next day"
- Coach context: "User tagged 'Sick' in Oura 2 days ago — adjust training recommendations"
- Dashboard: show Oura tags on the tag timeline alongside manual Baseline tags

**Priority:** HIGH — this is the single biggest feature win. Users already tagging in Oura get free correlation data without duplicating effort in Baseline.

---

### 3. Workouts

**Oura endpoint:** `GET /v2/usercollection/workout`
**Query params:** `start_date`, `end_date` (YYYY-MM-DD)
**Scope:** `workout`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `activity` | string | Activity type (`cycling`, `running`, `walking`, `strength_training`, etc.) |
| `calories` | float | Total calories burned |
| `day` | string | Date (YYYY-MM-DD) |
| `distance` | float | Distance in meters (nullable) |
| `end_datetime` | string | ISO 8601 end timestamp |
| `intensity` | string | `easy`, `moderate`, `hard` |
| `label` | string | Custom name (nullable) |
| `source` | string | Data origin (`manual`, `autodetected`, `apple_health`, etc.) |
| `start_datetime` | string | ISO 8601 start timestamp |

**Prisma model:**

```prisma
model OuraWorkout {
  id             String   @id
  day            DateTime
  activity       String   // cycling, running, strength_training, etc.
  calories       Float?
  distance       Float?   // meters
  intensity      String?  // easy | moderate | hard
  label          String?  // custom name
  source         String?  // manual | autodetected | apple_health
  startedAt      DateTime
  endedAt        DateTime
  durationSeconds Int
  createdAt      DateTime @default(now())

  @@index([day])
}
```

**Note on Apple Watch overlap:** Oura's workout endpoint may include workouts synced from Apple Health (source = `apple_health`). The `HealthKitWorkout` model already captures Apple Watch workouts. To avoid duplication:
- If `source === "apple_health"`, skip — already captured via Health Auto Export
- Only ingest `source === "manual"` or `source === "autodetected"` (Oura-native workouts)

**Baseline usage:**
- Coach context: full workout history from both sources
- Activity card: show Oura-detected workouts (walks, cycling auto-detected by ring)
- Training intelligence: auto-detected activity feeds recovery model

**Priority:** MEDIUM — most workout data already comes from Apple Watch via Health Auto Export. Main value is auto-detected activities (walks, cycling) that Oura picks up when you're not wearing your watch.

---

### 4. Sessions (Meditation, Breathing, Naps)

**Oura endpoint:** `GET /v2/usercollection/session`
**Query params:** `start_date`, `end_date` (YYYY-MM-DD)
**Scope:** `session`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date (YYYY-MM-DD) |
| `start_datetime` | string | ISO 8601 |
| `end_datetime` | string | ISO 8601 |
| `type` | string | `breathing`, `meditation`, `nap`, `relaxation`, `rest`, `body_status` |
| `heart_rate` | object | `{ interval, items[], timestamp }` (nullable) |
| `heart_rate_variability` | object | `{ interval, items[], timestamp }` (nullable) |
| `mood` | string | Pre/post session mood (nullable) |
| `motion_count` | object | `{ interval, items[], timestamp }` |

**Prisma model:**

```prisma
model OuraSession {
  id              String   @id
  day             DateTime
  type            String   // breathing | meditation | nap | relaxation | rest | body_status
  startedAt       DateTime
  endedAt         DateTime
  durationSeconds Int
  avgHeartRate    Float?   // computed from heart_rate.items
  avgHrv          Float?   // computed from heart_rate_variability.items
  mood            String?
  createdAt       DateTime @default(now())

  @@index([day])
}
```

**HR/HRV extraction:** The `heart_rate` and `heart_rate_variability` objects contain `items` arrays (5-second interval samples). Compute averages on ingestion:

```typescript
function avgFromSamples(obj: { items: number[] } | null): number | null {
  if (!obj?.items?.length) return null;
  const valid = obj.items.filter(v => v > 0);
  if (!valid.length) return null;
  return Math.round(valid.reduce((s, v) => s + v, 0) / valid.length);
}
```

**Baseline usage:**
- Mind Mode: auto-tag meditation/breathing sessions (feeds correlation engine without manual logging)
- Coach context: "User did a 15-min breathing session at 2pm — HRV during session was 85ms"
- Experiment framework: auto-detect treatment days for breathing/meditation experiments
- Dashboard: show nap data alongside sleep scores

**Priority:** HIGH — sessions are the bridge between Mind Mode experiments and real data. Users doing breathing experiments in Oura get automatic treatment-day detection.

---

### 5. Sleep Time (Bedtime Recommendation)

**Oura endpoint:** `GET /v2/usercollection/sleep_time`
**Query params:** `start_date`, `end_date` (YYYY-MM-DD)
**Scope:** `daily`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date (YYYY-MM-DD) |
| `optimal_bedtime` | object | `{ day_tz, end_offset, start_offset }` |
| `recommendation` | string | `improve_efficiency`, `earlier_bedtime`, `later_bedtime`, `follow_optimal_bedtime` |
| `status` | string | `not_enough_nights`, `not_enough_recent_nights`, `bad_sleep_quality`, `only_recommended_found`, `optimal_found` |

**Interpretation:** `optimal_bedtime.start_offset` and `end_offset` are seconds from midnight in the user's timezone. For example, `start_offset: -3600` means 11:00 PM (1 hour before midnight), `end_offset: 1800` means 12:30 AM (30 min after midnight).

**Prisma model:**

```prisma
model SleepTimeRecommendation {
  id                    String   @id
  day                   DateTime @unique
  optimalBedtimeStart   Int?     // seconds from midnight (negative = before midnight)
  optimalBedtimeEnd     Int?     // seconds from midnight
  recommendation        String?  // improve_efficiency | earlier_bedtime | later_bedtime | follow_optimal_bedtime
  status                String?  // not_enough_nights | optimal_found | etc.
  createdAt             DateTime @default(now())
}
```

**Baseline usage:**
- Coach context: "Oura recommends going to bed between 10:30 PM and 11:15 PM tonight"
- Dashboard: show bedtime recommendation card
- Sleep insights: correlate actual bedtime vs recommended with next-day readiness

**Priority:** MEDIUM — nice coaching context, but not a primary biometric signal.

---

### 6. Daily Resilience

**Oura endpoint:** `GET /v2/usercollection/daily_resilience`
**Query params:** `start_date`, `end_date` (YYYY-MM-DD)
**Scope:** `daily`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date (YYYY-MM-DD) |
| `level` | string | `limited`, `adequate`, `solid`, `strong`, `exceptional` |
| `contributors` | object | `{ sleep_recovery, daytime_recovery, stress }` (each 0–100) |

**Note:** Requires Gen 3 ring. Not all users will have data.

**Prisma model:**

```prisma
model DailyResilience {
  id                String   @id
  day               DateTime @unique
  level             String   // limited | adequate | solid | strong | exceptional
  sleepRecovery     Int?     // 0-100
  daytimeRecovery   Int?     // 0-100
  stress            Int?     // 0-100
  createdAt         DateTime @default(now())
}
```

**Baseline usage:**
- Dashboard: resilience trend card alongside readiness
- Training intelligence: resilience level feeds deload detection (a week of "limited" = strong deload signal)
- Coach context: longitudinal fitness signal — more stable than daily readiness
- Baseline Score: potential future addition as a component

**Priority:** MEDIUM — valuable longitudinal signal but overlaps with readiness for daily decisions.

---

### 7. VO2 Max

**Oura endpoint:** `GET /v2/usercollection/vo2_max`
**Query params:** `start_date`, `end_date` (YYYY-MM-DD)
**Scope:** `daily`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `day` | string | Date (YYYY-MM-DD) |
| `timestamp` | string | ISO 8601 |
| `vo2_max` | float | Estimated VO2 max in mL/kg/min (nullable) |

**Note:** Updated periodically (not daily). Based on nighttime HRV and profile data. Estimate may be less accurate than a lab test or Apple Watch running test.

**Prisma model:**

```prisma
model DailyVO2Max {
  id        String   @id
  day       DateTime @unique
  vo2Max    Float?   // mL/kg/min
  createdAt DateTime @default(now())
}
```

**Baseline usage:**
- Dashboard: VO2 max trend card (show 90-day trend line)
- Coach context: aerobic capacity baseline, Hyrox race readiness
- Goals: auto-track VO2 max progress toward goal targets
- Training intelligence: declining VO2 max + high fatigue score = overtraining flag

**Priority:** HIGH — VO2 max is the single best predictor of all-cause mortality. Tracking the trend is essential for any serious fitness tool.

---

### 8. Personal Info

**Oura endpoint:** `GET /v2/usercollection/personal_info`
**Query params:** None
**Scope:** `personal`

**Response fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique record ID |
| `age` | int | Age in years |
| `weight` | float | Weight in kg |
| `height` | float | Height in meters |
| `biological_sex` | string | `male`, `female` |
| `email` | string | Email address |

**Note:** This is a single-document endpoint (not paginated). Returns the user's current profile, not a time series.

**No new Prisma model needed.** Map directly to existing `UserProfile`:

```typescript
// On first Oura connect or on demand
async function syncPersonalInfo(): Promise<void> {
  const info = await ouraFetch<OuraPersonalInfo>("personal_info", {});
  await prisma.userProfile.upsert({
    where: { id: 1 },
    update: {
      bodyWeightKg: info.weight ?? undefined,
      heightCm: info.height ? Math.round(info.height * 100) : undefined,
      age: info.age ?? undefined,
      sex: info.biological_sex ?? undefined,
    },
    create: {
      id: 1,
      bodyWeightKg: info.weight,
      heightCm: info.height ? Math.round(info.height * 100) : undefined,
      age: info.age,
      sex: info.biological_sex,
    },
  });
}
```

**Baseline usage:**
- Auto-populate UserProfile on first Oura connect (no manual data entry)
- Keep weight in sync (Oura may update from smart scale)
- Coach context: accurate age/sex/weight for protein targets, TDEE, training advice

**Priority:** MEDIUM — nice onboarding improvement, but only runs once (or on demand).

---

## Implementation Plan

### Phase 1: Data Models + Ingestion (sync.ts changes)

**Step 1: Prisma migration**

Add all 6 new models to `prisma/schema.prisma`:
- `DailySpO2`
- `OuraWorkout`
- `OuraSession`
- `SleepTimeRecommendation`
- `DailyResilience`
- `DailyVO2Max`

Modify existing model:
- `ActivityTag`: add `ouraTagId String? @unique` and `source String @default("manual")`

Run migration: `npx prisma migrate dev --name add-oura-expansion-models`

**Step 2: Update sync.ts**

Add 8 new sync functions following the existing pattern (try-catch per endpoint, error tracking, upsert by ID):

```typescript
// Add to syncOuraData() return type
export async function syncOuraData(lookbackDays = 7): Promise<{
  readiness: number;
  sleep: number;
  stress: number;
  heartrate: number;
  activity: number;
  // New
  spo2: number;
  tags: number;
  workouts: number;
  sessions: number;
  sleepTime: number;
  resilience: number;
  vo2max: number;
}> {
  // ... existing syncs ...

  // New syncs (each in try-catch)
  // syncSpO2(params)
  // syncEnhancedTags(params)
  // syncOuraWorkouts(params) — skip source=apple_health
  // syncSessions(params)
  // syncSleepTime(params)
  // syncResilience(params)
  // syncVO2Max(params)
}
```

**Step 3: Update Oura OAuth scopes**

In the Oura developer portal, update the app's requested scopes to include `spo2`, `workout`, `session`, `personal`.

Update the `scope` parameter in **both** OAuth route files:

- `src/app/api/auth/oura/route.ts` (redirect)
- `src/app/api/auth/oura/callback/route.ts` (token exchange)

```typescript
const scope = "daily heartrate spo2 workout session personal";
```

**Important:** Existing users will need to re-authenticate to grant the new scopes. Add a "reconnect" prompt if the sync returns 403 on new endpoints.

**Step 4: Personal Info sync**

Add a one-time sync of personal_info after OAuth callback (in the callback route handler):

```typescript
// In /api/auth/oura/callback/route.ts, after token exchange:
try {
  await syncPersonalInfo();
} catch (e) {
  console.error("Personal info sync failed:", e);
  // Non-blocking — don't fail the auth flow
}
```

### Phase 2: Coach Context Enrichment

**File:** `src/lib/coach-context.ts`

Add new queries to `buildCoachContext()` (within the existing `Promise.allSettled` block):

```typescript
// Add to the allSettled array:
prisma.dailySpO2.findMany({
  where: { day: { gte: sevenDaysAgo } },
  orderBy: { day: "desc" },
}),
prisma.ouraSession.findMany({
  where: { day: { gte: sevenDaysAgo } },
  orderBy: { startedAt: "desc" },
}),
prisma.dailyResilience.findMany({
  where: { day: { gte: sevenDaysAgo } },
  orderBy: { day: "desc" },
}),
prisma.dailyVO2Max.findMany({
  where: { day: { gte: thirtyDaysAgo } },
  orderBy: { day: "desc" },
  take: 10,
}),
prisma.sleepTimeRecommendation.findFirst({
  orderBy: { day: "desc" },
}),
```

Add new sections to the context string:

```
## SpO2 (Last 7 Days)
[day]: [avgSpO2]% [flag if <95%]

## Resilience (Last 7 Days)
[day]: [level] (sleep_recovery: [x], daytime_recovery: [y], stress: [z])

## VO2 Max Trend (Last 30 Days)
Latest: [value] mL/kg/min | 30-day change: [+/-delta]

## Recent Sessions
[date] [type] [duration] — avg HR [x], avg HRV [y]

## Bedtime Recommendation
Oura recommends: [start]–[end] | Status: [recommendation]
```

### Phase 3: Correlation Engine Updates

**File:** `src/lib/insights.ts`

The InsightsFeed already scans `ActivityTag` records. Since Enhanced Tags from Oura are ingested into `ActivityTag` with `source: "oura"`, they automatically participate in the correlation engine. No code changes needed — just data.

**Optional enhancement:** Add a filter toggle on InsightsFeed to show/hide Oura-sourced insights separately.

### Phase 4: Dashboard Components

**New components (create only if time permits — Coach context is the priority):**

1. **SpO2Card** — show latest SpO2, 7-day trend, flag if <95%
2. **ResilienceCard** — show today's level with color badge, contributor breakdown
3. **VO2MaxCard** — show latest value with 90-day trend line
4. **BedtimeCard** — show tonight's recommended bedtime window
5. **SessionsSummary** — show today's meditation/breathing sessions with HR/HRV

These are all "nice to have" display components. The real value is in the Coach context and correlation engine integration.

---

## Sync Error Handling

Follow the existing pattern in `sync.ts`:
- Each new endpoint sync is wrapped in its own try-catch
- Failures are tracked in the `errors` array
- SyncLog status reflects partial/failed states
- New endpoints failing shouldn't block existing syncs

**Scope-related 403 errors:**
If a user authenticated before the scope expansion, the new endpoints will return 403. Handle this:

```typescript
if (res.status === 403) {
  // User hasn't granted this scope — skip silently, don't count as error
  console.warn(`Oura ${endpoint}: 403 — scope not granted. User needs to re-authenticate.`);
  return { data: [] }; // Return empty, don't add to errors
}
```

Add a flag to the sync response: `needsReauth: boolean` — if any endpoint returns 403, set this to true. The frontend can show a "Reconnect Oura to enable SpO2, tags, and more" banner.

---

## Data Volume Estimates

| Endpoint | Records/day | Payload size | Notes |
|---|---|---|---|
| daily_spo2 | 1 | ~100 bytes | One record per night |
| enhanced_tag | 0–5 | ~200 bytes each | Depends on user tagging habits |
| workout | 0–2 | ~300 bytes each | Only Oura-native, skip Apple Health |
| session | 0–3 | ~500 bytes each | Meditation/breathing sessions |
| sleep_time | 1 | ~150 bytes | One recommendation per day |
| daily_resilience | 1 | ~150 bytes | One record per day |
| vo2_max | 0–1 | ~100 bytes | Not updated daily |
| personal_info | 0 | ~200 bytes | Only on auth, not daily sync |

**Total additional requests per sync:** +7 (one per endpoint)
**Total requests per daily sync:** ~12 (existing 5 + new 7)
**Still well within rate limit:** 5,000 per 5-minute window

---

## Migration Path for Existing Users

1. Run `npx prisma migrate dev --name add-oura-expansion-models`
2. Update `.env` — no new env vars needed (uses existing Oura credentials)
3. Update Oura app scopes in developer portal
4. User re-authenticates via "Connect Oura" flow (grants new scopes)
5. First sync after re-auth backfills all new endpoints (default 7-day lookback)
6. Personal Info auto-populates UserProfile

**No breaking changes** to existing data or endpoints. All new sync functions are additive.

---

## Testing Checklist

- [ ] Prisma migration runs cleanly
- [ ] Each new sync function handles empty data (new user, no history)
- [ ] Each new sync function handles null/missing fields
- [ ] Enhanced Tags correctly map to ActivityTag with dedup
- [ ] Oura Workouts skip `source: "apple_health"` records
- [ ] Session HR/HRV averages compute correctly from sample arrays
- [ ] Sleep Time offset-to-time conversion works (negative = before midnight)
- [ ] Personal Info upsert doesn't overwrite manually-set UserProfile fields
- [ ] 403 scope errors handled silently with reauth flag
- [ ] SyncLog accurately reflects partial status with new endpoints
- [ ] Coach context includes new data sections
- [ ] Correlation engine picks up Oura-sourced ActivityTags

---

## Implementation Prompt

Copy-paste this prompt into a Claude coding session to implement the expansion:

```
I'm expanding my Oura API sync to pull additional V2 endpoints. The spec is at docs/oura-sync-expansion-spec.md. Current sync code is in src/lib/sync.ts and src/lib/oura.ts. Schema is in prisma/schema.prisma.

Do the following in order:

1. Read docs/oura-sync-expansion-spec.md thoroughly
2. Read the current src/lib/sync.ts, src/lib/oura.ts, and prisma/schema.prisma
3. Add the 6 new Prisma models (DailySpO2, OuraWorkout, OuraSession, SleepTimeRecommendation, DailyResilience, DailyVO2Max)
4. Add ouraTagId (String? @unique) and source (String @default("manual")) fields to the ActivityTag model
5. Run prisma migrate dev --name add-oura-expansion-models
6. Add 7 new sync functions to sync.ts following the existing pattern (try-catch per endpoint, upsert by ID, error tracking):
   - syncSpO2
   - syncEnhancedTags (map to ActivityTag using TAG_MAP from spec, skip if ouraTagId already exists)
   - syncOuraWorkouts (skip records where source === "apple_health")
   - syncSessions (compute avg HR and HRV from sample arrays)
   - syncSleepTime (store start_offset and end_offset as integers)
   - syncResilience
   - syncVO2Max
7. Add all 7 to the main syncOuraData() function with individual try-catch blocks
8. Handle 403 (scope not granted) by returning empty data and setting a needsReauth flag
9. Update the SyncLog details to include counts for all new endpoints
10. Update src/lib/coach-context.ts to query and include the new data (SpO2, resilience, VO2 max, sessions, bedtime rec)
11. Add syncPersonalInfo() function that maps Oura personal_info to UserProfile upsert
12. Update the OAuth scope string in BOTH auth routes (src/app/api/auth/oura/route.ts AND src/app/api/auth/oura/callback/route.ts) to include: "daily heartrate spo2 workout session personal"
13. Run npx tsc --noEmit to verify no type errors
14. Update docs/task-tracker.md to add an "Oura Sync Expansion" section under Phase 2b

Important:
- Don't create new dashboard components yet — just data ingestion + coach context
- Follow existing code patterns (apiError, dateStrToUTC, safeJsonParse)
- Each new sync must be independently failable — don't let one crash the others
- ActivityTag source field: existing tags stay "manual", HealthKit tags stay "healthkit", new Oura tags get "oura"
```

---

## References

- [Oura API V2 Docs](https://cloud.ouraring.com/v2/docs)
- [Oura Developer Portal](https://cloud.ouraring.com/oauth/applications)
- [oura-ring Python client (hedgertronic)](https://github.com/hedgertronic/oura-ring)
- [@pinta365/oura-api TypeScript client](https://jsr.io/@pinta365/oura-api/doc)
