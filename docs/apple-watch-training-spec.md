# Apple Watch Training Metrics — Spec & Dashboard Reorganization

**Version:** 0.1 (Draft)
**Date:** 2026-04-09
**Status:** Ready for Implementation
**Depends on:** HealthKit Sync (`docs/healthkit-sync-spec.md`), Oura Sync Expansion (`docs/oura-sync-expansion-spec.md`)

---

## Problem Statement

Baseline's dashboard has become overcrowded after the Oura sync expansion added SpO2, Resilience, VO2 Max, Sessions, and Bedtime Recommendation cards. Adding 10 more Apple Watch training metrics would make it unusable. The dashboard needs to be a clean daily snapshot ("How am I today?"), while Body mode needs to evolve into a proper training analytics hub for strength, Hyrox, and running.

Additionally, VO2 Max was incorrectly sourced from Oura (which returns 404). It comes from Apple Watch via Health Auto Export and needs to be rerouted.

## Goals

1. Ingest 10 new Apple Watch metrics via Health Auto Export
2. Reorganize Dashboard → clean daily vitals only
3. Expand Body mode → full training analytics with running section
4. Fix VO2 Max data source (Apple Watch, not Oura)
5. Feed new running/training data into Coach context
6. Weight and sleep breakdown appear on both Dashboard and Body mode

## Non-Goals

- Per-run session breakdown (future — start with daily aggregates)
- Running plan generator (future — Coach can advise based on data)
- Apple Watch GPS/route mapping
- Replacing Oura data with Apple Watch equivalents

---

## New Apple Watch Metrics

### Metrics to Add in Health Auto Export

| # | Metric | Training Value | Unit |
|---|---|---|---|
| 1 | Running Speed | Pace trends, race prediction | km/h or m/s |
| 2 | Running Power | Effort metric independent of terrain (Hyrox) | watts |
| 3 | Ground Contact Time | Running economy / form efficiency | milliseconds |
| 4 | Vertical Oscillation | Running economy indicator (lower = better) | cm |
| 5 | Running Stride Length | Form tracking, fatigue detection | cm or meters |
| 6 | VO2 Max (Cardio Fitness) | Aerobic capacity, all-cause mortality predictor | mL/kg/min |
| 7 | Cardio Recovery | Post-workout HR recovery rate (fitness signal) | BPM drop |
| 8 | Walking + Running Distance | Daily activity volume | meters or km |
| 9 | Respiratory Rate | Sleep quality + cardio stress signal | breaths/min |
| 10 | Physical Effort | Auto-detected exertion (Apple watchOS 11+) | score 1-10 |

### Metric Name Discovery

**IMPORTANT:** Before implementing, the exact metric names must be discovered. Health Auto Export sends metric names in its JSON payload, but the format isn't documented. The console.log at line 46 of `src/app/api/healthkit-sync/route.ts` will capture the names.

**Steps:**
1. Open Health Auto Export on iPhone
2. Go to Health Metrics automation
3. Add all 10 metrics above to the data types
4. Hit "Sync Now"
5. Check terminal (`npm run dev`) for `[HealthKit] metric name received:` lines
6. Record exact names and update the `case` statements below

**Expected names** (based on Health Auto Export conventions):
- `running_speed` or `running_walking_speed`
- `running_power`
- `ground_contact_time`
- `vertical_oscillation`
- `running_stride_length` or `stride_length`
- `vo2_max` or `cardio_fitness`
- `cardio_recovery` or `heart_rate_recovery`
- `walking_running_distance` or `distance_walking_running`
- `respiratory_rate`
- `physical_effort` or `apple_exercise_time`

---

## Prisma Model

**File:** `prisma/schema.prisma`

```prisma
model DailyRunningMetrics {
  id                     String   @id @default(cuid())
  day                    DateTime @unique
  runningSpeed           Float?   // avg km/h
  runningPower           Float?   // avg watts
  groundContactTime      Float?   // avg milliseconds
  verticalOscillation    Float?   // avg cm
  strideLength           Float?   // avg meters
  cardioRecovery         Float?   // HR recovery metric (BPM drop post-workout)
  walkingRunningDistance  Float?   // total meters
  respiratoryRate        Float?   // breaths per minute
  physicalEffort         Float?   // Apple effort score
  createdAt              DateTime @default(now())

  @@index([day])
}
```

