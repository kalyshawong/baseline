# Phase 2 Spec — Mind Mode

**Version:** 0.1
**Author:** Kalysha
**Last Updated:** 2026-04-03
**Status:** Draft
**Depends on:** Phase 1 (Oura sync, Baseline Score, cycle tracking)

---

## Why Mind Mode Ships First

Mind Mode is Baseline's differentiator. Every fitness app has a workout logger. No consumer app has structured n=1 self-experimentation with biometric correlation.

Three strategic reasons to ship Mind Mode before Body Mode:

1. **It's novel.** The experiment framework — hypothesis, structured logging, statistical correlation against biometric data — doesn't exist in any competitor product. This is what makes Baseline a personal performance *operating system* instead of another gym tracker.

2. **Its infrastructure feeds everything.** Mind Mode requires three systems that Body Mode will reuse directly: an activity tagging system (workouts are tagged activities), a correlation engine (training load vs recovery is a correlation), and time-series visualization (progressive overload charts and experiment charts use the same renderer). Build the general system first, constrain it for workouts later.

3. **Data compounds.** Experiments need duration to produce signal — minimum 14 days per condition, ideally 30+. Starting now means 60+ days of real experiment data by the time Body Mode ships. By portfolio time (Q3/Q4 2026), Mind Mode will have months of accumulated results. That's a fundamentally stronger demo than a workout logger launched two months ago.

See `build-sequence-rationale.md` for the full argument.

---

## 1. Experiment Framework

### 1.1 Data Model

#### Experiment

```prisma
model Experiment {
  id                  String   @id @default(cuid())
  title               String
  hypothesis          String   // "Lo-fi music before bed improves deep sleep"
  independentVariable String   // "lo-fi music before bed"
  dependentVariable   String   // "deep sleep duration"
  dependentMetric     String   // "deepSleepDuration" — maps to a field in DailySleep/DailyReadiness
  metricSource        String   // "DailySleep" | "DailyReadiness" | "DailyStress" | "HeartRateSample"
  startDate           DateTime
  endDate             DateTime?
  minDays             Int      @default(14) // minimum days per condition before analysis
  status              String   @default("draft") // draft | active | completed | analyzed
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  logs                ExperimentLog[]
  tags                ActivityTag[]
}
```

**Field notes:**

- `dependentMetric` is a direct mapping to a Prisma field name. The correlation engine uses this to query the right biometric table and field. Valid values include: `deepSleepDuration`, `remSleepDuration`, `sleepEfficiency`, `averageHrv`, `lowestHeartRate`, `score` (readiness or sleep), `temperatureDeviation`, `stressHigh`, `recoveryHigh`.
- `metricSource` tells the engine which table to query. This avoids ambiguity when field names overlap (e.g., `score` exists in both DailyReadiness and DailySleep).
- `minDays` defaults to 14 but can be extended for longer experiments. The UI should warn if analysis is requested before minimum is met.
- `status` lifecycle: draft → active (when first log is recorded) → completed (when user ends it or endDate passes) → analyzed (when correlation engine has run).

#### ExperimentLog

```prisma
model ExperimentLog {
  id               String   @id @default(cuid())
  experimentId     String
  experiment       Experiment @relation(fields: [experimentId], references: [id], onDelete: Cascade)
  day              DateTime // date of the log entry (one per day per experiment)
  independentValue Boolean  // true = condition applied, false = control day
  intensity        Float?   // optional: 0.0–1.0 scale for variable-intensity IVs
  notes            String?
  createdAt        DateTime @default(now())

  @@unique([experimentId, day])
}
```

**Field notes:**

- `independentValue` is boolean for simple A/B experiments: did I do the thing today (true) or not (false)?
- `intensity` is optional and supports variable-dose experiments. Example: "Does meditation duration affect HRV?" — `independentValue=true`, `intensity=0.5` (30 min of a 60 min target). For boolean-only experiments, this stays null.
- The `@@unique` constraint on `[experimentId, day]` ensures one log per experiment per day. Upsert pattern on the API side.

#### ActivityTag

