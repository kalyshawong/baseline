# HealthKit Sync Spec — Apple Watch Integration via Health Auto Export

**Version:** 0.1
**Author:** Kalysha
**Last Updated:** 2026-04-06
**Status:** Draft
**Depends on:** Phase 1 (Oura sync, Baseline Score), Phase 2b (Body Mode, Weight Tracking)
**Cost:** $4.99 (Health Auto Export app, one-time purchase)

---

## Problem Statement

Baseline currently relies on Oura Ring as its sole biometric data source. But Oura doesn't capture workout heart rate zones, real-time exercise data, or menstrual cycle tracking. The Apple Watch — which Kalysha already owns — collects all of this through Apple HealthKit, but HealthKit has no web API. Data is locked on the iPhone.

Health Auto Export ($4.99, iOS) bridges this gap by reading HealthKit data and POSTing it as JSON to any webhook URL on a configurable schedule (every 5–6 minutes minimum). This lets Baseline ingest Apple Watch data without building a native iOS app.

---

## Goals

1. **Ingest Apple Watch workout data** — heart rate zones, duration, calories, distance — to supplement Oura's activity data and provide richer Body Mode context
2. **Auto-sync menstrual cycle data** — replace (or augment) the manual cycle phase selector with HealthKit-sourced cycle tracking
3. **Capture intraday heart rate** — resting HR, workout HR, and recovery HR trends beyond what Oura provides
4. **Unify biometric data** — all data flows into the same Prisma models, same dashboard, same coach context, regardless of source

---

## Non-Goals

- **Real-time streaming during workouts** — Health Auto Export polls on a schedule (5+ min), so live mid-set HR feedback is out of scope. The Apple Watch screen already shows this.
- **Replacing Oura** — Oura remains the primary source for readiness, sleep quality, HRV, and temperature deviation. Apple Watch data supplements, not replaces.
- **HealthKit write-back** — we're read-only. Baseline won't push data back to Apple Health.
- **Building a native iOS app** — the whole point of this approach is to avoid that.
- **GPS route tracking** — Health Auto Export can export workout routes, but Baseline doesn't need maps.

---

## How Health Auto Export Works

1. User installs the app from the App Store ($4.99)
2. App requests HealthKit permissions on the iPhone
3. User creates a "REST API Automation" pointing at Baseline's webhook URL
4. App sends HTTP POST requests with JSON payloads on a schedule
5. Baseline receives, parses, and stores the data

### JSON Payload Format

Health Auto Export sends this envelope:

```json
{
  "data": {
    "metrics": [],
    "workouts": [],
    "cycleTracking": [],
    "symptoms": [],
    "medications": [],
    "stateOfMind": [],
    "ecg": [],
    "heartRateNotifications": []
  }
}
```

We care about three arrays: `metrics`, `workouts`, and `cycleTracking`.

### Metrics Format

Each metric in the `metrics` array:

```json
{
  "name": "heart_rate",
  "units": "bpm",
  "data": [
    { "date": "2026-04-06T14:30:00-07:00", "qty": 72 },
    { "date": "2026-04-06T14:35:00-07:00", "qty": 68 }
  ]
}
```

Heart rate has a special format with Min/Avg/Max:

```json
{
  "name": "heart_rate",
  "units": "bpm",
  "data": [
    { "date": "2026-04-06T14:30:00-07:00", "Min": 62, "Avg": 72, "Max": 85 }
  ]
}
```

Sleep (aggregated):

```json
{
  "name": "sleep_analysis",
  "data": [
    {
      "date": "2026-04-06",
      "asleep": 420,
      "core": 240,
      "deep": 60,
      "rem": 90,
      "inBed": 480,
      "sleepStart": "2026-04-05T23:15:00-07:00",
      "sleepEnd": "2026-04-06T06:15:00-07:00"
    }
  ]
}
```

### Workouts Format (v2)

```json
{
  "id": "abc123",
  "name": "Traditional Strength Training",
  "start": "2026-04-06T17:00:00-07:00",
  "end": "2026-04-06T18:15:00-07:00",
  "duration": 4500,
  "activeEnergyBurned": { "qty": 350, "units": "kcal" },
  "distance": { "qty": 0, "units": "km" },
  "heartRate": {
    "data": [
      { "date": "2026-04-06T17:00:00-07:00", "Min": 85, "Avg": 120, "Max": 165 }
    ]
  }
}
```

