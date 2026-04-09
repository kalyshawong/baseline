# Oura Dashboard Expansion — Frontend Spec

**Version:** 0.1 (Draft)
**Date:** 2026-04-09
**Status:** Ready for Implementation
**Depends on:** Oura Sync Expansion (`docs/oura-sync-expansion-spec.md`), existing dashboard (`src/app/page.tsx`)

---

## Problem Statement

The Oura Sync Expansion added 7 new V2 endpoints (SpO2, Enhanced Tags, Workouts, Sessions, Sleep Time, Resilience, VO2 Max) to Baseline's sync. Data is flowing into the database and feeding the Coach context, but none of it is visible on the dashboard. Users can't see their SpO2 trends, VO2 Max, resilience scores, bedtime recommendations, or meditation sessions without this frontend work.

## Goals

1. Display SpO2 and Resilience in the existing top-row metric grid
2. Add a new Biometrics section with VO2 Max trend and bedtime recommendation
3. Show meditation/breathing/nap sessions when present
4. Update the Sync Button to show counts for all new endpoints
5. Keep the existing dashboard structure and styling — no layout overhaul

## Non-Goals

- Separate pages or modals for expanded data
- Historical trend charts for SpO2/Resilience/VO2 Max (future enhancement)
- Enhanced Tag display on dashboard (tags feed correlation engine, not dashboard)
- Oura Workout display (workouts already shown via HealthKit Status card)

---

## Implementation Details

### File Locations

| File | Purpose |
|---|---|
| `src/app/page.tsx` | Main dashboard — server component, queries DB, renders all cards |
| `src/components/dashboard/metric-card.tsx` | Reusable metric card component |
| `src/components/dashboard/sync-button.tsx` | Sync button with result display |

### Design Tokens

All existing cards use these CSS variables:
- `--color-border` — card border
- `--color-surface` — card background
- `--color-text-muted` — labels and secondary text
- `--color-accent` — highlight color

Card class pattern: `rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5`

---

## Changes

### 1. New Database Queries in page.tsx

Add to the main `Promise.all` block (around line 69):

```typescript
prisma.dailySpO2.findUnique({ where: { day: viewDate } }),
prisma.dailyResilience.findUnique({ where: { day: viewDate } }),
prisma.dailyVO2Max.findFirst({ orderBy: { day: "desc" } }),
prisma.sleepTimeRecommendation.findFirst({ orderBy: { day: "desc" } }),
prisma.ouraSession.findMany({
  where: { day: viewDate },
  orderBy: { startedAt: "desc" },
}),
prisma.ouraWorkout.findMany({
  where: { day: viewDate },
  orderBy: { startedAt: "desc" },
}),
```

Declare variables above the try block:

```typescript
let daySpO2: Awaited<ReturnType<typeof prisma.dailySpO2.findUnique>> = null;
let dayResilience: Awaited<ReturnType<typeof prisma.dailyResilience.findUnique>> = null;
let latestVO2Max: Awaited<ReturnType<typeof prisma.dailyVO2Max.findFirst>> = null;
let sleepTimeRec: Awaited<ReturnType<typeof prisma.sleepTimeRecommendation.findFirst>> = null;
let todaySessions: Awaited<ReturnType<typeof prisma.ouraSession.findMany>> = [];
let todayOuraWorkouts: Awaited<ReturnType<typeof prisma.ouraWorkout.findMany>> = [];
```

---

### 2. Metric Cards Grid Expansion

**Current:** 4 cards in `sm:grid-cols-4` (Readiness, Sleep, HRV, Stress)

**New:** 6 cards in `sm:grid-cols-3` (two rows of 3):
1. Readiness (existing)
2. Sleep (existing)
3. HRV (existing)
4. Stress (existing)
5. **SpO2** (new)
6. **Resilience** (new)

Change grid class from `sm:grid-cols-4` to `sm:grid-cols-3`.

**SpO2 MetricCard:**

```tsx
<MetricCard
  label="SpO2"
  value={daySpO2?.avgSpO2 ? `${daySpO2.avgSpO2.toFixed(1)}` : null}
  unit="%"
  detail={
    daySpO2?.avgSpO2
      ? daySpO2.avgSpO2 < 95
        ? "⚠ Below normal"
        : "Blood oxygen"
      : undefined
  }
/>
```

**Resilience MetricCard:**

```tsx
<MetricCard
  label="Resilience"
  value={
    dayResilience?.level
      ? dayResilience.level.charAt(0).toUpperCase() + dayResilience.level.slice(1)
      : null
  }
  detail={
    dayResilience
      ? `Sleep: ${dayResilience.sleepRecovery ?? "—"} · Recovery: ${dayResilience.daytimeRecovery ?? "—"} · Stress: ${dayResilience.stress ?? "—"}`
      : undefined
  }
/>
```

---

### 3. New Biometrics Section

Insert after the Activity/CalorieBalance/HealthKitStatus section (after ~line 289), before the Trend Chart:

```tsx
{/* Biometrics */}
<div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
  {/* VO2 Max card */}
  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
      VO2 Max
    </p>
    <p className="mt-1 text-2xl font-bold tabular-nums">
      {latestVO2Max?.vo2Max ? `${latestVO2Max.vo2Max.toFixed(1)}` : "—"}
      {latestVO2Max?.vo2Max && (
        <span className="ml-1 text-sm font-normal text-[var(--color-text-muted)]">
          mL/kg/min
        </span>
      )}
    </p>
    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
      {latestVO2Max?.day
        ? `Updated ${latestVO2Max.day.toLocaleDateString()}`
        : "Aerobic capacity"}
    </p>
  </div>

  {/* Bedtime Recommendation card */}
  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
    <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
      Bedtime
    </p>
    <p className="mt-1 text-2xl font-bold tabular-nums">
      {sleepTimeRec?.optimalBedtimeStart != null
        ? formatSecondsFromMidnight(sleepTimeRec.optimalBedtimeStart)
        : "—"}
      {sleepTimeRec?.optimalBedtimeEnd != null
        ? ` – ${formatSecondsFromMidnight(sleepTimeRec.optimalBedtimeEnd)}`
        : ""}
    </p>
    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
      {sleepTimeRec?.recommendation?.replace(/_/g, " ") ?? "Oura recommendation"}
    </p>
  </div>
</div>
```