```prisma
model ActivityTag {
  id           String      @id @default(cuid())
  tag          String      // "lo-fi", "caffeine", "meditation", "cold-shower"
  category     String      // "music" | "breathing" | "caffeine" | "alcohol" | "meditation" | "exercise" | "social" | "study" | "custom"
  timestamp    DateTime    @default(now())
  metadata     String?     // JSON string for flexible extra data: {"duration_min": 20, "type": "box breathing"}
  experimentId String?     // optional link to an active experiment
  experiment   Experiment? @relation(fields: [experimentId], references: [id])
  createdAt    DateTime    @default(now())
}
```

**Field notes:**

- Tags are the universal logging primitive. A tag is "I did X at time Y." This is the same system that Body Mode will use — a workout is a structured collection of tags (exercise name, sets, reps, weight).
- `metadata` is a JSON string for flexibility. Different tag categories have different useful metadata: music tags might have `{"genre": "lo-fi", "duration_min": 45}`, caffeine tags might have `{"mg": 200, "source": "coffee"}`, exercise tags might have `{"type": "strength", "duration_min": 60}`.
- `experimentId` optionally links a tag to an active experiment. When logging for an experiment, the tag is automatically associated. Unlinked tags are still useful for retrospective analysis.

### 1.2 API Routes

```
POST   /api/experiments              Create new experiment
GET    /api/experiments              List all experiments (filterable by status)
GET    /api/experiments/:id          Get experiment detail + logs + analysis
PATCH  /api/experiments/:id          Update experiment (title, status, endDate)
DELETE /api/experiments/:id          Delete experiment and cascade logs

POST   /api/experiments/:id/logs     Create/upsert daily log
GET    /api/experiments/:id/logs     List logs for experiment
DELETE /api/experiments/:id/logs/:id Delete a log entry

POST   /api/experiments/:id/analyze  Trigger correlation analysis
GET    /api/experiments/:id/results  Get analysis results

POST   /api/tags                     Create activity tag
GET    /api/tags                     List tags (filterable by date range, category)
DELETE /api/tags/:id                 Delete tag
```

### 1.3 Experiment Lifecycle

```
                 ┌──────────┐
                 │  DRAFT   │  User defines hypothesis, IV, DV, metric
                 └────┬─────┘
                      │ First log recorded
                      ▼
                 ┌──────────┐
                 │  ACTIVE  │  Daily logging in progress
                 └────┬─────┘
                      │ User ends OR endDate reached
                      ▼
                 ┌──────────┐
                 │ COMPLETED│  Logging closed, ready for analysis
                 └────┬─────┘
                      │ Correlation engine runs
                      ▼
                 ┌──────────┐
                 │ ANALYZED │  Results available with insights
                 └──────────┘
```

**Automatic transitions:**

- Draft → Active: on first ExperimentLog creation
- Active → Completed: when `endDate` is reached (checked by daily cron) or user manually ends
- Completed → Analyzed: triggered by user or auto-run after completion

**Re-analysis:** Users can re-trigger analysis on any completed/analyzed experiment (e.g., after more data syncs).

---

## 2. Example Experiments

These ship as pre-built templates. The user can start any of them with one tap, or create custom experiments.

### 2.1 "Does lo-fi music before bed improve my deep sleep?"

| Field | Value |
|---|---|
| **Hypothesis** | Listening to lo-fi music in the 30 minutes before bed increases deep sleep duration |
| **Independent variable** | Lo-fi music before bed (yes/no) |
| **Dependent variable** | Deep sleep duration |
| **Dependent metric** | `deepSleepDuration` from `DailySleep` |
| **Recommended duration** | 30 days (15 nights with, 15 without) |
| **Logging** | Each night before bed: tag "lo-fi" or log control (no music). Next morning: Oura syncs sleep data automatically. |
| **Expected insight** | "Lo-fi music before bed correlates with 12% higher deep sleep (p=0.04, n=21 nights)" |

### 2.2 "Does box breathing before high-stress events lower my RHR?"

| Field | Value |
|---|---|
| **Hypothesis** | 5 minutes of box breathing before known stressful events reduces resting heart rate in the following hours |
| **Independent variable** | Box breathing session (yes/no) |
| **Dependent variable** | Resting heart rate |
| **Dependent metric** | `lowestHeartRate` from `DailySleep` (proxy for daily RHR trend) |
| **Recommended duration** | 28 days |
| **Logging** | Before a stressful event (meeting, exam, presentation): tag "box breathing" with metadata `{"duration_min": 5}`. On control days: no intervention. |
| **Expected insight** | "Box breathing correlates with 3 BPM lower resting HR on intervention days (p=0.08, n=14)" |