### Cycle Tracking Format

```json
{
  "cycleTracking": [
    {
      "date": "2026-04-06",
      "menstrualFlow": "light",
      "cervicalMucusQuality": "dry",
      "ovulationTestResult": "negative"
    }
  ]
}
```

---

## Data Model Changes

### New Model: HealthKitSync

```prisma
model HealthKitSync {
  id        String   @id @default(cuid())
  syncedAt  DateTime @default(now())
  source    String   @default("health-auto-export")
  status    String   // success | partial | failed
  details   String?  // error details or summary
  metrics   Int      @default(0)  // count of metric data points ingested
  workouts  Int      @default(0)  // count of workouts ingested
}
```

### New Model: HealthKitWorkout

```prisma
model HealthKitWorkout {
  id                String   @id @default(cuid())
  externalId        String   @unique  // Health Auto Export's workout ID
  name              String   // "Traditional Strength Training", "Running", etc.
  startedAt         DateTime
  endedAt           DateTime
  durationSeconds   Int
  activeCalories    Float?
  distance          Float?   // km
  distanceUnit      String?  // km | mi
  avgHeartRate      Int?
  maxHeartRate      Int?
  minHeartRate      Int?
  source            String   @default("apple-watch")
  createdAt         DateTime @default(now())
}
```

### New Model: HeartRateZone (derived, computed on ingestion)

```prisma
model HeartRateZoneSummary {
  id            String   @id @default(cuid())
  workoutId     String?  // FK to HealthKitWorkout (null for resting)
  date          DateTime
  zone1Minutes  Float    @default(0)  // <60% max HR (recovery)
  zone2Minutes  Float    @default(0)  // 60-70% (fat burn)
  zone3Minutes  Float    @default(0)  // 70-80% (cardio)
  zone4Minutes  Float    @default(0)  // 80-90% (threshold)
  zone5Minutes  Float    @default(0)  // 90%+ (peak)
  createdAt     DateTime @default(now())
}
```

### Extend Existing Models

**CyclePhaseLog** — add source support:

```prisma
// Already has: date, phase, source
// source enum gets new value: "healthkit"
// When HealthKit cycle data arrives, upsert CyclePhaseLog with source="healthkit"
// Manual entries (source="manual") take priority if same date has both
```

**HeartRateSample** — already exists, reuse it:

```prisma
// Already has: bpm, source, timestamp
// Add source="apple-watch" alongside existing source="oura"
// Unique constraint on (timestamp, source) prevents duplicates
```

**DailyActivity** — extend with Apple Watch data:

```prisma
// Already has: steps, activeCalories, totalCalories
// Apple Watch provides more accurate active calories during workouts
// Strategy: if both Oura and Apple Watch report for same day, prefer Apple Watch
//   for activeCalories and steps (it has the wrist accelerometer advantage)
```

---

## API Design

### POST /api/healthkit-sync

The webhook endpoint that Health Auto Export hits.

```typescript
// src/app/api/healthkit-sync/route.ts

export async function POST(request: Request) {
  // 1. Authenticate — Bearer token (reuse SENSOR_API_KEY or add HEALTHKIT_SYNC_KEY)
  const authHeader = request.headers.get("authorization");
  const expectedKey = process.env.HEALTHKIT_SYNC_KEY;
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse the Health Auto Export payload
  const body = await request.json();
  const { data } = body;
  // data.metrics, data.workouts, data.cycleTracking

  // 3. Process metrics (heart rate, steps, sleep, etc.)
  const metricsCount = await processMetrics(data.metrics || []);

  // 4. Process workouts
  const workoutsCount = await processWorkouts(data.workouts || []);

  // 5. Process cycle tracking
  const cycleCount = await processCycleTracking(data.cycleTracking || []);

  // 6. Log the sync
  await prisma.healthKitSync.create({
    data: {
      status: "success",
      metrics: metricsCount,
      workouts: workoutsCount,
      details: `${metricsCount} metrics, ${workoutsCount} workouts, ${cycleCount} cycle entries`
    }
  });

  return Response.json({ ok: true, metrics: metricsCount, workouts: workoutsCount });
}
```

