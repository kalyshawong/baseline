# Phase 3 Spec — Body Mode

**Version:** 0.1
**Author:** Kalysha
**Last Updated:** 2026-04-03
**Status:** Draft
**Depends on:** Phase 1 (Oura sync, Baseline Score), Phase 2a (Mind Mode tagging, correlation engine, nutrition logger)
**Research basis:** `body-mode-research.md` (27 peer-reviewed citations)

---

## Design Principle: Reuse Mind Mode's Infrastructure

Body Mode is not a separate system — it is a structured layer built on top of Mind Mode's data architecture. Every core Mind Mode system has a direct Body Mode application:

| Mind Mode System | Body Mode Reuse |
|---|---|
| `ActivityTag` | Workout sessions are tagged activities. Exercise sets are structured tags. |
| `ExperimentLog` | Training programs are experiments: "Does increasing squat volume by 10% improve readiness?" |
| Correlation engine (`correlation.ts`) | "Training legs correlates with 8% lower next-day HRV" — same Welch's t-test. |
| `NutritionLog` / `NutritionEntry` | Protein intake displayed on workout page. EA calculation. Already built. |
| Insight generator (`insights.ts`) | "Your bench press volume is 15% higher on follicular phase training days." |
| `EnvReading` | "Sleep quality drops 20% when PM2.5 > 25 μg/m³ — expect lower readiness tomorrow." |

New models are needed for exercises, sessions, and sets — but the intelligence layer is already there.

---

## 1. Exercise Library

### 1.1 Data Model

```prisma
model Exercise {
  id              String   @id @default(cuid())
  name            String   @unique
  muscleGroup     String   // chest | back | shoulders | biceps | triceps | quads | hamstrings | glutes | calves | core | forearms
  secondaryMuscle String?  // optional secondary muscle group
  movementPattern String   // push | pull | hinge | squat | carry | isolation | Olympic
  equipment       String   // barbell | dumbbell | cable | machine | bodyweight | kettlebell | band
  isCompound      Boolean  @default(false)
  velocityProfile String?  // JSON: personal load-velocity curve (populated by IMU over time)
  notes           String?
  createdAt       DateTime @default(now())

  sets            WorkoutSet[]
}
```

### 1.2 Seed Library

The initial exercise library ships with ~50 exercises covering all major movement patterns. Users can add custom exercises.

**Compound lifts (barbell):**

| Exercise | Muscle Group | Pattern | Equipment |
|---|---|---|---|
| Back Squat | quads | squat | barbell |
| Front Squat | quads | squat | barbell |
| Conventional Deadlift | hamstrings | hinge | barbell |
| Sumo Deadlift | hamstrings | hinge | barbell |
| Romanian Deadlift | hamstrings | hinge | barbell |
| Bench Press | chest | push | barbell |
| Incline Bench Press | chest | push | barbell |
| Overhead Press | shoulders | push | barbell |
| Barbell Row | back | pull | barbell |
| Pendlay Row | back | pull | barbell |
| Hip Thrust | glutes | hinge | barbell |
| Power Clean | quads | Olympic | barbell |
| Clean & Jerk | quads | Olympic | barbell |
| Snatch | quads | Olympic | barbell |

**Compound lifts (dumbbell/other):**

| Exercise | Muscle Group | Pattern | Equipment |
|---|---|---|---|
| Dumbbell Bench Press | chest | push | dumbbell |
| Dumbbell Shoulder Press | shoulders | push | dumbbell |
| Dumbbell Row | back | pull | dumbbell |
| Goblet Squat | quads | squat | dumbbell |
| Bulgarian Split Squat | quads | squat | dumbbell |
| Farmer's Walk | core | carry | dumbbell |
| Pull-Up | back | pull | bodyweight |
| Chin-Up | back | pull | bodyweight |
| Dip | chest | push | bodyweight |
| Push-Up | chest | push | bodyweight |
| Inverted Row | back | pull | bodyweight |
| Kettlebell Swing | hamstrings | hinge | kettlebell |
| Turkish Get-Up | core | carry | kettlebell |