**VO2 Max:** Already has `DailyVO2Max` model from Oura expansion. Reuse it — just source from Apple Watch instead of Oura.

Run: `npx prisma migrate dev --name add-running-metrics`

---

## HealthKit Sync Changes

**File:** `src/app/api/healthkit-sync/route.ts`

Add new cases to `processMetrics()` switch block. Each follows the existing upsert pattern:

```typescript
// NOTE: Replace metric names with actual names from console.log discovery

case "RUNNING_SPEED_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { runningSpeed: val },
      create: { day, runningSpeed: val },
    });
    count++;
  }
  break;

case "RUNNING_POWER_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { runningPower: val },
      create: { day, runningPower: val },
    });
    count++;
  }
  break;

case "GROUND_CONTACT_TIME_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { groundContactTime: val },
      create: { day, groundContactTime: val },
    });
    count++;
  }
  break;

case "VERTICAL_OSCILLATION_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { verticalOscillation: val },
      create: { day, verticalOscillation: val },
    });
    count++;
  }
  break;

case "STRIDE_LENGTH_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { strideLength: val },
      create: { day, strideLength: val },
    });
    count++;
  }
  break;

case "VO2_MAX_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyVO2Max.upsert({
      where: { day },
      update: { vo2Max: val },
      create: { day, vo2Max: val },
    });
    count++;
  }
  break;

case "CARDIO_RECOVERY_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { cardioRecovery: val },
      create: { day, cardioRecovery: val },
    });
    count++;
  }
  break;

case "WALKING_RUNNING_DISTANCE_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { walkingRunningDistance: val },
      create: { day, walkingRunningDistance: val },
    });
    count++;
  }
  break;

case "RESPIRATORY_RATE_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { respiratoryRate: val },
      create: { day, respiratoryRate: val },
    });
    count++;
  }
  break;

case "PHYSICAL_EFFORT_NAME_TBD":
  for (const d of metric.data) {
    const val = d.Avg ?? d.qty;
    if (!val || !d.date) continue;
    const day = dateStrToUTC(d.date.substring(0, 10));
    await prisma.dailyRunningMetrics.upsert({
      where: { day },
      update: { physicalEffort: val },
      create: { day, physicalEffort: val },
    });
    count++;
  }
  break;
```

### Fix Oura VO2 Max (404)

**File:** `src/lib/sync.ts`

Comment out the `syncVO2Max()` call in `syncOuraData()`:

```typescript
// VO2 Max comes from Apple Watch via Health Auto Export, not Oura
// syncVO2Max(params) — Oura returns 404 for this endpoint
```

---

## Dashboard Reorganization

**File:** `src/app/page.tsx`

### Remove from Dashboard

1. **VO2 Max card** — training metric, moves to Body mode only
2. **WeightTrendChart** — full trend chart moves to Body mode
3. **WeightGoalSettings** — profile settings move to Body mode

### Keep on Dashboard

Everything else stays, including:
- Compact weight section (WeightCard + WeightInput only)
- Sleep Breakdown
- Bedtime Recommendation
- TDEE Card
- All 6 MetricCards (Readiness, Sleep, HRV, Stress, SpO2, Resilience)

---

## Body Mode Expansion

**File:** `src/app/body/page.tsx`

### New Layout (5 sections)