### GET /api/healthkit-sync

Check sync status and history.

```typescript
export async function GET() {
  const syncs = await prisma.healthKitSync.findMany({
    orderBy: { syncedAt: "desc" },
    take: 20
  });
  return Response.json(syncs);
}
```

### GET /api/workouts/apple-watch

List Apple Watch workouts (separate from Baseline-logged workouts).

```typescript
export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") || "30");
  const since = new Date();
  since.setDate(since.getDate() - days);

  const workouts = await prisma.healthKitWorkout.findMany({
    where: { startedAt: { gte: since } },
    orderBy: { startedAt: "desc" }
  });
  return Response.json(workouts);
}
```

---

## Processing Logic

### processMetrics()

```typescript
async function processMetrics(metrics: any[]): Promise<number> {
  let count = 0;

  for (const metric of metrics) {
    switch (metric.name) {
      case "heart_rate":
        // Upsert HeartRateSample with source="apple-watch"
        for (const d of metric.data) {
          const bpm = d.Avg || d.qty;
          const timestamp = new Date(d.date);
          await prisma.heartRateSample.upsert({
            where: { timestamp_source: { timestamp, source: "apple-watch" } },
            update: { bpm },
            create: { bpm, source: "apple-watch", timestamp }
          });
          count++;
        }
        break;

      case "resting_heart_rate":
        // Store as HeartRateSample with source="apple-watch-resting"
        // Useful for comparing Oura resting HR vs Apple Watch
        for (const d of metric.data) {
          await prisma.heartRateSample.upsert({
            where: { timestamp_source: { timestamp: new Date(d.date), source: "apple-watch-resting" } },
            update: { bpm: d.qty },
            create: { bpm: d.qty, source: "apple-watch-resting", timestamp: new Date(d.date) }
          });
          count++;
        }
        break;

      case "step_count":
        // Upsert DailyActivity steps — prefer Apple Watch over Oura
        for (const d of metric.data) {
          const day = d.date.substring(0, 10); // YYYY-MM-DD
          await prisma.dailyActivity.upsert({
            where: { day },
            update: { steps: Math.round(d.qty) },
            create: { day, steps: Math.round(d.qty) }
          });
          count++;
        }
        break;

      case "active_energy":
        // Upsert DailyActivity activeCalories
        for (const d of metric.data) {
          const day = d.date.substring(0, 10);
          await prisma.dailyActivity.upsert({
            where: { day },
            update: { activeCalories: Math.round(d.qty) },
            create: { day, activeCalories: Math.round(d.qty) }
          });
          count++;
        }
        break;

      case "sleep_analysis":
        // Don't overwrite Oura sleep data (Oura is better for sleep)
        // But store Apple Watch sleep as a secondary source for comparison
        // Could be useful if user doesn't wear Oura one night
        break;

      case "weight_body_mass":
        // Auto-log weight from Apple Health scale syncs
        for (const d of metric.data) {
          const day = d.date.substring(0, 10);
          await prisma.weightLog.upsert({
            where: { day },
            update: { weightKg: d.qty },
            create: { day, weightKg: d.qty }
          });
          count++;
        }
        break;

      case "body_fat_percentage":
        for (const d of metric.data) {
          const day = d.date.substring(0, 10);
          await prisma.weightLog.upsert({
            where: { day },
            update: { bodyFatPct: d.qty },
            create: { day, weightKg: 0, bodyFatPct: d.qty } // weightKg=0 as placeholder
          });
          count++;
        }
        break;

      // Ignore other metrics for now — can add more later
      default:
        break;
    }
  }

  return count;
}
```

### processWorkouts()