### 2.3 "Does morning sunlight exposure improve my next-night HRV?"

| Field | Value |
|---|---|
| **Hypothesis** | 15+ minutes of morning sunlight within 1 hour of waking improves HRV the following night |
| **Independent variable** | Morning sunlight exposure (yes/no) |
| **Dependent variable** | Average HRV |
| **Dependent metric** | `averageHrv` from `DailySleep` (next night — note the +1 day offset) |
| **Recommended duration** | 30 days |
| **Logging** | Morning: tag "sunlight" with metadata `{"duration_min": 20}`. The correlation engine should check next-night HRV, not same-night. |
| **Note** | This experiment requires a +1 day lag in the correlation. The engine needs to support configurable lag between IV and DV. |

### 2.4 "Which pre-workout routine gives me the best session RPE?"

| Field | Value |
|---|---|
| **Hypothesis** | Pre-workout routine type affects session difficulty rating |
| **Independent variable** | Pre-workout routine (caffeine only / dynamic warm-up / caffeine + warm-up / nothing) |
| **Dependent variable** | Session RPE (rate of perceived exertion, 1–10) |
| **Dependent metric** | Custom — this uses `intensity` field on ExperimentLog as the DV instead of a biometric |
| **Recommended duration** | 40 days (10 sessions per condition) |
| **Logging** | Before training: tag pre-workout routine type. After training: log session RPE in experiment log. |
| **Note** | This is a multi-condition experiment (4 groups, not binary A/B). The correlation engine needs to support categorical IV comparison, not just binary. V1 can simplify to binary (caffeine yes/no) and expand in V2. |

### 2.5 "Does caffeine after 2pm reduce my deep sleep?"

| Field | Value |
|---|---|
| **Hypothesis** | Consuming caffeine after 2:00 PM reduces deep sleep duration that night |
| **Independent variable** | Afternoon caffeine (yes/no) |
| **Dependent variable** | Deep sleep duration |
| **Dependent metric** | `deepSleepDuration` from `DailySleep` |
| **Recommended duration** | 28 days |
| **Logging** | Afternoon: tag "caffeine" with metadata `{"time": "14:30", "mg": 200, "source": "coffee"}` if consumed after 2 PM. No tag = control day. |
| **Expected insight** | "Caffeine after 2 PM correlates with 18% lower deep sleep (p=0.02, n=12 nights)" |

---

## 3. Tagging System

### 3.1 Preset Categories and Tags

| Category | Preset Tags | Metadata Fields |
|---|---|---|
| **Music** | lo-fi, classical, ambient, binaural, none | `genre`, `duration_min` |
| **Breathing** | box breathing, wim hof, 4-7-8, physiological sigh | `duration_min`, `rounds` |
| **Caffeine** | coffee, espresso, matcha, pre-workout, none | `mg`, `time`, `source` |
| **Alcohol** | wine, beer, spirits, none | `units`, `time` |
| **Meditation** | guided, unguided, body scan, walking | `duration_min`, `app` |
| **Exercise** | strength, cardio, yoga, walk, rest day | `duration_min`, `type`, `rpe` |
| **Social** | social event, alone time, deep conversation | `duration_min`, `energy_level` |
| **Study** | deep work, reading, lecture, practice | `duration_min`, `focus_rating` |

### 3.2 Custom Tags

Users can create custom tags with any name and category. Custom tags are stored in the same `ActivityTag` table with `category: "custom"`.

Examples: "cold shower", "sauna", "creatine", "magnesium", "journaling", "screen time cutoff", "weighted blanket".

### 3.3 Quick-Tag UI

The tagging interface should be optimized for speed — logging a tag should take under 5 seconds:

- **Grid of category buttons** on the main dashboard or a dedicated tag screen
- Tap category → see preset tags → tap one → done (with optional metadata expansion)
- **Recent tags** row at the top for one-tap re-logging of frequently used tags
- **Timestamp** is automatic (now). Long-press to backdate.
- **Experiment link** is automatic if the tag's category matches an active experiment's IV.

### 3.4 Tag → Biometric Correlation (Passive)

