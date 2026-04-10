# Baseline Variables — Scientific Research & Performance Categorization

**Last Updated:** 2026-04-09
**Purpose:** Comprehensive categorization of every Baseline variable by which performance domain it informs — strength training, Hyrox, and/or running — with peer-reviewed evidence for each variable's relevance. This document complements `body-mode-research.md` by expanding scope to all three performance domains and covering the full variable inventory.

---

## How to Read This Document

Each variable is mapped to one or more performance domains using these tags:

- **🏋️ STR** — Strength training (hypertrophy, maximal strength, power)
- **🏃 RUN** — Running performance (economy, endurance, speed)
- **🔥 HYR** — Hyrox (hybrid fitness: 8×1km runs + 8 functional stations)

Variables are grouped by data source (Oura, Apple Watch, workout logs, etc.) and each includes: what it measures, which domains it serves, and the scientific basis for its relevance.

---

## 1. Sleep Variables (DailySleep)

Sleep is the single most powerful recovery lever across all three domains. The variables below differentiate *how* sleep affects each type of performance.

### 1.1 totalSleepDuration
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Total time asleep per night. The foundational recovery metric.

**Science:** Mah et al. (2011) showed that extending sleep to 10 hours/night in collegiate basketball players improved sprint times by 0.7s and free throw accuracy by 9%. Partial sleep restriction (≤6h for 3 nights) reduces maximal strength on bench press, leg press, and deadlift (Reilly & Piercy, 1994). A single night of total sleep deprivation reduces muscle protein synthesis by 18% and increases cortisol by 21% (Lamon et al., 2021). For endurance, Skein et al. (2011) found that 30h of sleep deprivation reduced intermittent sprint performance by 2.9%, with mean sprint time significantly slower — directly relevant to Hyrox's repeated run-station format.

**Baseline target:** 7–9 hours. Below 6h for 2+ nights should trigger recovery warnings across all three domains.

### 1.2 deepSleepDuration
**Domains:** 🏋️ STR (primary) | 🏃 RUN | 🔥 HYR

Time spent in NREM Stage 3 (slow-wave sleep).

**Science:** Approximately 70% of daily growth hormone (GH) secretion occurs during deep sleep (Sassin et al., 1969; Brandenberger & Weibel, 2004). GH drives muscle protein synthesis, collagen repair, and fat metabolism — all critical for strength athletes. For runners and Hyrox athletes, GH also repairs connective tissue and tendons stressed by impact loading. Deep sleep is when the body does its heaviest structural repair work.

**Baseline target:** 1.5–2h (20–25% of total sleep). Below 1h for 3+ consecutive nights impairs recovery across all domains.

### 1.3 remSleepDuration
**Domains:** 🏋️ STR (motor learning) | 🏃 RUN (technique consolidation) | 🔥 HYR

Time spent in REM sleep.

**Science:** REM sleep consolidates motor learning — the neural patterns acquired during training (Dattilo et al., 2011; Walker & Stickgold, 2004). This matters most when learning new movement patterns: Olympic lifts, running form changes, or Hyrox station technique (wall balls, burpee broad jumps). REM also supports glycogen replenishment in muscles, affecting next-day endurance capacity.

**Strength-specific:** When introducing new exercises or complex movements, low REM (<1.5h) means the nervous system hasn't fully encoded the new patterns. Recommend familiar movements over novel ones on low-REM days.

**Running-specific:** Runners working on gait modifications (cadence changes, forefoot striking) need adequate REM to consolidate those changes.

### 1.4 sleepEfficiency
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Percentage of time in bed actually spent asleep.

**Science:** Sleep efficiency below 85% is clinically considered poor sleep quality (Ohayon et al., 2017). Low efficiency indicates fragmented sleep, which disrupts the architecture of sleep cycles — reducing both deep and REM phases even when total time in bed appears adequate. For athletes, fragmented sleep elevates next-day cortisol and suppresses testosterone regardless of total sleep duration (Leproult & Van Cauter, 2011).

**Baseline target:** ≥85%. Below 75% should amplify recovery warnings.

### 1.5 latency
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (indirect — recovery quality indicator)

Time to fall asleep after getting into bed.

**Science:** Sleep onset latency >30 minutes is a marker of hyperarousal, often driven by elevated sympathetic nervous system activity (Bonnet & Arand, 2010). In athletes, prolonged latency correlates with overtraining states and excessive pre-sleep screen exposure. Latency <8 minutes may indicate sleep debt (excessive sleepiness). The sweet spot is 10–20 minutes.

**Practical use:** A trending increase in latency over 7+ days, combined with elevated RHR, may signal sympathetic overactivation from accumulated training stress.

### 1.6 averageHeartRate (sleep) & lowestHeartRate
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Average and nadir heart rate during sleep.

**Science:** Resting heart rate during sleep is the cleanest measure of cardiac autonomic status, free from daytime confounders. An RHR increase of ≥5 BPM above individual baseline sustained for 3+ days is associated with incomplete recovery or early overreaching (Uusitalo et al., 1998). Conversely, a gradually declining RHR trend over weeks indicates improving cardiovascular fitness — relevant to all three domains but especially endurance (running, Hyrox).

**Strength-specific:** Elevated sleep HR after heavy training days is normal; sustained elevation across rest days is not.
**Endurance-specific:** Lowest HR is a proxy for parasympathetic capacity. Lower values generally indicate better aerobic fitness and recovery status.

### 1.7 averageHrv (sleep)
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Nightly heart rate variability (Oura reports Ln RMSSD).

**Science:** The single most researched recovery metric in sports science. Plews et al. (2013) established the 7-day rolling average of Ln RMSSD as the gold standard for monitoring training adaptation. Kiviniemi et al. (2007) demonstrated that HRV-guided training improved VO2max by 4 mL/kg/min with 25% less high-intensity work. Flatt & Esco (2016) showed that elevated HRV coefficient of variation (CV) over 2–3 weeks is an early marker of non-functional overreaching.