```typescript
async function processWorkouts(workouts: any[]): Promise<number> {
  let count = 0;

  for (const w of workouts) {
    await prisma.healthKitWorkout.upsert({
      where: { externalId: w.id },
      update: {
        name: w.name,
        startedAt: new Date(w.start),
        endedAt: new Date(w.end),
        durationSeconds: Math.round(w.duration),
        activeCalories: w.activeEnergyBurned?.qty || null,
        distance: w.distance?.qty || null,
        distanceUnit: w.distance?.units || null,
        avgHeartRate: w.heartRate?.data?.[0]?.Avg || null,
        maxHeartRate: w.heartRate?.data?.[0]?.Max || null,
        minHeartRate: w.heartRate?.data?.[0]?.Min || null,
      },
      create: {
        externalId: w.id,
        name: w.name,
        startedAt: new Date(w.start),
        endedAt: new Date(w.end),
        durationSeconds: Math.round(w.duration),
        activeCalories: w.activeEnergyBurned?.qty || null,
        distance: w.distance?.qty || null,
        distanceUnit: w.distance?.units || null,
        avgHeartRate: w.heartRate?.data?.[0]?.Avg || null,
        maxHeartRate: w.heartRate?.data?.[0]?.Max || null,
        minHeartRate: w.heartRate?.data?.[0]?.Min || null,
      }
    });
    count++;
  }

  return count;
}
```

### processCycleTracking()

```typescript
async function processCycleTracking(entries: any[]): Promise<number> {
  let count = 0;

  for (const entry of entries) {
    const day = entry.date;
    const flow = entry.menstrualFlow; // "light" | "medium" | "heavy" | "none" | null

    // Map HealthKit flow data to Baseline cycle phases
    // This is a rough mapping — menstrual flow = menstrual phase
    // For follicular/ovulation/luteal, we need ovulation test results or temp data
    let phase: string | null = null;

    if (flow && flow !== "none") {
      phase = "menstrual";
    } else if (entry.ovulationTestResult === "positive" || entry.ovulationTestResult === "luteinizing_hormone_surge") {
      phase = "ovulation";
    }
    // For follicular and luteal, rely on the existing Oura temp-based algorithm
    // or manual input — HealthKit flow data alone can't distinguish these phases

    if (phase) {
      await prisma.cyclePhaseLog.upsert({
        where: { day },
        update: { phase, source: "healthkit" },
        create: { day, phase, source: "healthkit" }
      });
      count++;
    }
  }

  return count;
}
```

---

## Data Source Priority

When Oura and Apple Watch both report the same metric for the same day, which wins?

| Metric | Primary Source | Rationale |
|---|---|---|
| Readiness score | Oura | Apple Watch doesn't have a readiness score |
| Sleep quality/stages | Oura | Oura's ring-based sleep tracking is more accurate than wrist-based |
| HRV | Oura | Oura measures HRV during sleep (gold standard for resting HRV) |
| Temperature deviation | Oura | Only Oura measures skin temperature during sleep |
| Resting heart rate | Oura | Measured during sleep — more reliable baseline |
| Workout heart rate | Apple Watch | Oura doesn't have a real-time workout HR sensor |
| Active calories | Apple Watch | Wrist accelerometer + HR gives better exercise calorie estimates |
| Steps | Apple Watch | Wrist-worn is more accurate than ring for step counting |
| Menstrual cycle | HealthKit (manual wins) | If user logs manually in Baseline, that takes priority. HealthKit is fallback. |
| Weight / body fat | HealthKit | Synced from smart scales (Withings, etc.) through Apple Health |

Implementation: each processing function checks if a higher-priority source already has data for that day before overwriting.

---

## UI Changes

### Dashboard — Apple Watch Status Card

Small card showing:
- Last HealthKit sync time
- Today's Apple Watch workout (if any) with HR summary
- Sync status (green check / yellow warning / red error)

### Body Mode — Workout HR Overlay

When viewing a Baseline-logged workout, check if there's an Apple Watch workout that overlaps in time. If so, show the heart rate data alongside the set-by-set log:

```
Bench Press   Set 1: 80kg × 8 @ RPE 7     HR: 135 bpm
              Set 2: 80kg × 8 @ RPE 8     HR: 142 bpm
              Set 3: 80kg × 6 @ RPE 9     HR: 155 bpm
```

### Dashboard — Cycle Phase Source Indicator