**Isolation / accessory:**

| Exercise | Muscle Group | Pattern | Equipment |
|---|---|---|---|
| Bicep Curl | biceps | isolation | dumbbell |
| Hammer Curl | biceps | isolation | dumbbell |
| Tricep Pushdown | triceps | isolation | cable |
| Overhead Tricep Extension | triceps | isolation | cable |
| Lateral Raise | shoulders | isolation | dumbbell |
| Face Pull | shoulders | isolation | cable |
| Cable Fly | chest | isolation | cable |
| Leg Extension | quads | isolation | machine |
| Leg Curl | hamstrings | isolation | machine |
| Calf Raise | calves | isolation | machine |
| Cable Crunch | core | isolation | cable |
| Ab Wheel Rollout | core | isolation | bodyweight |
| Plank | core | isolation | bodyweight |
| Back Extension | hamstrings | isolation | bodyweight |
| Lat Pulldown | back | pull | cable |
| Seated Cable Row | back | pull | cable |

### 1.3 API Routes

```
GET    /api/exercises              List all (filterable by muscleGroup, movementPattern, equipment)
GET    /api/exercises/:id          Get one with recent set history
POST   /api/exercises              Create custom exercise
PATCH  /api/exercises/:id          Update exercise (notes, velocityProfile)
DELETE /api/exercises/:id          Delete custom exercise (prevent if sets reference it)
```

---

## 2. Workout Logging

### 2.1 Data Models