Even outside of structured experiments, the system should passively correlate all tags with biometric outcomes over time. This enables retrospective insights:

- "You've tagged 'alcohol' 8 times in the past 30 days. On those nights, your average HRV was 32ms vs. 41ms on non-alcohol nights."
- "You've tagged 'meditation' before training 6 times. Those sessions had an average RPE of 6.2 vs. 7.1 without."

These passive correlations surface on a dedicated "Insights" page once enough data accumulates (minimum 10 tagged instances of a given tag).

---

## 4. Correlation Engine

### 4.1 Architecture

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────┐
│  Experiment   │────▶│  Correlation Engine │────▶│   Results    │
│  Logs (IV)    │     │                    │     │   + Insights │
├──────────────┤     │  1. Fetch IV logs   │     ├──────────────┤
│  Activity     │────▶│  2. Fetch DV data   │     │  Effect size │
│  Tags         │     │  3. Align by date   │     │  p-value     │
├──────────────┤     │  4. Compute stats   │     │  Confidence  │
│  Oura Data    │────▶│  5. Generate insight│     │  Narrative   │
│  (DV)         │     └────────────────────┘     │  Chart data  │
└──────────────┘                                  └──────────────┘
```

### 4.2 Statistical Methods

**Binary A/B experiments (V1 — ship this first):**

1. Split days into two groups: treatment (independentValue = true) and control (independentValue = false).
2. For each group, collect the dependent metric values from the corresponding Oura data.
3. Run **Welch's two-sample t-test** (unequal variance assumed) to compare group means.
4. Calculate:
   - **Mean difference** (treatment mean − control mean)
   - **Percentage difference** ((treatment − control) / control × 100)
   - **p-value** from t-test
   - **Cohen's d** effect size (small: 0.2, medium: 0.5, large: 0.8)
   - **95% confidence interval** on the mean difference
5. **Significance threshold:** p < 0.05 = "statistically significant." p < 0.10 = "suggestive trend." p ≥ 0.10 = "no significant difference detected."

**Implementation (TypeScript):**

```typescript
interface CorrelationResult {
  treatmentMean: number;
  controlMean: number;
  meanDifference: number;
  percentDifference: number;
  pValue: number;
  cohensD: number;
  confidenceInterval: [number, number];
  significance: "significant" | "suggestive" | "not_significant";
  treatmentN: number;
  controlN: number;
  insight: string; // natural language summary
}
```

Welch's t-test implementation (no external stats library needed):

```typescript
function welchTTest(a: number[], b: number[]): { t: number; df: number; p: number } {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  const varA = a.reduce((s, v) => s + (v - meanA) ** 2, 0) / (a.length - 1);
  const varB = b.reduce((s, v) => s + (v - meanB) ** 2, 0) / (b.length - 1);

  const se = Math.sqrt(varA / a.length + varB / b.length);
  const t = (meanA - meanB) / se;

  // Welch-Satterthwaite degrees of freedom
  const num = (varA / a.length + varB / b.length) ** 2;
  const denom =
    (varA / a.length) ** 2 / (a.length - 1) +
    (varB / b.length) ** 2 / (b.length - 1);
  const df = num / denom;

  // p-value from t-distribution (use jstat or implement regularized incomplete beta)
  const p = tDistPValue(Math.abs(t), df); // two-tailed

  return { t, df, p };
}
```

**For p-value computation**, use the `jstat` npm package (`jStat.studentt.cdf`) or implement the regularized incomplete beta function. `jstat` is lightweight and well-tested.

**Configurable lag (for experiments like sunlight → next-night HRV):**

```typescript
interface ExperimentConfig {
  lagDays: number; // default 0; set to 1 for "next-night" experiments
}
```

When `lagDays > 0`, the engine shifts the DV data forward by N days when aligning with IV logs. This enables experiments where the intervention today affects tomorrow's biometrics.

### 4.3 Insight Generation

The engine produces a natural language insight string for each analyzed experiment:

**Template:**

```
"{IV description} correlates with {percent_diff}% {higher|lower} {DV description}
(p={p_value}, n={treatment_n} {condition} days vs {control_n} control days,
effect size: {cohens_d_label})"
```

**Examples:**

- "Lo-fi music before bed correlates with 12% higher deep sleep (p=0.04, n=15 music nights vs 16 control nights, effect size: medium)"
- "Caffeine after 2 PM correlates with 18% lower deep sleep (p=0.02, n=12 caffeine days vs 16 control days, effect size: large)"
- "Box breathing shows a suggestive trend toward 3 BPM lower resting HR (p=0.08, n=14 sessions vs 14 control days, effect size: small)"
- "Morning sunlight exposure shows no significant effect on next-night HRV (p=0.34, n=13 sun days vs 17 control days)"

### 4.4 Minimum Data Requirements

| Condition | Minimum | Recommended | Required For |
|---|---|---|---|
| Days per group (treatment/control) | 7 | 14+ | Any analysis |
| Total experiment days | 14 | 28+ | Statistical significance |
| Oura data coverage | 80% | 90%+ | Reliable results |

If minimums aren't met, show a progress indicator: "12/14 treatment days logged — 2 more days until analysis is available."

### 4.5 Limitations and Caveats

The system should always display these caveats alongside results:

- **Correlation ≠ causation.** These are observational n=1 findings, not controlled experiments. Confounders exist.
- **Small sample size.** Even at 30 days, statistical power is limited. Effect sizes matter more than p-values at this scale.
- **Behavioral bias.** Logging itself may change behavior (Hawthorne effect). Days you remember to log might systematically differ from days you forget.
- **Individual variation.** Results apply to you specifically and may not generalize.

Display a permanent footnote on the results page: *"These are personal observations, not medical advice. Correlations found in n=1 experiments have limited statistical power and should be treated as hypotheses for further investigation."*

---

## 5. Environment Sensor

### 5.1 Hardware

| Component | Model | Interface | Purpose |
|---|---|---|---|
| Microcontroller | ESP32-WROOM DevKit | — | WiFi + GPIO + ADC |
| Temp/Humidity/Pressure | BME280 | I2C (GPIO 21/22) | Room climate |
| Air Quality | PMS5003 | UART (GPIO 16/17) | PM2.5 particulate |
| Noise Level | MAX4466 | Analog (GPIO 34) | Ambient noise (dB proxy) |

**Wiring notes:**

- PMS5003 outputs 5V UART. ESP32 RX is 3.3V tolerant only. Use voltage divider: 10kΩ + 20kΩ resistors on the PMS5003 TX → ESP32 RX line.
- BME280 runs on 3.3V I2C. Default address 0x76.
- MAX4466 outputs analog 0–3.3V proportional to sound amplitude. Use ESP32 ADC with averaging (sample 100ms window, compute RMS) to approximate dB.
- Power: 5V/1A USB adapter. PMS5003 draws ~100mA during active measurement.

**Parts status:** Ordered on Amazon ($47.36 for core components). Need to add breadboard, jumper wires, and resistor kit (~$18).

### 5.2 Firmware

Language: Arduino C++ (wider ESP32 library support than MicroPython for these sensors).

**Libraries:**

- `WiFi.h` — ESP32 WiFi
- `HTTPClient.h` — HTTP POST to Baseline
- `Adafruit_BME280.h` — BME280 I2C
- `PMS.h` (or manual UART) — PMS5003
- ADC for MAX4466

**Sampling strategy:**

- BME280 + MAX4466: read every 60 seconds (low power)
- PMS5003: read every 15 minutes (fan spin-up takes 30s, draws significant power). The Plantower datasheet recommends 30s warm-up for accurate readings.
- Batch readings and POST to Baseline every 5 minutes

**Data payload (JSON):**

```json
{
  "device_id": "env-sensor-bedroom",
  "timestamp": "2026-04-03T23:15:00Z",
  "pm25": 8.2,
  "temperature": 21.4,
  "humidity": 45.2,
  "pressure": 1013.25,
  "noise_db": 32.1
}
```

### 5.3 Data Model

```prisma
model EnvReading {
  id          String   @id @default(cuid())
  deviceId    String   @default("env-sensor-bedroom")
  timestamp   DateTime
  pm25        Float?   // μg/m³
  temperature Float?   // °C
  humidity    Float?   // %
  pressure    Float?   // hPa
  noiseDb     Float?   // approximate dB
  lux         Float?   // reserved for future light sensor
  createdAt   DateTime @default(now())

  @@index([timestamp])
  @@index([deviceId, timestamp])
}
```

### 5.4 Environment ↔ Sleep Correlation

The correlation engine (same one used by Mind Mode) can treat environment readings as independent variables:

- **PM2.5 threshold analysis:** Compare sleep quality on nights with PM2.5 < 12 μg/m³ (good) vs > 25 μg/m³ (moderate). WHO guideline is 15 μg/m³ annual mean.
- **Temperature sweet spot:** Correlate bedroom temperature at bedtime with deep sleep. Literature suggests 18–20°C is optimal.
- **Noise level:** Correlate average noise dB during sleep window with sleep efficiency and awake time.
- **Humidity:** Very dry (< 30%) or very humid (> 60%) air may affect sleep quality.

These correlations run automatically once enough data accumulates (14+ nights with env data). Surface insights like:

- "Your deep sleep is 22% higher on nights when bedroom temperature is below 20°C (p=0.03, n=18)"
- "PM2.5 above 25 μg/m³ correlates with 15% lower sleep efficiency (p=0.06, n=8 nights)"
- "Noise levels above 40 dB correlate with 25% more awake time (p=0.01, n=12 nights)"

### 5.5 Ingestion Endpoint

```
POST /api/env-readings
Authorization: Bearer <SENSOR_API_KEY>