```
┌─────────────────────────────────────────────────┐
│  BODY MODE — Science-backed training intelligence│
│  [Start Workout]                                 │
├─────────────────────────────────────────────────┤
│  SECTION 1: COMPOSITION & ENERGY                 │
│  ┌──────────────┬──────────────────────────────┐ │
│  │ Weight Card  │ Weight Input                  │ │
│  ├──────────────┴──────────────────────────────┤ │
│  │ Weight Trend Chart (30-day + 7-day MA)      │ │
│  ├─────────────────────────────────────────────┤ │
│  │ Weight Goal Settings                         │ │
│  │ TDEE Card                                    │ │
│  └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  SECTION 2: TRAINING READINESS (existing)        │
│  Readiness Tier · Cycle Phase · Fatigue Signal   │
├─────────────────────────────────────────────────┤
│  SECTION 3: RUNNING & CARDIO (NEW)               │
│  ┌──────────────┬──────────────┬──────────────┐ │
│  │ Running Speed│ Running Power│ VO2 Max      │ │
│  ├──────────────┼──────────────┼──────────────┤ │
│  │ Ground       │ Vertical     │ Stride       │ │
│  │ Contact Time │ Oscillation  │ Length       │ │
│  ├──────────────┼──────────────┼──────────────┤ │
│  │ Cardio       │ Physical     │ Distance     │ │
│  │ Recovery     │ Effort       │ (walk+run)   │ │
│  ├──────────────┴──────────────┴──────────────┤ │
│  │ Respiratory Rate                            │ │
│  └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  SECTION 4: STRENGTH TRAINING (existing)         │
│  Volume Zones · Recent PRs · Recent Workouts     │
├─────────────────────────────────────────────────┤
│  SECTION 5: RECOVERY (existing + moved)          │
│  Sleep Breakdown · Bedtime Rec · Nutrition Check  │
│  Trend Charts (HRV, RHR, Sleep, Volume)          │
└─────────────────────────────────────────────────┘
```

### New Component

**File:** `src/components/body/running-metrics-card.tsx`

Server component that receives running metrics as props. Displays a 3-column grid of MetricCards for each running metric. Uses the existing `MetricCard` component from `src/components/dashboard/metric-card.tsx`.

```tsx
import { MetricCard } from "@/components/dashboard/metric-card";

interface RunningMetricsCardProps {
  metrics: {
    runningSpeed: number | null;
    runningPower: number | null;
    groundContactTime: number | null;
    verticalOscillation: number | null;
    strideLength: number | null;
    cardioRecovery: number | null;
    walkingRunningDistance: number | null;
    respiratoryRate: number | null;
    physicalEffort: number | null;
  } | null;
  vo2Max: number | null;
  vo2MaxDate: string | null;
}

export function RunningMetricsCard({ metrics, vo2Max, vo2MaxDate }: RunningMetricsCardProps) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        Running & Cardio
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard
          label="Running Speed"
          value={metrics?.runningSpeed?.toFixed(1) ?? null}
          unit="km/h"
        />
        <MetricCard
          label="Running Power"
          value={metrics?.runningPower ? Math.round(metrics.runningPower) : null}
          unit="W"
        />
        <MetricCard
          label="VO2 Max"
          value={vo2Max?.toFixed(1) ?? null}
          unit="mL/kg/min"
          detail={vo2MaxDate ?? undefined}
        />
        <MetricCard
          label="Ground Contact"
          value={metrics?.groundContactTime ? Math.round(metrics.groundContactTime) : null}
          unit="ms"
        />
        <MetricCard
          label="Vert. Oscillation"
          value={metrics?.verticalOscillation?.toFixed(1) ?? null}
          unit="cm"
        />
        <MetricCard
          label="Stride Length"
          value={metrics?.strideLength?.toFixed(2) ?? null}
          unit="m"
        />
        <MetricCard
          label="Cardio Recovery"
          value={metrics?.cardioRecovery ? Math.round(metrics.cardioRecovery) : null}
          unit="BPM"
          detail="Post-workout HR drop"
        />
        <MetricCard
          label="Physical Effort"
          value={metrics?.physicalEffort?.toFixed(1) ?? null}
          detail="Apple effort score"
        />
        <MetricCard
          label="Distance"
          value={metrics?.walkingRunningDistance
            ? (metrics.walkingRunningDistance / 1000).toFixed(1)
            : null}
          unit="km"
          detail="Walking + running"
        />
      </div>
      {metrics?.respiratoryRate && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Respiratory rate: {metrics.respiratoryRate.toFixed(1)} breaths/min
        </p>
      )}
    </div>
  );
}
```

### Body Mode Data Queries

Add to `src/app/body/page.tsx` in the data fetching section:

```typescript
// New queries for running metrics
let todayRunning: Awaited<ReturnType<typeof prisma.dailyRunningMetrics.findUnique>> = null;
let latestVO2Max: Awaited<ReturnType<typeof prisma.dailyVO2Max.findFirst>> = null;

// Add to Promise.all:
prisma.dailyRunningMetrics.findUnique({ where: { day: viewDate } }),
prisma.dailyVO2Max.findFirst({ orderBy: { day: "desc" } }),

// Also add weight queries (moved from dashboard):
prisma.weightLog.findMany({
  where: { day: { gte: thirtyDaysAgo } },
  orderBy: { day: "asc" },
}),
prisma.userProfile.findUnique({ where: { id: 1 } }),
```

---

## Coach Context Changes

**File:** `src/lib/coach-context.ts`

Add to `Promise.allSettled` queries:

```typescript
prisma.dailyRunningMetrics.findFirst({
  where: { day: { lte: localToday } },
  orderBy: { day: "desc" },
}),
```

Add new section to context string builder:

```typescript
lines.push("## Running & Cardio (Apple Watch)");
if (latestRunning) {
  if (latestRunning.runningSpeed)
    lines.push(`- Speed: ${latestRunning.runningSpeed.toFixed(1)} km/h`);
  if (latestRunning.runningPower)
    lines.push(`- Power: ${Math.round(latestRunning.runningPower)} W`);
  if (latestRunning.groundContactTime)
    lines.push(`- Ground contact: ${Math.round(latestRunning.groundContactTime)} ms`);
  if (latestRunning.verticalOscillation)
    lines.push(`- Vertical oscillation: ${latestRunning.verticalOscillation.toFixed(1)} cm`);
  if (latestRunning.strideLength)
    lines.push(`- Stride: ${latestRunning.strideLength.toFixed(2)} m`);
  if (latestRunning.cardioRecovery)
    lines.push(`- Cardio recovery: ${Math.round(latestRunning.cardioRecovery)} BPM drop`);
  if (latestRunning.physicalEffort)
    lines.push(`- Physical effort: ${latestRunning.physicalEffort.toFixed(1)}/10`);
  if (latestRunning.walkingRunningDistance)
    lines.push(`- Walk+run distance: ${(latestRunning.walkingRunningDistance / 1000).toFixed(1)} km`);
  if (latestRunning.respiratoryRate)
    lines.push(`- Respiratory rate: ${latestRunning.respiratoryRate.toFixed(1)} breaths/min`);
} else {
  lines.push("- No running data available");
}
lines.push("");
```

---

## Data Source Summary (After Changes)

| Metric | Source | Model | Display Location |
|---|---|---|---|
| Readiness | Oura | DailyReadiness | Dashboard |
| Sleep Score | Oura | DailySleep | Dashboard + Body |
| HRV | Oura | DailySleep | Dashboard |
| Stress | Oura | DailyStress | Dashboard |
| SpO2 | Oura | DailySpO2 | Dashboard |
| Resilience | Oura | DailyResilience | Dashboard |
| Bedtime Rec | Oura | SleepTimeRecommendation | Dashboard + Body |
| Sessions | Oura | OuraSession | Dashboard |
| Enhanced Tags | Oura | ActivityTag | Mind (correlation engine) |
| Heart Rate | Oura + Apple Watch | HeartRateSample | Dashboard (via sleep) |
| Activity | Oura | DailyActivity | Dashboard |
| Weight | Apple Watch (HAE) | WeightLog | Dashboard + Body |
| Body Fat | Apple Watch (HAE) | WeightLog | Dashboard + Body |
| Workouts | Apple Watch (HAE) | HealthKitWorkout | Dashboard (HealthKit card) |
| **VO2 Max** | **Apple Watch (HAE)** | DailyVO2Max | **Body only** |
| **Running Speed** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |
| **Running Power** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |
| **Ground Contact** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |
| **Vert. Oscillation** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |
| **Stride Length** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |
| **Cardio Recovery** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |
| **Physical Effort** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |
| **Walk+Run Distance** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |
| **Respiratory Rate** | **Apple Watch (HAE)** | DailyRunningMetrics | **Body only** |

---

## Testing Checklist