Show where the current cycle phase data is coming from:
- 📱 = HealthKit (auto-synced)
- ✋ = Manual (user-selected)
- 🔄 = Both agree
- ⚠️ = Conflict (manual says follicular, HealthKit shows menstrual flow)

### Coach Context — Enriched

Add Apple Watch data to the coach context builder:
- Today's workout HR zones
- Weekly Apple Watch workout count and type
- Step trend (Apple Watch, more accurate)
- Cycle data source and confidence

---

## Health Auto Export App Setup (User Instructions)

These are the steps Kalysha follows in the iOS app:

1. Download "Health Auto Export - JSON+CSV" from the App Store ($4.99)
2. Open the app → grant HealthKit permissions for: heart rate, workouts, steps, active energy, menstrual cycle, weight, body fat
3. Go to **Automations** → **Create Automation** → **REST API**
4. Enter:
   - **URL:** `http://YOUR_LOCAL_IP:3000/api/healthkit-sync`
   - **Method:** POST
   - **Headers:** `Authorization: Bearer YOUR_HEALTHKIT_SYNC_KEY`
   - **Format:** JSON
   - **Data types:** Heart Rate, Resting Heart Rate, Steps, Active Energy, Workouts, Menstrual Flow, Ovulation Test Result, Weight, Body Fat Percentage
   - **Sync interval:** Every 6 minutes (minimum) or every 30 minutes (lower battery impact)
   - **Aggregation:** By minute for heart rate, by day for everything else
5. Test: tap "Run Now" and check Baseline dashboard for the sync status card

---

## Environment Variables

```env
# Add to .env
HEALTHKIT_SYNC_KEY=generate-a-random-string-here
```

---

## Implementation Prompt (for Claude)

> Point at ~/projects/baseline. Read docs/healthkit-sync-spec.md. Implement the HealthKit sync feature:
>
> 1. Add the Prisma models: HealthKitSync, HealthKitWorkout, HeartRateZoneSummary. Extend CyclePhaseLog source to include "healthkit". Add unique constraint to HeartRateSample on (timestamp, source) if not already there. Run migration.
> 2. Create `/api/healthkit-sync` POST endpoint — parse the Health Auto Export JSON envelope, process metrics/workouts/cycleTracking using the logic in the spec. Add Bearer auth with HEALTHKIT_SYNC_KEY. Log every sync to HealthKitSync.
> 3. Create `/api/healthkit-sync` GET endpoint — return recent sync history.
> 4. Create `/api/workouts/apple-watch` GET endpoint — list Apple Watch workouts.
> 5. Add a small HealthKit sync status card to the dashboard (last sync time, today's Apple Watch workout summary).
> 6. Update `src/lib/coach-context.ts` to include Apple Watch workout data and HealthKit cycle data in the coach context.
> 7. Add HEALTHKIT_SYNC_KEY to .env.example.
> 8. Run type check and build. Update task-tracker.md. Commit.

---

## Open Questions

- **Duplicate detection:** If Health Auto Export sends the same data twice (e.g., on retry), the upsert pattern handles it. But if the user changes time zones, timestamps might shift — need to test this.
- **Battery impact:** Every-6-minute sync on iPhone may drain battery. Recommend starting with 30-minute interval and only moving to 6-minute if the delay is annoying.
- **Local network access:** The iPhone and the laptop running Baseline must be on the same WiFi network. If Baseline is deployed to a VPS later, this becomes a public endpoint and needs rate limiting + IP allowlisting.
- **Sleep data overlap:** Both Oura and Apple Watch report sleep. Current plan is to ignore Apple Watch sleep since Oura is better. But if the user forgets to wear the Oura one night, should we fall back to Apple Watch sleep? (Probably yes — implement later.)

---

## Success Metrics

| Metric | Target |
|---|---|
| Webhook receives data from Health Auto Export | Within first setup session |
| Apple Watch workout HR appears on dashboard | Same day |
| Cycle phase auto-populates from HealthKit | Within first menstrual cycle after setup |
| Coach references Apple Watch data in responses | Immediately after first sync |
| No duplicate data (Oura + Apple Watch conflict) | Zero duplicates after 7 days of dual-source sync |