**Strength-specific:** HRV sensitivity to resistance training overreaching is lower than endurance — combine with RPE and sleep quality (Plews et al., 2013).
**Running-specific:** HRV-guided training produces the strongest evidence base in endurance athletes.
**Hyrox-specific:** As a hybrid modality, HRV captures both the endurance and strength recovery demands.

---

## 2. Readiness Variables (DailyReadiness)

### 2.1 score (Readiness Score)
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Oura's composite readiness metric (0–100).

**Science:** Composite readiness scores that integrate HRV, RHR, sleep, and temperature have been shown to predict training tolerance better than any single variable (Thorpe et al., 2017). The Baseline Score extends Oura's readiness with cycle-phase awareness and custom weighting. Evidence supports using composite scores as session-intensity gates: high readiness → high intensity; low readiness → recovery or technique work.

### 2.2 temperatureDeviation & temperatureTrendDeviation
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Deviation of skin temperature from personal baseline.

**Science:** Elevated body temperature during sleep is one of the earliest markers of illness onset — preceding symptom awareness by 1–3 days (Li et al., 2017). Training while fighting an infection prolongs illness and extends the recovery deficit. For female athletes specifically, the menstrual cycle causes predictable temperature shifts: +0.3–0.5°C during the luteal phase (Sung et al., 2014). Baseline's cycle-phase-aware temperature scoring correctly accounts for this, preventing false "illness" flags during the luteal phase.

**Additional research:** Periell et al. (2021) found that overnight skin temperature deviation >0.5°C above baseline (outside of luteal phase) predicted illness onset with 79% sensitivity. Training through undetected illness is a leading cause of prolonged performance decrements.

### 2.3 hrvBalance
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Oura's assessment of HRV relative to personal baseline.

**Science:** See §1.7. This variable contextualizes HRV within the individual's own range rather than population norms — critical because HRV varies enormously between individuals (20–200ms RMSSD) and absolute values are meaningless without personal context (Plews et al., 2013).

### 2.4 recoveryIndex
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

How quickly resting heart rate stabilizes during the night.

**Science:** Recovery index reflects parasympathetic reactivation speed. A high recovery index (HR drops early in the night and stays low) indicates good autonomic recovery. A low recovery index (HR remains elevated through the first half of sleep) suggests the body is still processing physiological stress — whether from training, alcohol, late meals, or psychological stress (Hautala et al., 2001). This is particularly useful for detecting non-training stressors that still impair recovery.

### 2.5 restingHeartRate (readiness context)
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

See §1.6 — same metric, readiness framing. Elevated RHR in the readiness context serves as a gate: if RHR is >5 BPM above 14-day average, consider reducing session intensity regardless of other readiness signals.

### 2.6 sleepBalance & activityBalance
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Multi-day rolling assessments of sleep consistency and activity load.

**Science:** Chronic sleep debt (cumulative deficit over days/weeks) is more damaging to performance than acute sleep loss. Van Dongen et al. (2003) showed that 6h/night for 14 days produced cognitive and reaction-time impairments equivalent to 2 nights of total sleep deprivation — without participants subjectively noticing. Activity balance captures whether recent training load is sustainable relative to recent recovery capacity.

---

## 3. Activity Variables (DailyActivity)

### 3.1 activeCalories & totalCalories
**Domains:** 🏋️ STR (energy availability) | 🏃 RUN (fuel balance) | 🔥 HYR (fuel balance)

Daily energy expenditure from activity and total.

**Science:** Energy availability (EA) = (calories consumed − exercise calories) ÷ fat-free mass. EA below 30 kcal/kg FFM/day triggers hormonal disruptions: suppressed T3, elevated cortisol, reduced IGF-1 and testosterone (Loucks et al., 2011). Female athletes are disproportionately affected — menstrual dysfunction occurs early in the deficit cascade. For Hyrox and running, chronic low EA also depletes glycogen stores, directly impairing endurance capacity.

**Baseline implementation:** Cross-reference with NutritionLog calories to compute daily energy availability. Flag when EA < 30 for 3+ days.

### 3.2 steps & equivalentWalkingDistance
**Domains:** 🏃 RUN (base aerobic volume) | 🔥 HYR (base aerobic volume)

Daily step count and estimated walking distance.

**Science:** Non-exercise activity thermogenesis (NEAT) contributes significantly to total energy expenditure and aerobic base. Hamasaki (2023) found that daily step counts >8,000 are associated with reduced cardiovascular mortality. For endurance athletes, NEAT supplements formal training volume without adding mechanical stress — a "free" aerobic stimulus. For strength athletes, steps are less directly performance-relevant but maintain general cardiovascular health.

### 3.3 highActivityTime / mediumActivityTime / lowActivityTime
**Domains:** 🏃 RUN | 🔥 HYR (training load distribution) | 🏋️ STR (indirect)

Time spent in different activity intensity zones.

**Science:** Seiler's polarized training model (Seiler, 2010) demonstrates that elite endurance athletes spend ~80% of training time at low intensity and ~20% at high intensity, with minimal time in the "moderate" zone. For Hyrox athletes, monitoring the distribution of high/medium/low activity time across a week reveals whether training is appropriately polarized or stuck in the "grey zone" that produces maximum fatigue with suboptimal adaptation.

### 3.4 sedentaryTime & restingTime
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (recovery context)

Time spent sedentary and resting.

**Science:** On scheduled rest days, adequate sedentary/resting time confirms the body is actually recovering. Conversely, high sedentary time on training days may indicate low NEAT, which affects total energy expenditure calculations. For athletes in caloric deficits, excessive non-training sedentary behavior is a sign of metabolic adaptation (reduced spontaneous activity) — a known consequence of aggressive dieting (Rosenbaum & Leibel, 2010).

### 3.5 metMinutes
**Domains:** 🏃 RUN | 🔥 HYR | 🏋️ STR

Metabolic equivalent minutes — a standardized measure of total training load.