- [ ] Health Auto Export sends all 10 new metrics (check terminal logs)
- [ ] Prisma migration runs cleanly
- [ ] Each metric upserts correctly into DailyRunningMetrics
- [ ] VO2 Max stores in DailyVO2Max from Apple Watch (not Oura)
- [ ] Oura syncVO2Max commented out (no more 404 errors)
- [ ] Dashboard loads without VO2 Max card, WeightTrendChart, WeightGoalSettings
- [ ] Dashboard still shows compact weight section (WeightCard + WeightInput)
- [ ] Body mode shows running metrics section with data
- [ ] Body mode shows full weight section (trend chart + settings)
- [ ] Body mode shows sleep breakdown + bedtime rec
- [ ] Coach context includes running metrics section
- [ ] All null/missing data handled with "—" fallback
- [ ] `npx tsc --noEmit` passes

---

## Implementation Prompt

Copy-paste this prompt into a Claude coding session to implement:

```
I'm adding Apple Watch running/training metrics to Baseline and reorganizing the Dashboard vs Body mode layout. The full spec is at docs/apple-watch-training-spec.md — read it first.

Also read these files for context:
- prisma/schema.prisma (current models)
- src/app/api/healthkit-sync/route.ts (current metric processing)
- src/app/page.tsx (current dashboard)
- src/app/body/page.tsx (current body mode)
- src/lib/coach-context.ts (coach context builder)
- src/lib/sync.ts (Oura sync — need to comment out syncVO2Max)
- src/components/dashboard/metric-card.tsx (reusable card component)

Do the following in order:

1. Add DailyRunningMetrics model to prisma/schema.prisma (see spec for exact fields)
2. Run npx prisma migrate dev --name add-running-metrics
3. In src/app/api/healthkit-sync/route.ts, add cases in processMetrics for the Apple Watch metrics. Use these EXACT metric names from the console.log discovery:
   [PASTE DISCOVERED METRIC NAMES HERE]
   Each case upserts into DailyRunningMetrics by day. Also add a vo2_max case that upserts into DailyVO2Max.
4. In src/lib/sync.ts, comment out the syncVO2Max() call with a note: "// VO2 Max sourced from Apple Watch via Health Auto Export, not Oura (returns 404)"
5. Dashboard cleanup (src/app/page.tsx):
   - Remove the VO2 Max card from the Biometrics section
   - Remove WeightTrendChart and WeightGoalSettings from the weight section
   - Keep WeightCard + WeightInput as compact weight section
   - Keep everything else (sleep breakdown, bedtime rec, TDEE, etc.)
6. Create src/components/body/running-metrics-card.tsx (see spec for exact component code — uses MetricCard)
7. Expand Body mode (src/app/body/page.tsx):
   - Add weight queries (weightLogs, profile) and weight components (WeightCard, WeightInput, WeightTrendChart, WeightGoalSettings, TdeeCard)
   - Add running metrics query (DailyRunningMetrics, DailyVO2Max)
   - Add RunningMetricsCard component between Fatigue Signal and Volume Zones
   - Add Sleep Breakdown section (copy from dashboard)
   - Add Bedtime Recommendation card (copy from dashboard)
8. Update src/lib/coach-context.ts — add DailyRunningMetrics query and "Running & Cardio" section to context string
9. Run npx tsc --noEmit to verify no type errors
10. Update docs/task-tracker.md — add "Apple Watch Training Metrics" section

Important:
- Follow existing code patterns
- All data can be null — always show "—" fallback
- RunningMetricsCard reuses the existing MetricCard component
- Weight components are shared between Dashboard and Body (import from same location)
- Don't change Mind mode at all
```

---

## References

- Apple Watch Training Metrics: [Apple Developer — HealthKit Workout Types](https://developer.apple.com/documentation/healthkit)
- Health Auto Export: [GitHub — Lybron/health-auto-export](https://github.com/Lybron/health-auto-export)
- Oura Sync Expansion Spec: `docs/oura-sync-expansion-spec.md`
- HealthKit Sync Spec: `docs/healthkit-sync-spec.md`
- Oura Dashboard Spec: `docs/oura-dashboard-spec.md`