**Helper function** (add near `formatDuration` at the top of the file):

```typescript
function formatSecondsFromMidnight(seconds: number): string {
  // Negative = before midnight, positive = after midnight
  const totalSeconds = seconds < 0 ? 86400 + seconds : seconds;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}
```

---

### 4. Sessions Section

Display meditation, breathing, and nap sessions. Only render if there are sessions for the day. Insert after the Biometrics section:

```tsx
{todaySessions.length > 0 && (
  <div className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
    <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
      Sessions
    </h2>
    <div className="space-y-3">
      {todaySessions.map((s) => (
        <div key={s.id} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium capitalize">
              {s.type.replace(/_/g, " ")}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {Math.round(s.durationSeconds / 60)} min
              {s.avgHeartRate ? ` · ${Math.round(s.avgHeartRate)} bpm` : ""}
              {s.avgHrv ? ` · HRV ${Math.round(s.avgHrv)}` : ""}
            </p>
          </div>
          {s.mood && (
            <span className="text-xs text-[var(--color-text-muted)]">
              {s.mood}
            </span>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

---

### 5. Sync Button Update

In `src/components/dashboard/sync-button.tsx`, add new counts after line 24:

```typescript
if (s.spo2) parts.push(`${s.spo2} SpO2`);
if (s.tags) parts.push(`${s.tags} tags`);
if (s.sessions) parts.push(`${s.sessions} sessions`);
if (s.resilience) parts.push(`${s.resilience} resilience`);
if (s.vo2max) parts.push(`${s.vo2max} VO2`);
if (s.workouts) parts.push(`${s.workouts} workouts`);
if (s.sleepTime) parts.push(`${s.sleepTime} sleep time`);
```

---

## Dashboard Layout (After Changes)

```
┌─────────────────────────────────────────────────┐
│  [DateNav]                    [Sync Now] [Last]  │
├─────────────────────────────────────────────────┤
│  [Baseline Score Card]                           │
├───────────────┬───────────────┬─────────────────┤
│  Readiness    │  Sleep        │  HRV             │
│  85           │  7h 23m       │  45 ms           │
├───────────────┼───────────────┼─────────────────┤
│  Stress       │  SpO2 (NEW)   │  Resilience (NEW)│
│  Restored     │  97.2%        │  Solid           │
├───────────────┴───────────────┴─────────────────┤
│  [Activity Card]                                 │
│  [Calorie Balance Card]                          │
│  [HealthKit Status Card]                         │
├─────────────────────┬───────────────────────────┤
│  VO2 Max (NEW)      │  Bedtime (NEW)             │
│  38.2 mL/kg/min     │  10:30 PM – 11:15 PM       │
├─────────────────────┴───────────────────────────┤
│  Sessions (NEW) — if any                         │
│  Meditation  15 min · 62 bpm · HRV 85            │
│  Breathing   10 min · 58 bpm                     │
├─────────────────────────────────────────────────┤
│  [Trend Chart]                                   │
│  [Cycle Phase Selector]                          │
│  [Macro Summary]                                 │
│  [Weight Section]                                │
│  [Sleep Breakdown]                               │
└─────────────────────────────────────────────────┘
```

---

## Testing Checklist

- [ ] Dashboard loads without errors when no SpO2/Resilience/VO2/SleepTime data exists
- [ ] MetricCard shows "—" for null SpO2 and Resilience
- [ ] SpO2 < 95% shows warning detail text
- [ ] Resilience level is capitalized correctly
- [ ] VO2 Max shows latest value (not necessarily today's)
- [ ] Bedtime offset-to-time conversion handles negative values (before midnight)
- [ ] Sessions section hidden when no sessions exist
- [ ] Sessions display duration, HR, HRV, and mood correctly
- [ ] Sync button shows counts for all 12 sync endpoints
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] Grid layout responsive: 1 col on mobile, 3 cols on sm+

---

## Implementation Prompt

Copy-paste this prompt into a Claude coding session to implement:

```
Build dashboard cards for the new Oura sync expansion data. The full spec is at docs/oura-dashboard-spec.md — read it first.

Summary of changes:
1. In src/app/page.tsx, add Prisma queries for DailySpO2, DailyResilience, DailyVO2Max, SleepTimeRecommendation, OuraSession, OuraWorkout
2. Add SpO2 and Resilience MetricCards to the existing top grid (change to sm:grid-cols-3 for 6 cards)
3. Add a Biometrics section with VO2 Max and Bedtime Recommendation cards
4. Add a Sessions section (meditation/breathing/naps) — only shown when data exists
5. Update src/components/dashboard/sync-button.tsx to show all new sync counts
6. Add formatSecondsFromMidnight helper for bedtime display
7. Run npx tsc --noEmit to verify no type errors

Follow the exact code in the spec. Use existing CSS variable patterns. All new data can be null — always show "—" fallback.
```

---

## References

- Oura Sync Expansion Spec: `docs/oura-sync-expansion-spec.md`
- HealthKit Sync Spec: `docs/healthkit-sync-spec.md`
- Existing MetricCard: `src/components/dashboard/metric-card.tsx`
- Dashboard: `src/app/page.tsx`