**Science:** MET minutes provide a common currency for comparing different types of activity. The WHO recommends 150–300 MET minutes/week for general health. For competitive athletes, this number is much higher, but tracking MET minutes across weeks reveals training load trends that can predict overreaching when combined with recovery metrics (Foster et al., 2001).

---

## 4. Stress & Resilience Variables (DailyStress, DailyResilience)

### 4.1 stressHigh & recoveryHigh
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Duration of high-stress and high-recovery periods during the day.

**Science:** Psychological and physiological stress share the same autonomic pathway — both activate the sympathetic nervous system and suppress parasympathetic recovery. Cadegiani & Kater (2019) found that subjective stress markers (which these Oura metrics partially capture) are more sensitive early indicators of overreaching than objective biomarkers alone. Chronic high stress time with low recovery time indicates the body is spending too much time in sympathetic dominance, reducing adaptive capacity for training.

**Hyrox-specific:** Race-day performance in Hyrox depends on stress tolerance during sustained high-intensity effort. Athletes with better daily stress-recovery ratios tend to manage the psychological pressure of competition more effectively.

### 4.2 DailyResilience: level, sleepRecovery, daytimeRecovery, stress
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Oura's composite resilience assessment.

**Science:** Resilience captures the body's capacity to handle stress and recover from it. The breakdown into sleep recovery vs. daytime recovery components is useful: an athlete might recover well during sleep (high parasympathetic reactivation) but remain stressed during the day (work, life), or vice versa. Both components independently affect training readiness. Kellmann (2010) established the Recovery-Stress Questionnaire for Athletes (RESTQ-Sport), demonstrating that the balance between stress and recovery — not just the absolute level of either — predicts performance and injury risk.

---

## 5. Running-Specific Variables (DailyRunningMetrics, DailyVO2Max)

These variables are the most domain-specific in the Baseline system.

### 5.1 runningSpeed
**Domains:** 🏃 RUN (primary) | 🔥 HYR

Average running speed (km/h).

**Science:** Running speed across training sessions tracks aerobic fitness development. For Hyrox, running constitutes ~60% of total race time (Brandt et al., 2025 — 51.2 min running vs 32.8 min stations out of ~86.5 min total). Improving 1km repeat pace directly reduces Hyrox finish time. Tracking average speed over weeks reveals whether endurance training is producing pace improvements.

### 5.2 runningPower
**Domains:** 🏃 RUN (primary) | 🔥 HYR

Average power output in watts during running.

**Science:** Running power measures total mechanical work — accounting for speed, grade, wind, and running form in a single metric. Unlike pace, power is terrain-independent, making it valuable for regulating effort on varied surfaces. Stryd and Apple Watch estimates correlate moderately with metabolic cost (r ≈ 0.85) but vary between devices (Cerezuela-Espejo et al., 2020). Running power is most useful for pacing strategy in Hyrox, where fatigue from stations alters pace-to-effort ratios across the 8 running legs.

**Practical use:** If running power stays constant but pace drops through the later Hyrox runs, the athlete is maintaining effort despite peripheral fatigue — good pacing. If power drops, the athlete is fatiguing centrally.

### 5.3 groundContactTime
**Domains:** 🏃 RUN (primary) | 🔥 HYR

Average time each foot spends on the ground per stride (milliseconds).

**Science:** Ground contact time (GCT) is one of the strongest biomechanical predictors of running economy. Santos-Concejero et al. (2014) found that differences in GCT explained the running economy gap between elite North African and European runners. Shorter GCT (at the same speed) indicates more efficient force application — the foot pushes off quickly rather than spending time "braking." Moore (2016) found that GCT correlates significantly with both running economy and maximal running speed.

**Typical ranges:** Elite runners: 160–200ms. Recreational runners: 220–300ms. Improvements of 10–15ms indicate meaningful efficiency gains.

**Hyrox relevance:** GCT tends to increase as athletes fatigue through the race. Monitoring GCT drift across the 8 running segments reveals fatigue onset — useful for pacing strategy.

### 5.4 verticalOscillation
**Domains:** 🏃 RUN (primary) | 🔥 HYR

Average vertical bounce per stride (cm).

**Science:** Excessive vertical oscillation wastes energy — propelling the body upward rather than forward. A systematic review by Moore (2016) found that higher vertical oscillation is moderately associated with poorer running economy. The ideal is to minimize vertical displacement while maintaining stride length. Typical values: elite runners 6–8cm; recreational 8–12cm. However, the relationship is not perfectly linear — some vertical oscillation is necessary for elastic energy storage and return in the Achilles tendon and plantar fascia.

**Practical use:** A decreasing trend in vertical oscillation over weeks (at constant speed) indicates improving running form. An acute increase during a run indicates fatigue-induced form breakdown.

### 5.5 strideLength
**Domains:** 🏃 RUN (primary) | 🔥 HYR

Average stride length (meters).

**Science:** Stride length exists on a U-shaped curve relative to running economy — too short or too long is inefficient. Runners naturally self-optimize stride length within ~3% of their most economical stride (Cavanagh & Williams, 1982). Deviations >5% from preferred stride length at a given speed indicate either fatigue or conscious overstriding. Overstriding (foot landing ahead of center of mass) increases braking forces and injury risk, particularly for knee and tibial stress fractures (Heiderscheit et al., 2011).

**Practical use:** Track stride length at consistent speeds over time. A gradual increase at the same pace suggests improving power and flexibility. An acute decrease mid-run indicates fatigue.

### 5.6 cardioRecovery
**Domains:** 🏃 RUN | 🔥 HYR | 🏋️ STR (indirect)

Heart rate recovery — BPM drop in the first minutes post-exercise.

**Science:** Heart rate recovery (HRR) is one of the most validated markers of cardiovascular fitness and autonomic function. Daanen et al. (2012) conducted a systematic review showing that HRR at 60 seconds post-exercise is a reliable indicator of both fitness level and training adaptation. Faster HRR = better parasympathetic reactivation = better recovery capacity. A declining HRR trend over weeks, despite stable training load, suggests accumulated fatigue or overreaching.