Body: { device_id, timestamp, pm25, temperature, humidity, pressure, noise_db }

Response: 201 Created | 400 Bad Request | 401 Unauthorized
```

The sensor authenticates with a static API key stored in the ESP32 firmware and in Baseline's `.env`. This is single-user, single-device — no need for OAuth complexity here.

---

## 6. Infrastructure Reuse Map

This is how Mind Mode's systems map to future features:

| Mind Mode System | Body Mode Reuse | Environment Reuse |
|---|---|---|
| **ActivityTag model** | Workouts logged as structured tags | Env conditions as automatic tags |
| **ExperimentLog model** | Workout sets are experiment logs (exercise = IV, volume = value) | — |
| **Correlation engine** | "Does leg day readiness predict squat PR?" | "Does PM2.5 affect HRV?" |
| **Time-series charts** | Progressive overload trends, volume charts | Env condition trends, sleep overlay |
| **Insight generator** | "Your squat volume is up 12% this month" | "Sleep is 18% worse when noise > 40dB" |
| **Quick-tag UI** | "Start workout" button = structured tag flow | Automatic (sensor pushes data) |
| **Date-aligned data retrieval** | Align workout data with next-day readiness | Align env data with same-night sleep |

Body Mode doesn't need to build these systems from scratch — it constrains and extends what Mind Mode already built.

---

## 7. Build Order Within Phase 2a

| Step | What | Days (est.) | Depends On |
|---|---|---|---|
| 0 | Fix Phase 1 critical bugs (6 items) | 2–3 | — |
| 1 | Prisma migration: Experiment + ExperimentLog + ActivityTag + EnvReading | 1 | Step 0 |
| 2 | API routes: CRUD for experiments and logs | 2 | Step 1 |
| 3 | Tagging system: API + quick-tag UI | 2 | Step 1 |
| 4 | Experiment creation UI + templates | 2 | Step 2 |
| 5 | Experiment logging UI (daily log flow) | 2 | Step 2, 3 |
| 6 | Correlation engine (Welch's t-test + insight generator) | 3 | Step 2 |
| 7 | Experiment results visualization | 2 | Step 6 |
| 8 | Mind Mode dashboard (active experiments, recent tags, insights) | 2 | Step 4, 5, 7 |
| 9 | Env sensor HTTP endpoint + EnvReading storage | 1 | Step 1 |
| 10 | Env dashboard + env ↔ sleep correlation | 2 | Step 6, 9 |

**Total estimated: ~19–21 working days**

Steps 2 and 3 can run in parallel. Steps 4 and 6 can run in parallel. The critical path is: bug fixes → migration → API routes → correlation engine → results viz → dashboard.

---

## Appendix: Dependencies

**New npm packages:**

- `jstat` — statistical distributions (t-distribution CDF for p-value calculation). ~12KB gzipped.
- `cuid` or use Prisma's `@default(cuid())` — already built into Prisma.

**No other new dependencies required.** Recharts (already installed) handles all visualization. Prisma (already installed) handles all data modeling.