```prisma
model WorkoutSession {
  id             String   @id @default(cuid())
  date           DateTime
  startedAt      DateTime
  completedAt    DateTime?
  durationMin    Int?
  readinessScore Int?     // snapshot of Baseline Score at session start
  cyclePhase     String?  // snapshot of current cycle phase at session start
  sessionRPE     Int?     // overall session RPE (1-10), logged after completion
  sessionVolume  Float?   // total volume load (sets × reps × weight), computed
  notes          String?
  templateId     String?  // if started from a template
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  sets           WorkoutSet[]
}

model WorkoutSet {
  id           String         @id @default(cuid())
  sessionId    String
  session      WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  exerciseId   String
  exercise     Exercise       @relation(fields: [exerciseId], references: [id])
  setNumber    Int
  reps         Int
  weight       Float          // in user's preferred unit (kg or lb)
  rpe          Int?           // 1-10 RPE per set
  velocity     Float?         // mean concentric velocity m/s (from IMU, nullable until Phase 2c)
  velocityLoss Float?         // % velocity loss from first set (computed)
  restSeconds  Int?           // rest before this set
  isWarmup     Boolean        @default(false)
  isPR         Boolean        @default(false) // auto-detected: new best at this rep range
  notes        String?
  createdAt    DateTime       @default(now())

  @@index([sessionId])
  @@index([exerciseId])
}

model WorkoutTemplate {
  id          String   @id @default(cuid())
  name        String
  exercises   String   // JSON array of { exerciseId, targetSets, targetReps, targetRPE }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 2.2 Workout Flow

```
┌─────────────────────────────────────────────────────┐
│  BODY MODE — Workout Start                           │
│                                                      │
│  Today: Baseline Score 78 (Yellow — Moderate)        │
│  Cycle Phase: Follicular (Day 9) — Peak Performance  │
│  Protein so far: 45g / 112g target                   │
│                                                      │
│  Active Experiment: "Pre-workout caffeine timing"    │
│  → Did you have caffeine today? [Yes] [No]           │
│                                                      │
│  [Start from template ▾]  [Blank session]            │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  ADD EXERCISE                                        │
│  [Search: "squat"___________]                        │
│  Recent: Back Squat | Bench Press | RDL              │
│  By muscle: Quads | Back | Chest | ...               │
│                                                      │
│  → Back Squat selected                               │
│                                                      │
│  Last session (Mar 31): 4×5 @ 225 lbs (RPE 8)       │
│  Recommendation: 4×5 @ 225 lbs (same — readiness     │
│  is moderate; hold weight, don't add)                │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  LOG SETS — Back Squat                               │
│                                                      │
│  Set 1:  [5] reps × [225] lbs  RPE [7]  ✓           │
│  Set 2:  [5] reps × [225] lbs  RPE [7]  ✓           │
│  Set 3:  [5] reps × [225] lbs  RPE [8]  ✓           │
│  Set 4:  [4] reps × [225] lbs  RPE [9]  ✓           │
│  [+ Add set]                                         │
│                                                      │
│  Volume: 4,275 lbs (last time: 4,500 lbs)            │
│  Est 1RM: 261 lbs (PR: 267 lbs on Mar 17)           │
│                                                      │
│  [+ Add exercise]  [Finish workout]                  │
└─────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────┐
│  SESSION COMPLETE                                    │
│                                                      │
│  Duration: 52 min                                    │
│  Total volume: 12,450 lbs                            │
│  Session RPE: [7___]                                 │
│                                                      │
│  Weekly volume: Quads 14 sets (MAV range ✓)          │
│                 Chest 8 sets (below MEV ⚠)           │
│                                                      │
│  Protein remaining: 67g — eat within 4 hours         │
│  Next recommended session: Thursday (48h rest)       │
│                                                      │
│  [Save as template]  [Done]                          │
└─────────────────────────────────────────────────────┘
```

### 2.3 API Routes

```
POST   /api/workouts                Create session (snapshots readiness + cycle phase)
GET    /api/workouts                List sessions (filterable by date range)
GET    /api/workouts/:id            Get session with all sets
PATCH  /api/workouts/:id            Update session (sessionRPE, notes, completedAt)
DELETE /api/workouts/:id            Delete session (cascade sets)

POST   /api/workouts/:id/sets       Add set(s) to session
PATCH  /api/workouts/:id/sets/:id   Update a set
DELETE /api/workouts/:id/sets/:id   Delete a set

GET    /api/workouts/volume         Weekly volume per muscle group (for MEV/MAV/MRV display)
GET    /api/workouts/history/:exerciseId   Exercise history (PRs, volume trends, est 1RM)

POST   /api/templates               Create workout template
GET    /api/templates               List templates
DELETE /api/templates/:id            Delete template
```

---

## 3. Progressive Overload Tracking

### 3.1 Volume Load

**Formula:** Volume Load = sets × reps × weight

Computed per exercise per session, per muscle group per week, and total per week. Stored on `WorkoutSession.sessionVolume` for the total; computed on-demand for per-exercise and per-muscle-group breakdowns.

### 3.2 Estimated 1RM

**Formula (Epley):** `1RM = weight × (1 + reps / 30)`

Calculated after each working set (non-warmup). The highest e1RM for an exercise across all sessions is the PR. Display PR history and current e1RM vs PR.

**When IMU is available (Phase 2c):** Use velocity-based 1RM estimation instead — more accurate and doesn't require near-maximal effort. See section 9.

### 3.3 Volume Zones: MEV / MAV / MRV

**Research basis:** Israetel (2021), Schoenfeld (2017) — see `body-mode-research.md` §2.1.

Weekly sets per muscle group are tracked and displayed against three volume zones. Zones are personalized based on training experience level (set during onboarding).

**Default zone values (intermediate):**

| Muscle Group | MEV (sets/wk) | MAV (sets/wk) | MRV (sets/wk) |
|---|---|---|---|
| Quads | 8 | 12–18 | 22 |
| Hamstrings | 6 | 10–16 | 20 |
| Glutes | 0 | 4–12 | 16 |
| Back (lats) | 8 | 12–18 | 22 |
| Back (upper/traps) | 6 | 10–14 | 18 |
| Chest | 8 | 12–18 | 22 |
| Shoulders (side/rear) | 6 | 12–20 | 26 |
| Biceps | 4 | 8–14 | 20 |
| Triceps | 4 | 6–12 | 18 |
| Calves | 6 | 10–14 | 18 |
| Core | 0 | 4–10 | 14 |

**Display:** Horizontal gauge per muscle group showing current week's sets against MEV (red line), MAV zone (green band), and MRV (red line). A set count below MEV for 2+ consecutive weeks triggers a warning. A set count at or above MRV triggers a fatigue/overreaching alert.

**Adjustment:** Users can drag zone boundaries based on personal recovery. Over time, the correlation engine can suggest adjustments: "Your readiness drops when quad volume exceeds 18 sets — consider lowering MRV from 22 to 18."

### 3.4 Implementation

```typescript
interface VolumeZone {
  muscleGroup: string;
  mev: number;
  mav: [number, number]; // range
  mrv: number;
}

interface WeeklyVolume {
  muscleGroup: string;
  sets: number;
  zone: "below_mev" | "at_mev" | "in_mav" | "above_mav" | "at_mrv" | "above_mrv";
  weekOverWeekChange: number; // percent change from last week
}
```

**Volume counting rules:**
- Count working sets only (exclude warmup sets where `isWarmup === true`)
- Count all sets within 40–100% 1RM (anything lighter is not hypertrophically meaningful)
- Compound exercises count toward all worked muscle groups: bench press counts as chest sets AND tricep sets
- Sets taken to failure (RPE 10) count as ~1.5× a normal set for fatigue purposes

---

## 4. Readiness-Based Daily Adjustment

### 4.1 Existing Infrastructure

The Baseline Score from Phase 1 already provides a readiness signal (0–100) with traffic-light tiers. Body Mode adds specificity to what each tier means for training.

### 4.2 Training Tier Logic

**Research basis:** Plews (2013), Kiviniemi (2007), Flatt (2016) — see `body-mode-research.md` §1.1.

| Baseline Score | Tier | Volume Adjustment | Intensity Adjustment | Recommendations |
|---|---|---|---|---|
| 85–100 | **Go Hard** | Full prescribed volume | PR attempts allowed | "Peak readiness — push today." |
| 70–84 | **Standard** | Full prescribed volume | Maintain current loads | "Solid day — execute the program." |
| 55–69 | **Moderate** | Reduce volume 20–30% | Reduce loads 5–10% or hold | "Recovery signal — dial it back." |
| 40–54 | **Light** | Reduce volume 40–50% | Reduce loads 15–20% | "Rest-biased — technique work or mobility." |
| Below 40 | **Recovery** | Skip strength training | Active recovery only | "Your body needs rest today." |

### 4.3 HRV CV as Overreaching Signal

**Research basis:** Flatt & Esco (2016) — see `body-mode-research.md` §1.1.

**New metric: HRV Coefficient of Variation (CV)**

```typescript
function hrvCV(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1));
  return (stdDev / mean) * 100; // percentage
}
```

Track 14-day rolling HRV CV from Oura's nightly `averageHrv`. When CV exceeds the user's personal normal range for 14+ consecutive days, this is an early overreaching signal — even if absolute HRV hasn't dropped significantly.

**Alert:** "Your HRV has been unusually variable for 2+ weeks. This pattern precedes overreaching. Consider a deload this week."

### 4.4 Deload Detection

**Research basis:** Pritchard (2024), Cadegiani (2019) — see `body-mode-research.md` §2.4.

Composite fatigue score computed weekly:

```typescript
interface FatigueSignals {
  weeksSinceLastDeload: number;      // +1 point if ≥ 5
  hrvBelowBaseline: boolean;         // +1 point if HRV < 1 SD below 14-day mean for 2+ days
  hrvCvElevated: boolean;            // +1 point if HRV CV above personal norm for 14+ days
  sleepQualityDecline: boolean;      // +1 point if sleep score < 70 for 3+ nights
  rhrElevated: boolean;              // +1 point if RHR > 5 BPM above baseline for 3+ mornings
  rpeCreep: boolean;                 // +2 points if average session RPE increased 1+ point over past 2 weeks at same loads
  volumeApproachingMRV: boolean;     // +1 point if any muscle group at ≥ 90% MRV
}