**Hyrox-specific:** HRR between stations is critical — athletes who recover heart rate faster during the ~200m transition runs between stations can approach each station with lower cardiac drift, preserving performance across all 8 rounds.

### 5.7 respiratoryRate
**Domains:** 🏃 RUN | 🔥 HYR | 🏋️ STR (illness detection)

Breaths per minute during sleep or activity.

**Science:** Overnight respiratory rate is an emerging marker for illness detection and recovery status. Natarajan et al. (2020) found that Oura Ring respiratory rate detected COVID-19 onset 1–2 days before symptom awareness with 82% sensitivity. Beyond illness, elevated respiratory rate during sleep (>18 breaths/min in a trained athlete) can indicate metabolic stress, thermal stress, or overtraining. During exercise, respiratory rate relative to intensity reflects ventilatory threshold status — crossing into rapid, shallow breathing indicates the transition from aerobic to anaerobic metabolism.

### 5.8 walkingRunningDistance
**Domains:** 🏃 RUN | 🔥 HYR

Total daily walking and running distance (meters).

**Science:** Weekly running volume is a primary predictor of endurance performance. For Hyrox, Brandt et al. (2025) found that greater weekly endurance training volume significantly correlated with faster finish times (p = 0.04). This metric tracks cumulative locomotor stress, which is important for load management — sudden increases in weekly running distance (>10% week-over-week) are associated with increased injury risk (Gabbett, 2016 — the acute:chronic workload ratio concept).

### 5.9 physicalEffort
**Domains:** 🏃 RUN | 🔥 HYR | 🏋️ STR

Apple's composite effort score.

**Science:** This is Apple's proprietary integration of heart rate, accelerometry, and motion data into a single effort metric. While not independently validated in peer-reviewed literature, it functions similarly to session RPE × duration (sRPE), which Foster et al. (2001) established as a reliable training load metric. Tracking daily physical effort over weeks provides an accessible measure of training load accumulation.

### 5.10 vo2Max (DailyVO2Max)
**Domains:** 🏃 RUN (primary) | 🔥 HYR (primary) | 🏋️ STR (indirect)

Estimated maximal oxygen consumption (mL/kg/min).

**Science:** VO2max is the single strongest predictor of endurance performance. For Hyrox specifically, Brandt et al. (2025) found that VO2max significantly correlated with faster finish times (p = 0.01) — the strongest physiological predictor in their study. Joyner & Coyle (2008) established VO2max as one of the "big three" endurance performance determinants alongside lactate threshold and running economy.

**Strength-relevant:** While not a primary strength metric, VO2max above 40 mL/kg/min supports inter-set recovery during high-volume resistance training. Strength athletes with poor cardiovascular fitness experience greater cardiac drift during training, reducing session quality.

**Typical ranges:** Untrained female: 27–31; trained female: 35–45; elite female endurance: 55–75. Untrained male: 35–40; trained male: 45–55; elite male endurance: 70–85.

---

## 6. Heart Rate Variables (HeartRateSample, HeartRateZoneSummary)

### 6.1 bpm (HeartRateSample)
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Continuous heart rate with source tagging (rest/sleep/workout).

**Science:** Contextual heart rate data enables multiple derived metrics: resting HR trends, training HR zones, HR drift during steady-state work, and post-exercise recovery. The source tag is critical — a heart rate of 85 during sleep means something very different from 85 during a warm-up walk.

### 6.2 Heart Rate Zone Summary (zone1–zone5Minutes)
**Domains:** 🏃 RUN (primary) | 🔥 HYR (primary) | 🏋️ STR (secondary)

Time in each heart rate training zone per workout.

**Science:** Seiler's research on training intensity distribution (Seiler, 2010; Stöggl & Sperlich, 2015) demonstrates that elite endurance athletes use a polarized model: ~75–80% of training in Zone 1–2, ~0–5% in Zone 3, and ~15–20% in Zone 4–5. Hyrox racing demands sustained Zone 3–4 effort with spikes to Zone 5 during stations. Training zone distribution is the primary lever for periodizing endurance development.

| Zone | % Max HR | Training Effect | Relevance |
|---|---|---|---|
| Zone 1 (<60%) | Recovery | Active recovery between strength sessions | 🏋️ STR |
| Zone 2 (60–70%) | Aerobic base | Foundation for all endurance work | 🏃 RUN 🔥 HYR |
| Zone 3 (70–80%) | Tempo/threshold | Hyrox race pace; lactate clearance | 🔥 HYR 🏃 RUN |
| Zone 4 (80–90%) | Threshold/VO2max | Interval training; race-pace capacity | 🏃 RUN 🔥 HYR |
| Zone 5 (90%+) | Anaerobic/peak | Station efforts in Hyrox; sprint finishes | 🔥 HYR |

**Strength-specific:** Zone summary during resistance training sessions reveals cardiovascular demand. High Zone 3–4 time during strength work suggests either inadequate rest periods, poor cardiovascular fitness, or excessive circuit-style training that may compromise strength gains.

---

## 7. Blood Oxygen (DailySpO2)

### 7.1 avgSpO2
**Domains:** 🏃 RUN | 🔥 HYR | 🏋️ STR (illness/recovery detection)

Average overnight blood oxygen saturation.

**Science:** Normal overnight SpO2 is 95–100%. Values consistently below 95% during sleep may indicate sleep-disordered breathing (obstructive sleep apnea), altitude effects, or respiratory illness — all of which impair recovery. Exercise-induced arterial hypoxemia (EIAH) — SpO2 dropping below 92% during intense exercise — occurs in ~50% of elite endurance athletes and limits VO2max by 1–2% per 1% drop in SpO2 below 95% (Dempsey & Wagner, 1999).

**Practical use for Baseline:**
- **Overnight monitoring (Oura):** Detect illness onset (SpO2 dip 1–2 days before symptoms), sleep apnea screening, altitude acclimatization tracking.
- **Running/Hyrox:** Athletes prone to EIAH benefit from awareness — it's a physiological ceiling, not a training deficit. SpO2 drops during maximal effort are normal and not dangerous in healthy athletes, but they do explain why VO2max plateaus despite continued training.
- **Strength:** SpO2 is less directly relevant to maximal strength but serves as an illness early warning that prevents training through infections.

---

## 8. Workout Variables (WorkoutSession, WorkoutSet, Exercise)

### 8.1 sessionRPE & set-level rpe
**Domains:** 🏋️ STR (primary) | 🔥 HYR (station efforts)

Rating of perceived exertion using the RIR scale.

**Science:** RPE/RIR is the most accessible autoregulation tool. Zourdos et al. (2016) validated that the RIR scale correlates with bar velocity and allows practical load adjustment without equipment. Network meta-analysis (2025) ranked APRE > VBT > RPE > percentage-based for strength gains, but RPE has the lowest barrier to entry. For Hyrox, session RPE after training captures the combined stress of running + stations, serving as a hybrid training load metric.

**Key insight:** RPE accuracy improves with training experience and is most reliable within 3 RIR of failure. At RPE 6 (4 RIR), athletes frequently underestimate reserves by 2–3 reps.

### 8.2 sessionVolume & set-level weight × reps
**Domains:** 🏋️ STR (primary) | 🔥 HYR (functional strength)

Total volume load (sets × reps × weight) per session and per exercise.

**Science:** Volume load is the primary driver of hypertrophy (Schoenfeld et al., 2017). The dose-response relationship shows ~0.37% additional muscle mass per additional weekly set. For Hyrox, functional strength stations (sled push/pull, lunges, wall balls) benefit from muscular endurance built through moderate-load, higher-rep training — volume load in the 60–75% 1RM range builds the capacity needed for these stations.

### 8.3 Estimated 1RM (derived from weight × reps via Epley)
**Domains:** 🏋️ STR (primary) | 🔥 HYR (sled push/pull capacity)

Estimated one-rep maximum.

**Science:** The Epley formula (1RM = weight × (1 + reps/30)) provides a non-maximal estimate with mean error of 2.7–3.3 kg for bench press (González-Badillo & Sánchez-Medina, 2010). Tracking e1RM over time is the primary measure of strength progression. For Hyrox, absolute strength in the squat, deadlift, and pressing patterns translates to station performance — particularly sled push (125/152kg) and lunges (24kg).

### 8.4 Exercise metadata (muscleGroup, movementPattern, equipment, isCompound)
**Domains:** 🏋️ STR (primary)

Classification data enabling automated analysis.

**Science:** Muscle group tracking enables weekly volume-per-muscle monitoring against MEV/MAV/MRV landmarks (Israetel et al., 2021). Movement pattern classification (push/pull/hinge/squat/carry) ensures balanced programming and identifies neglected patterns. Compound vs. isolation ratio affects session efficiency — compound movements produce greater systemic fatigue but more stimulus per unit of time.

### 8.5 restSeconds
**Domains:** 🏋️ STR (primary) | 🔥 HYR (muscular endurance)

Rest time between sets.

**Science:** Schoenfeld et al. (2016) found that 3-minute rest periods produced greater strength and hypertrophy gains than 1-minute rest. However, for Hyrox preparation, deliberately training with shorter rest (60–90s) builds the muscular endurance and lactate tolerance needed for station work where there is no rest period. Periodizing rest intervals — longer rest during strength blocks, shorter during Hyrox prep — optimizes for both goals.

---

## 9. Body Composition Variables (UserProfile, WeightLog)

### 9.1 bodyWeightKg & weightKg (daily tracking)
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Body weight and its trend over time.

**Science:** Body weight affects all three domains differently:
- **Strength:** Absolute strength generally increases with body mass. Weight class athletes must optimize strength-to-weight ratio.
- **Running:** Higher body mass increases metabolic cost of running by ~1 kcal/kg/km. For a 65kg runner, gaining 3kg increases the oxygen cost of running at the same pace by ~4.6% (Teunissen et al., 2007).
- **Hyrox:** Complex relationship — heavier athletes push sleds more easily but run slower. The optimal body composition for Hyrox balances functional strength with running economy. Brandt et al. (2025) found that lower body fat percentage significantly correlated with faster Hyrox finish times (p = 0.03), but total muscle mass did not.

### 9.2 bodyFatPct
**Domains:** 🏋️ STR (body comp) | 🏃 RUN (running economy) | 🔥 HYR (performance predictor)

Body fat percentage.

**Science:** Brandt et al. (2025) identified lower body fat as one of three significant predictors of Hyrox performance (alongside VO2max and training volume). For runners, body fat is "dead weight" — it requires oxygen to carry but doesn't contribute to propulsion. For strength athletes, body fat percentage contextualizes weight changes (gaining weight from muscle vs. fat) and affects energy availability calculations.

**Caution:** Body fat should be tracked as a trend, not obsessed over daily. Consumer measurement methods (bioimpedance scales) have ±3–5% absolute error but are reliable for tracking relative changes over time.

### 9.3 muscleMassKg
**Domains:** 🏋️ STR (primary) | 🔥 HYR

Estimated muscle mass.