// Score ≥ 3: "Deload recommended in 1–2 weeks"
// Score ≥ 5: "Deload strongly recommended this week"
// Score ≥ 6 for 2+ weeks: "Extended rest — consider medical evaluation"
```

---

## 5. Cycle-Phase-Aware Recommendations

### 5.1 Existing Infrastructure

Phase 1 already tracks cycle phase (manual 4-phase selector) and integrates it with Baseline Score (Phase 2 temp deviation fix applied). Body Mode adds training-specific guidance per phase.

### 5.2 Phase-Specific Training Adjustments

**Research basis:** McNulty (2020), Wikström-Frisén (2017), Sung (2014) — see `body-mode-research.md` §4.

| Phase | Training Guidance | UI Display |
|---|---|---|
| **Menstrual (1–5)** | Days 1–2: reduce volume 20–30%, no PRs. Days 3–5: ramp toward normal. Extra warm-up. | "Menstrual — ease in, technique focus" |
| **Follicular (6–13)** | Peak performance window. Heavy compounds, PR attempts, high volume. Higher training frequency OK. | "Follicular — performance peak, push it" |
| **Ovulation (14–16)** | Maintain intensity. **ACL injury warning.** Reduce plyometrics. Extra warm-up and knee stability work. | "Ovulation — strong but watch joints ⚠" |
| **Luteal (17–28)** | Early (17–23): moderate, hypertrophy bias, 10–15% volume reduction. Late (24–28): auto-deload, 20–40% volume reduction, technique/mobility focus. | "Luteal — fatigue runs higher, honor it" |

### 5.3 ACL Injury Risk During Ovulation

**Research basis:** Hewett (2007), Wojtys (2002) — see `body-mode-research.md` §4.4.

When cycle phase = ovulation AND session contains plyometric or high-impact movements, display:

> **Joint awareness reminder**
> ACL injury risk is elevated during ovulation (research shows 3–6× higher risk). Today's session includes plyometric movements. Consider:
> - Extra warm-up with single-leg balance and controlled deceleration
> - Knee sleeves for heavy squats/lunges
> - Controlled landing mechanics on all jumps
> *This is informational, not restrictive — many athletes train through ovulation without issue.*

### 5.4 RPE Elevation During Luteal Phase

**Research basis:** Sung (2014) — see `body-mode-research.md` §4.2.

During luteal phase, display a contextual note on the set logging screen:

> **Luteal phase RPE context:** The same weight may feel 0.5–1 RPE harder during the luteal phase. This is progesterone — not fitness loss. Consider maintaining loads rather than reducing based on RPE alone.

If the user is using RPE-based autoregulation and RPE jumps by >1 point at the same load during luteal phase, don't trigger a load reduction recommendation. Instead, flag it as expected physiology.

---

## 6. Nutrition Integration

### 6.1 Existing Infrastructure

The nutrition logger from Phase 2a already tracks calories, protein, carbs, and fat per meal with Claude API-powered parsing. Body Mode surfaces this data in context.

### 6.2 Workout Page Nutrition Display

Show on the workout start screen:

```
Protein today: 45g / 112g target (40%)
████████░░░░░░░░░░░░░░░░
Meals logged: Breakfast (28g), Lunch (17g)
```

### 6.3 Protein Target

**Research basis:** Morton (2018) — see `body-mode-research.md` §3.3.

Default daily target: `bodyWeight_kg × 1.6` = grams of protein. User sets body weight in profile (with optional periodic re-measurement).

Example: 70 kg user → 112g protein target.

The `1.6 g/kg` threshold captures ~95% of hypertrophy benefit. Display "Science note: 1.6 g/kg captures 95% of muscle-building benefit (Morton et al., 2018)" in onboarding.

### 6.4 Per-Meal Protein Check

**Research basis:** Moore (2009) — see `body-mode-research.md` §3.2.

After logging a meal with >30g protein, show: "This meal has good protein content for muscle protein synthesis."

After logging a meal with <20g protein, show subtle note: "This meal is low in protein — consider adding a protein source to maximize MPS."

### 6.5 Energy Availability Warning

**Research basis:** Loucks (2011) — see `body-mode-research.md` §3.4.

```typescript
function energyAvailability(caloriesConsumed: number, exerciseCalories: number, ffmKg: number): number {
  return (caloriesConsumed - exerciseCalories) / ffmKg; // kcal/kg FFM/day
}
```

When EA drops below 30 kcal/kg FFM for 3+ consecutive days, display:

> **Low energy availability detected.** Your calorie intake minus exercise expenditure is below 30 kcal/kg. Expect reduced recovery capacity. HRV may decline 10–20% until energy balance is restored. This is especially important for female athletes — low EA can disrupt menstrual function.

Required user profile fields: body weight (kg), estimated body fat % (for FFM calculation), or direct FFM if known.

---

## 7. RPE-Based Autoregulation

### 7.1 Implementation

**Research basis:** Zourdos (2016) — see `body-mode-research.md` §2.3.

Every working set includes an optional RPE field (1–10 scale). The RIR (Repetitions in Reserve) conversion is displayed as a helper:

| RPE | RIR | Meaning |
|---|---|---|
| 10 | 0 | Absolute max — could not do another rep |
| 9.5 | 0–1 | Maybe one more, maybe not |
| 9 | 1 | Definitely one more rep possible |
| 8.5 | 1–2 | One more, maybe two |
| 8 | 2 | Two more reps possible |
| 7 | 3 | Three more reps possible |
| 6 | 4+ | Moderate effort, clearly submaximal |

### 7.2 Target RPE by Training Phase

| Goal | Target RPE | Notes |
|---|---|---|
| Hypertrophy | 6–8 (2–4 RIR) | Sufficient stimulus without excessive fatigue |
| Strength | 8–9 (1–2 RIR) | Heavy loads, controlled proximity to failure |
| Deload | 5–6 (4+ RIR) | Light, technical practice |
| Test / PR | 9.5–10 (0–1 RIR) | Only on high-readiness days |

### 7.3 Load Adjustment Logic

After a session, the system analyzes RPE trends per exercise:

```typescript
function suggestLoadChange(recentSets: WorkoutSet[]): "increase" | "hold" | "decrease" {
  const avgRPE = recentSets.reduce((s, set) => s + (set.rpe ?? 0), 0) / recentSets.length;
  const targetRPE = 7.5; // mid-range for hypertrophy

  if (avgRPE <= 6.5) return "increase";   // too easy — add 2.5–5 lbs next time
  if (avgRPE >= 9.0) return "decrease";   // too hard — drop 5–10% next time
  return "hold";                            // in the zone
}
```

Display on next-session exercise card:

- **"↑ Increase weight"** — Last session average RPE ≤ 6.5. Suggest +2.5 kg (barbell) or +1–2 kg (dumbbell).
- **"→ Hold weight"** — Last session RPE 7–8.5. Maintain load, focus on rep quality.
- **"↓ Decrease weight"** — Last session RPE ≥ 9. Reduce 5–10%.

### 7.4 RPE Creep as Fatigue Signal

When average session RPE increases by ≥1 point over 2 weeks at the same loads, this is "RPE creep" — a key fatigue accumulation marker. This feeds into the deload detection composite score (§4.4) at double weight (+2 points) because it's one of the most reliable subjective overreaching signals.

---

## 8. Cross-Mode Integration

### 8.1 Experiments on the Workout Page

When the user has active Mind Mode experiments, the workout start screen shows relevant experiment prompts:

```
Active Experiment: "Pre-workout caffeine timing"
→ Did you have caffeine before this session? [Yes] [No] [Skip]
```

Tapping Yes/No creates an `ExperimentLog` entry (treatment/control) for today. This eliminates the need to navigate to Mind Mode separately — experiment logging happens in context.

### 8.2 Workout Data as Experiment Variables

Body Mode data can serve as dependent variables in Mind Mode experiments. Expand `fetchMetricValues` in `correlation.ts` to support:

```typescript
// Add to metricSource options:
if (metricSource === "WorkoutSession") {
  rows = await prisma.workoutSession.findMany({
    where: { date: { gte: minDay, lte: maxDay } },
  });
}
```

This enables experiments like:
- "Does morning sunlight exposure improve my session RPE?" (DV: sessionRPE from WorkoutSession)
- "Does meditation before training reduce perceived effort?" (DV: sessionRPE)
- "Does creatine supplementation increase training volume?" (DV: sessionVolume)

### 8.3 Automatic Training Insights

The existing `insights.ts` correlation engine extends to workout data automatically. Once enough workout sessions accumulate (14+), the system can surface:

- "Your squat volume is 18% higher on follicular phase days (p=0.04)"
- "Session RPE is 1.2 points lower when you sleep 7+ hours (p=0.02)"
- "Next-day readiness drops 11% after sessions exceeding 15,000 lbs volume (p=0.07)"

---

## 9. Arduino IMU — Bar Velocity Integration

### 9.1 Hardware

*Full build guide in `arduino-build-guide.md`*

| Component | Model | Purpose |
|---|---|---|
| Microcontroller | ESP32-S3 or Arduino Nano 33 BLE | BLE + 6-axis IMU |
| IMU | MPU6050 or LSM6DSO | Accelerometer + gyroscope |
| Power | LiPo 500mAh + TP4056 charger | Wireless operation |
| Enclosure | 3D printed clip mount | Attaches to barbell sleeve |

### 9.2 Velocity Calculation

**Research basis:** González-Badillo (2010) — see `body-mode-research.md` §2.2.

The IMU captures 3-axis accelerometer data at 200+ Hz. Mean concentric velocity (MCV) is computed by:

1. Detect rep start: acceleration exceeds gravity by threshold (>0.5 m/s²)
2. Integrate acceleration over time to get velocity: `v(t) = ∫ a(t) dt`
3. Detect rep end: velocity returns to ~0 (bar reaches top of movement)
4. Compute MCV: average velocity over concentric phase
5. Apply Kalman filter to reduce gyroscopic drift

**Accuracy target:** ±10% of commercial VBT devices (GymAware gold standard). Acceptable for autoregulation purposes.

### 9.3 BLE Data Protocol

The ESP32/Arduino transmits rep data over BLE GATT:

**Service UUID:** `0x1826` (Fitness Machine Service)

**Characteristic:** Custom UUID for rep data

**Payload (JSON over BLE):**

```json
{
  "rep": 3,
  "mcv": 0.52,
  "peakVelocity": 0.71,
  "rom": 0.65,
  "duration": 1.84,
  "timestamp": "2026-04-03T18:30:45Z"
}
```

| Field | Type | Unit | Description |
|---|---|---|---|
| `rep` | int | — | Rep number in current set (auto-increments) |
| `mcv` | float | m/s | Mean concentric velocity |
| `peakVelocity` | float | m/s | Peak velocity during concentric |
| `rom` | float | m | Range of motion (vertical displacement) |
| `duration` | float | s | Concentric phase duration |
| `timestamp` | string | ISO 8601 | When rep completed |

### 9.4 Velocity-Load Relationship

**Research basis:** González-Badillo (2010), r = −0.97 — see `body-mode-research.md` §2.2.

Build individual velocity-load profiles per exercise:

```typescript
interface VelocityLoadProfile {
  exerciseId: string;
  dataPoints: Array<{ load: number; velocity: number; date: string }>;
  regressionSlope: number;
  regressionIntercept: number;
  r2: number;
  estimated1RM: number; // extrapolated from regression at minimum velocity threshold
}
```

**Minimum velocity thresholds for 1RM estimation:**

| Exercise | Min Velocity at 1RM (m/s) |
|---|---|
| Back Squat | 0.30 |
| Bench Press | 0.15 |
| Deadlift | 0.15 |
| Overhead Press | 0.20 |
| Barbell Row | 0.25 |

After 5+ data points across different loads, compute linear regression on load vs velocity. Extrapolate to minimum velocity to estimate 1RM.

### 9.5 Velocity Loss Thresholds

**Research basis:** Banyard (2019) — see `body-mode-research.md` §2.2.

During a set, compare each rep's velocity to the first rep:

```typescript
function velocityLoss(firstRepVelocity: number, currentRepVelocity: number): number {
  return ((firstRepVelocity - currentRepVelocity) / firstRepVelocity) * 100;
}
```

| Training Goal | Threshold | Action |
|---|---|---|
| Power | 10% loss | Alert: "Velocity dropping — rack it for power preservation" |
| Strength | 15% loss | Alert: "Approaching velocity threshold for strength" |
| Hypertrophy | 20–25% loss | Alert: "Good volume stimulus — 1–2 reps left at this quality" |
| Max volume | 30% loss | Alert: "High fatigue — terminate set" |

### 9.6 API Integration

```
POST   /api/velocity/rep           Receive single rep data from BLE
GET    /api/velocity/session/:id   Get all velocity data for a session
GET    /api/velocity/profile/:exerciseId   Get velocity-load profile
POST   /api/velocity/calibrate     Run regression on accumulated data points
```

---

## 10. Build Order

| Step | What | Days (est.) | Depends On |
|---|---|---|---|
| 1 | Prisma models: Exercise, WorkoutSession, WorkoutSet, WorkoutTemplate | 1 | — |
| 2 | Seed exercise library (~50 exercises) | 1 | Step 1 |
| 3 | Exercise API routes (CRUD, search, filter) | 1 | Step 1 |
| 4 | Workout session + set API routes | 2 | Step 1 |
| 5 | Workout logging UI (session → exercise → sets flow) | 3 | Steps 2, 3, 4 |
| 6 | Progressive overload: volume load, e1RM, PR detection | 2 | Step 4 |
| 7 | Volume zones: weekly sets per muscle group vs MEV/MAV/MRV | 2 | Step 6 |
| 8 | RPE autoregulation: load adjustment suggestions | 1 | Step 4 |
| 9 | Readiness tier integration on workout start screen | 1 | Step 5 |
| 10 | Cycle-phase overlays: ACL warning, RPE context, phase guidance | 1 | Step 5 |
| 11 | Nutrition display on workout page (protein target, EA warning) | 1 | Step 5 |
| 12 | Cross-mode: experiment prompts on workout page | 1 | Step 5 |
| 13 | Deload detection: composite fatigue score + HRV CV | 2 | Step 6, 7, 8 |
| 14 | Workout templates: save/load | 1 | Step 5 |
| 15 | Workout history view | 1 | Step 4 |
| 16 | Correlation engine extension: WorkoutSession as DV source | 1 | Step 4 |
| 17 | Arduino IMU: BLE endpoint + velocity display + profiles | 3 | Step 4 |

**Total estimated: ~22–25 working days**

Critical path: Models → API → Logging UI → Progressive overload → Volume zones → Deload detection.

Steps 8, 10, 11, 12, 14 can run in parallel once the logging UI is built.