**Science:** Muscle mass is the functional tissue for force production. For strength athletes, increasing muscle mass is a primary goal (hypertrophy). For Hyrox, Brandt et al. (2025) found that total muscle mass did not significantly correlate with finish time — suggesting that the Hyrox stations require muscular endurance at moderate loads rather than peak force output. However, lower-body muscle mass specifically may be more predictive (this hasn't been studied yet).

### 9.4 heightCm, age, sex, experienceLevel
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (calibration variables)

Demographics and training background.

**Science:** These variables calibrate every other metric:
- **Height + weight → BMI** and lever arm calculations for strength standards
- **Age** affects per-meal protein thresholds (Moore et al., 2015), recovery capacity, and VO2max norms
- **Sex** determines hormonal context, cycle tracking relevance, and baseline norms for HRV, RHR, and body composition
- **Experience level** calibrates volume landmarks (MEV/MAV/MRV ranges shift with training age), RPE accuracy, and expected adaptation rates

---

## 10. Nutrition Variables (NutritionLog, NutritionEntry)

### 10.1 calories (daily total)
**Domains:** 🏋️ STR (energy availability, surplus/deficit) | 🏃 RUN (glycogen) | 🔥 HYR (fuel)

Total daily caloric intake.

**Science:** Caloric intake determines the metabolic context for all training:
- **Strength (surplus):** A caloric surplus of 300–500 kcal/day optimizes muscle protein synthesis while limiting fat gain (Slater et al., 2019).
- **Strength (deficit):** Deficits cause measurable HRV depression (~5–10% at 300–500 kcal deficit), which is a normal physiological response, not overtraining (Altini, 2022). Baseline should distinguish diet-induced HRV dips from training overload.
- **Running/Hyrox:** Glycogen availability is the primary fuel limiter for endurance performance. Chronic caloric deficits deplete glycogen stores, degrading performance in sessions >60 minutes.

### 10.2 protein (daily and per-entry)
**Domains:** 🏋️ STR (primary) | 🏃 RUN | 🔥 HYR

Daily protein intake and per-meal distribution.

**Science:** Morton et al. (2018) meta-analysis: benefits plateau at 1.6 g/kg/day (95% CI extends to 2.2 g/kg). Per-meal minimum of 20–25g for adults <45; 25–30g for 45+ (Moore et al., 2009, 2015). Distribution across 3–5 meals optimizes daily MPS, but total daily intake is the primary variable. For endurance athletes, protein needs during heavy training blocks may reach 1.6–1.8 g/kg to support both muscle repair and immune function (Thomas et al., 2016).

### 10.3 carbs
**Domains:** 🏃 RUN (primary) | 🔥 HYR (primary) | 🏋️ STR (secondary)

Daily carbohydrate intake.

**Science:** Carbohydrates are the primary fuel for high-intensity exercise. Burke et al. (2011) established carbohydrate periodization guidelines:
- **High-intensity/endurance days:** 6–10 g/kg/day
- **Moderate training days:** 5–7 g/kg/day
- **Low/rest days:** 3–5 g/kg/day

For Hyrox racing specifically, pre-race carb loading (8–10 g/kg for 24–48h) maximizes glycogen stores for the ~90-minute race. For strength training, carbs support training intensity but the dose-response is less steep — 3–5 g/kg is generally sufficient.

### 10.4 fat
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (hormonal health)

Daily fat intake.

**Science:** Dietary fat below 20% of total calories is associated with suppressed testosterone and estrogen production (Hämäläinen et al., 1984), impairing both strength adaptation and recovery. For female athletes, very low fat intake can disrupt menstrual function independently of total caloric deficit. Minimum threshold: 0.8–1.0 g/kg/day.

---

## 11. Cycle Phase Variables (CyclePhaseLog)

### 11.1 phase (menstrual | follicular | ovulation | luteal)
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR

Current menstrual cycle phase.

**Science:** Cycle phase is a cross-cutting variable that modulates the interpretation of nearly every other metric in the system. See `body-mode-research.md` §4 for full citations. Summary by domain:

| Phase | Strength | Running | Hyrox |
|---|---|---|---|
| **Menstrual** (days 1–5) | Trivial performance reduction; allow override | RPE may be higher; respect but don't restrict | Normal training with awareness |
| **Follicular** (days 6–13) | Peak performance window; PR attempts | Best window for speed work and tempo | Best window for race-simulation sessions |
| **Ovulation** (days 12–16) | Strong but ACL risk 3–6× higher (Hewett, 2007) | Emphasize warm-up, landing mechanics | Caution with plyometric stations |
| **Luteal** (days 17–28) | RPE +0.5–1.0 at same load; temp +0.3–0.5°C | Heat dissipation impaired; hydrate more | Expect slower runs; adjust expectations |

---

## 12. Environment Variables (EnvReading)

### 12.1 pm25
**Domains:** 🏃 RUN (primary) | 🔥 HYR | 🏋️ STR (indirect)

Particulate matter ≤2.5μm (bedroom air quality).

**Science:** PM2.5 exposure during sleep impairs respiratory function and reduces sleep quality. Chaudhuri et al. (2022) found that indoor air quality significantly affects HRV during sleep — high PM2.5 suppresses parasympathetic activity, reducing recovery independent of training load. For runners, chronic PM2.5 exposure reduces lung function and impairs oxygen delivery. Outdoor training in high-pollution conditions (PM2.5 > 35 μg/m³) produces more harm than benefit for endurance performance.

### 12.2 temperature & humidity
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (sleep quality)

Bedroom temperature and humidity.

**Science:** Optimal sleep temperature is 18–20°C (Okamoto-Mizuno & Mizuno, 2012). Temperatures above 24°C suppress slow-wave sleep (deep sleep) by 20–30%, directly reducing growth hormone secretion and recovery. Humidity outside the 30–50% range impairs sleep quality through either airway drying (low humidity) or thermal discomfort (high humidity). These environmental variables provide context for sleep quality — if deep sleep drops while bedroom temperature is elevated, the cause may be environmental rather than physiological.

### 12.3 noiseDb
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (sleep quality)

Ambient noise level during sleep.

**Science:** Noise >40 dB during sleep causes cortical arousals that fragment sleep architecture without fully waking the sleeper — people are often unaware of the disruption. Halperin (2014) found that traffic noise exposure during sleep reduced next-day cognitive performance by 5–10% and increased cortisol. For athletes, noise-disrupted sleep reduces deep sleep duration even when total sleep time appears adequate.

### 12.4 lux
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (circadian alignment)

Light level in the sleep environment.

**Science:** Even dim light (>5 lux) during sleep suppresses melatonin production, impairing sleep onset, reducing deep sleep, and disrupting circadian rhythm (Gooley et al., 2011). For athletes, circadian disruption cascades into impaired performance through reduced growth hormone secretion, elevated cortisol, and fragmented sleep architecture. Monitoring bedroom lux confirms that the sleep environment supports recovery.

### 12.5 pressure
**Domains:** 🏃 RUN | 🔥 HYR (marginal)

Barometric pressure.

**Science:** Barometric pressure changes affect oxygen partial pressure — lower pressure = less available oxygen. While the effect at sea level is marginal, athletes training at altitude or in weather systems with rapidly dropping pressure may notice subtle performance changes. Some research links falling barometric pressure to increased joint pain perception in athletes with previous injuries (McAlindon et al., 2007), though the evidence is mixed.

---

## 13. Apple Watch / HealthKit Workout Variables

### 13.1 HealthKitWorkout (durationSeconds, activeCalories, distance, avgHeartRate, maxHeartRate, minHeartRate)
**Domains:** 🏃 RUN | 🔥 HYR | 🏋️ STR

Workout-level metrics from Apple Watch.

**Science:** These metrics provide the per-session training load data needed for longitudinal load management. Key derived metrics:
- **TRIMP** (Training Impulse): duration × average HR intensity — a validated single-number training load metric (Banister, 1991)
- **HR drift:** avgHR relative to pace/power across a steady-state session reveals cardiac drift, which indicates dehydration, heat stress, or insufficient aerobic fitness
- **Max HR:** Calibrates zone calculations. True maxHR should be established through a field test, not the 220-age formula (which has a standard error of ±10–12 BPM)

### 13.2 OuraWorkout (activity, calories, distance, intensity, durationSeconds)
**Domains:** 🏃 RUN | 🔥 HYR | 🏋️ STR

Oura-detected workouts.

**Science:** Cross-referencing Oura and Apple Watch workout data provides validation — agreement between sources increases confidence in the data. The activity type tag enables training load breakdown by modality (running vs. strength vs. cycling), which is critical for Hyrox athletes who need to balance concurrent training without interference effects (Hickson, 1980 — the interference effect of concurrent training).

### 13.3 OuraSession (type: breathing/meditation/nap, avgHrv, avgHeartRate)
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (recovery interventions)

Structured recovery sessions tracked by Oura.

**Science:** Breathing exercises and meditation directly improve parasympathetic activity. A meta-analysis by Zou et al. (2018) found that mind-body interventions (yoga, meditation, breathing) increased HRV by a standardized mean difference of 0.39 — a meaningful improvement in recovery capacity. Naps of 20–30 minutes improve subsequent exercise performance by 2–3% and reduce perceived exertion (Waterhouse et al., 2007). Tracking these sessions enables correlation with same-day and next-day biometric outcomes through the Mind Mode experiment engine.

---

## 14. Oura Expansion Variables

### 14.1 SleepTimeRecommendation (optimalBedtimeStart/End)
**Domains:** 🏋️ STR | 🏃 RUN | 🔥 HYR (sleep optimization)

Oura's recommended sleep window.

**Science:** Consistent sleep timing (same bedtime ±30 minutes) is as important as sleep duration for circadian health. Phillipis et al. (2017) found that irregular sleep timing predicted worse academic performance, mood, and health markers even when total sleep duration was adequate. For athletes, circadian misalignment (varying bedtime by >2 hours) suppresses growth hormone pulses and impairs glycogen replenishment.

---

## 15. Cross-Domain Performance Summary Matrix

This matrix maps each variable category to its primary, secondary, and tertiary relevance across domains.

| Variable Category | Strength 🏋️ | Running 🏃 | Hyrox 🔥 |
|---|---|---|---|
| **Sleep duration & quality** | ●●● Recovery, MPS, GH | ●●● Recovery, glycogen | ●●● Recovery |
| **HRV** | ●●○ Lower sensitivity | ●●● Gold standard | ●●● Hybrid load |
| **Resting HR** | ●●○ Overreaching flag | ●●● Fitness trend | ●●● Fitness trend |
| **Temperature deviation** | ●●● Illness + cycle | ●●○ Illness | ●●○ Illness |
| **Running biomechanics** | ○○○ Not relevant | ●●● Economy, form | ●●● Economy, fatigue |
| **VO2max** | ●○○ Inter-set recovery | ●●● Primary predictor | ●●● Primary predictor |
| **HR zones** | ●○○ Session monitoring | ●●● Training distribution | ●●● Race pacing |
| **SpO2** | ●○○ Illness detection | ●●○ EIAH awareness | ●●○ EIAH awareness |
| **Body composition** | ●●● Hypertrophy tracking | ●●● Running economy | ●●● Significant predictor |
| **Nutrition — protein** | ●●● Primary fuel for MPS | ●●○ Repair + immune | ●●○ Repair + immune |
| **Nutrition — carbs** | ●●○ Training intensity | ●●● Primary fuel source | ●●● Primary fuel source |
| **Workout volume** | ●●● Primary growth driver | ○○○ N/A | ●●○ Functional strength |
| **RPE/RIR** | ●●● Autoregulation | ●○○ Session monitoring | ●●○ Station efforts |
| **Cycle phase** | ●●● Performance + injury | ●●○ RPE + thermoregulation | ●●○ RPE + thermoregulation |
| **Stress/resilience** | ●●○ Recovery context | ●●○ Recovery context | ●●● Race-day tolerance |
| **Environment** | ●●○ Sleep quality | ●●○ Sleep + air quality | ●●○ Sleep + air quality |
| **Cardio recovery (HRR)** | ●○○ Indirect | ●●● Fitness marker | ●●● Between-station recovery |

**Legend:** ●●● = primary relevance | ●●○ = secondary relevance | ●○○ = tertiary relevance | ○○○ = minimal relevance

---

## 16. Recommended New Variables / Derived Metrics

Based on this analysis, several derived metrics would add significant value to Baseline:

1. **Acute:Chronic Workload Ratio (ACWR)** — 7-day rolling load ÷ 28-day rolling load. Values between 0.8–1.3 are the "sweet spot"; >1.5 indicates injury risk (Gabbett, 2016). Derivable from existing MET minutes, session volume, and running distance data. Relevant to all three domains.

2. **Energy Availability (EA)** — (calories consumed − exercise calories) ÷ fat-free mass. Already discussed in the PRD as a planned feature. Critical threshold: 30 kcal/kg FFM.

3. **Training Monotony & Strain** — Monotony = mean daily load ÷ SD of daily load. Strain = weekly load × monotony. High monotony (>2.0) with high strain predicts illness and overtraining (Foster, 1998). Derivable from existing session data.

4. **Running Economy Index** — Speed ÷ heart rate at steady state. A simple proxy for running economy that can be tracked over time without lab testing. Improvements indicate better aerobic efficiency.

5. **Sleep Debt Accumulator** — Rolling sum of (target sleep − actual sleep) over 7 days. When debt exceeds 5 hours, recommend deload regardless of other readiness metrics.

6. **GCT Fatigue Index** — GCT in final 1km of a run ÷ GCT in first 1km. Ratio >1.15 indicates significant fatigue-related form breakdown. Useful for Hyrox race analysis.

---

## References

### Hyrox-Specific
- Brandt, M., et al. (2025). "Acute physiological responses and performance determinants in Hyrox©." *Frontiers in Physiology*, 16, 1519240.
- High Intensity Functional Training in Hybrid Competitions. (2025). *MDPI Proceedings*, 10(4), 365.

### Sleep & Recovery
- Brandenberger, G., & Weibel, L. (2004). *Sleep*, 27(4), 764–768.
- Dattilo, M., et al. (2011). *Medical Hypotheses*, 77(2), 220–222.
- Lamon, S., et al. (2021). *Physiological Reports*, 9(1), e14660.
- Mah, C.D., et al. (2011). *Sleep*, 34(7), 943–950.
- Ohayon, M.M., et al. (2017). *Sleep Medicine Reviews*, 33, 36–46.
- Sassin, J.F., et al. (1969). *Science*, 165(3892), 513–515.
- Van Dongen, H.P., et al. (2003). *Sleep*, 26(2), 117–126.

### HRV & Training Monitoring
- Flatt, A.A., & Esco, M.R. (2016). *JSCR*, 30(2), 378–385.
- Foster, C., et al. (2001). *JSCR*, 15(1), 109–115.
- Kiviniemi, A.M., et al. (2007). *Eur J Appl Physiol*, 101(6), 743–751.
- Plews, D.J., et al. (2013). *Sports Medicine*, 43(9), 773–781.
- Thorpe, R.T., et al. (2017). *Int J Sports Physiol Perform*, 12(S2), 115–119.

### Running Biomechanics & Economy
- Cavanagh, P.R., & Williams, K.R. (1982). *Med Sci Sports Exerc*, 14(1), 30–35.
- Heiderscheit, B.C., et al. (2011). *Med Sci Sports Exerc*, 43(2), 296–302.
- Moore, I.S. (2016). *Sports Medicine*, 46(6), 793–807.
- Santos-Concejero, J., et al. (2014). *PLOS ONE*, 9(3), e93903.

### Endurance Physiology
- Burke, L.M., et al. (2011). *J Sports Sci*, 29(S1), S17–S27.
- Dempsey, J.A., & Wagner, P.D. (1999). *J Appl Physiol*, 87(4), 1997–2006.
- Gabbett, T.J. (2016). *Br J Sports Med*, 50(5), 273–280.
- Joyner, M.J., & Coyle, E.F. (2008). *J Physiol*, 586(1), 35–44.
- Seiler, S. (2010). *Scand J Med Sci Sports*, 20(S2), 1–10.

### Strength & Hypertrophy
- González-Badillo, J.J., & Sánchez-Medina, L. (2010). *Int J Sports Med*, 31(5), 347–352.
- Israetel, M., Hoffmann, J., & Smith, C.W. (2021). *Scientific Principles of Hypertrophy Training*. RP.
- Morton, R.W., et al. (2018). *Br J Sports Med*, 52(7), 494–505.
- Schoenfeld, B.J., et al. (2016). *JSCR*, 30(7), 1805–1812.
- Schoenfeld, B.J., et al. (2017). *J Sports Sci*, 35(11), 1073–1082.
- Zourdos, M.C., et al. (2016). *JSCR*, 30(2), 267–275.

### Nutrition
- Hämäläinen, E.K., et al. (1984). *J Steroid Biochem*, 20(1), 459–464.
- Loucks, A.B., et al. (2011). *J Sports Sci*, 29(S1), S7–S15.
- Moore, D.R., et al. (2009). *J Appl Physiol*, 107(4), 1359–1369.
- Moore, D.R., et al. (2015). *J Appl Physiol*, 118(5), 633–641.
- Thomas, D.T., et al. (2016). *Med Sci Sports Exerc*, 48(3), 543–568.

### Cycle Phase
- Hewett, T.E., et al. (2007). *AJSM*, 35(4), 659–668.
- McNulty, K.L., et al. (2020). *Sports Medicine*, 50(10), 1813–1827.
- Sung, E., et al. (2014). *SpringerPlus*, 3, 668.

### Environment
- Chaudhuri, S., et al. (2022). *Environmental Research*, 212, 113472.
- Gooley, J.J., et al. (2011). *J Clin Endocrinol Metab*, 96(3), E463–E472.
- Okamoto-Mizuno, K., & Mizuno, K. (2012). *J Physiol Anthropol*, 31(1), 14.

### Stress & Recovery
- Cadegiani, F.A., & Kater, C.E. (2019). *BMJ Open Sport & Exercise Medicine*, 5(1), e000542.
- Kellmann, M. (2010). *Scand J Med Sci Sports*, 20(S2), 95–102.
- Zou, L., et al. (2018). *Complementary Therapies in Clinical Practice*, 31, 221–230.

### Other
- Daanen, H.A., et al. (2012). *Int J Sports Physiol Perform*, 7(3), 251–260.
- Natarajan, A., et al. (2020). *BMJ Open Sport & Exercise Medicine*, 6(1), e000898.
- Waterhouse, J., et al. (2007). *J Sports Sci*, 25(14), 1557–1566.
