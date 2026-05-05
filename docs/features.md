# Baseline — Feature Log by Page

**Last Updated:** 2026-04-23
**Purpose:** A living index of what each page in Baseline does from the user's perspective, with the scientific research that backs each feature where applicable. For deep citations and implementation notes, see `research/body-mode-research.md`, `research/variable-research.md`, and `docs/cycle-phase-logic.md`.

---

## `/` — Dashboard (Home)

The daily overview page. Opens with an Oura sync button (or "Connect Oura" if not yet linked) and a date navigator so you can scroll backwards through past days.

**Baseline Score card.** A single composite readiness number for the day, pulling HRV trend, sleep, readiness, and cycle context into one signal.
*Science:* Composite readiness scores that integrate HRV, RHR, sleep, and temperature predict training tolerance better than any single variable (Thorpe et al., 2017). The HRV component uses Ln RMSSD — the Plews et al. (2013) gold standard for monitoring training adaptation.

**Six metric cards: Readiness, Sleep, HRV, Stress, SpO2, Resilience.** At-a-glance values from Oura's daily endpoints.
*Science:* Nightly HRV (Ln RMSSD) is the most researched single recovery metric in sports science (Plews 2013). SpO2 < 95% during sleep flags possible illness or sleep-disordered breathing (Dempsey & Wagner 1999). Resilience captures the body's capacity to handle stress and recover — its sleep-recovery vs. daytime-recovery split is useful because the two components independently affect training readiness (Kellmann 2010).

**Activity + Calorie Balance + HealthKit status.** Active vs. total calories and steps from Oura, with a calorie-in vs. calorie-out card that reconciles against your goal (cut/bulk/maintain), plus a panel showing the last HealthKit sync and any Apple Watch workout detected today.
*Science:* Seiler's polarized training model (Seiler 2010) uses high/medium/low activity time distribution as a lever for periodizing endurance. NEAT (non-exercise activity thermogenesis) materially affects energy expenditure calculations on low-training days.

**Bedtime recommendation.** Oura's optimal bedtime window (e.g. "10:45 PM – 11:15 PM").
*Science:* Consistent sleep timing (±30 min) is as important as duration for circadian health; irregular timing predicts worse performance even when total sleep is adequate (Phillips et al., 2017).

**Today's sessions.** Any Oura-tracked breathing, meditation, or nap sessions with duration, avg HR, and HRV.
*Science:* Mind-body interventions increase HRV by SMD = 0.39 (Zou et al., 2018). Naps of 20–30 min improve subsequent exercise performance by 2–3% (Waterhouse et al., 2007).

**7-day trend chart.** Baseline-score line across the last week.
*Science:* Plews et al. (2013) established the 7-day rolling average as the standard for detecting meaningful HRV/readiness trends through daily noise.

**Cycle phase selector.** Shows the current phase (menstrual/follicular/ovulation/luteal) and lets you log manually.
*Science:* Cycle phase modulates interpretation of nearly every metric. See `docs/cycle-phase-logic.md`. Primary references: McNulty et al. (2020); Hewett et al. (2007).

**Macro summary.** Today's calories, protein, carbs, fat with entry count.
*Science:* Morton et al. (2018) — protein benefits plateau at 1.6 g/kg/day. Burke et al. (2011) — carb periodization: 6–10 g/kg on high-intensity days, 3–5 g/kg on rest days.

**Weight + Weight Input + TDEE card.** Latest weight/bodyfat (with lb/kg toggle), a one-tap weight logger, and a TDEE card that shows estimated maintenance, goal calories, today's actual calories, protein target, and Energy Availability (EA).
*Science:* EA below 30 kcal/kg FFM triggers hormonal disruption — suppressed T3, elevated cortisol, reduced IGF-1 and testosterone (Loucks et al., 2011). Female athletes are disproportionately affected; menstrual dysfunction is an early deficit signal.

**Sleep breakdown.** Deep, REM, Light durations + lowest overnight HR.
*Science:* ~70% of daily growth hormone secretion occurs during deep sleep (Sassin 1969; Brandenberger & Weibel 2004). REM consolidates motor learning (Dattilo 2011) — critical when acquiring new lifts or running form changes. Target: 1.5–2h deep, 1.5–2h REM.

---

## `/body` — Body Mode

The training-focused dashboard. Five sections: a Hyrox summary card, Composition & Energy, Training Readiness, Running & Cardio, Strength Training, and Recovery.

**Hyrox summary card (if goal exists).** Race countdown, current block, today's prescribed session; deep-links to `/body/hyrox`.

**Composition & Energy.**
- *Weight card + input + 7-day moving average trend chart* — compare against target weight. Moving average smooths daily noise (Schoenfeld on volume dose-response generalizes: trends beat single points).
- *Weight Goal Settings* — sex/age/height/activity level/goal → drives TDEE math.
- *TDEE card with Energy Availability* — same as dashboard but tuned with today's exercise estimate. Flags EA < 30 kcal/kg FFM (Loucks 2011).

**Training Readiness.**
- *Readiness tier card* — traffic-light tier (green/yellow/red) with HRV CV displayed.
  *Science:* HRV-guided training improves VO2max with ~25% less high-intensity work (Kiviniemi et al., 2007). Elevated HRV CV is an early marker of non-functional overreaching even when absolute values haven't dropped (Flatt & Esco 2016; CV > 10% flagged).
- *Cycle phase guidance card* — phase-specific training advice.
  *Science:* McNulty et al. (2020); Hewett et al. (2007) (ACL risk 3–6× higher at ovulation); Sung et al. (2014) (luteal RPE +0.5–1.0 at same load).
- *Fatigue signal composite (0–8 score)* — combines weeks-since-deload, HRV below baseline, HRV CV elevated, sleep score decline, resting HR elevation, RPE creep, and volume approaching MRV. Score ≥3 recommends deload.
  *Science:* Pritchard et al. (2024) — deload every 5–6 weeks (40–60% volume cut, maintain intensity/frequency). Cadegiani & Kater (2019) — subjective fatigue markers are more sensitive early indicators than single biomarkers; a composite across multiple signals is the evidence-backed approach.

**Running & Cardio.**
- *Running metrics card* — pace, power, ground contact time, vertical oscillation, stride length, cardio recovery, distance, respiratory rate, physical effort.
  *Science:* GCT is one of the strongest biomechanical predictors of running economy (Santos-Concejero et al., 2014; Moore 2016). Excess vertical oscillation wastes energy (Moore 2016). HRR at 60s post-exercise is a validated fitness marker (Daanen et al., 2012).
- *VO2 Max* — trend with last-updated date.
  *Science:* VO2max is the single strongest endurance predictor. For Hyrox specifically, Brandt et al. (2025) found VO2max significantly correlated with faster finish times (p = 0.01).

**Strength Training.**
- *Volume Zones* — per-muscle-group weekly sets vs. MEV/MAV/MRV gauge.
  *Science:* Schoenfeld, Ogborn & Krieger (2017) — dose-response: ~0.37% muscle mass per extra weekly set, non-linear. Israetel, Hoffmann & Smith (2021) — MV ~6, MEV ~8–12, MAV ~12–20, MRV ~20–30+ sets/muscle/week.
- *Recent PRs* — top 5 PRs with estimated 1RM via Epley formula.
  *Science:* Epley estimate mean error 2.7–3.3 kg for bench press (González-Badillo & Sánchez-Medina 2010) — reliable without risky 1RM attempts.
- *Recent workouts list* — last 5 sessions with volume and active/done status, links to `/body/workout/[id]`.

**Recovery.**
- *Sleep breakdown + Bedtime recommendation* — as on the dashboard.
- *Nutrition check* — daily protein progress, per-meal protein (flags meals under threshold), daily calorie target, EA.
  *Science:* Morton (2018) — 1.6 g/kg/day. Moore (2009, 2015) — per-meal 20–25g for <45, 25–30g for 45+. Aragon & Schoenfeld (2018) — distribute across 3–5 meals, but total matters more.
- *Multi-week trend charts* — HRV, RHR, sleep score, readiness over time.

---

## `/body/hyrox` — Hyrox Race Plan

Only active when you have a race goal with `subtype=hyrox`. Otherwise shows a prompt to set one at `/goals`.

**Header card.** Race title, target time, current training block (accumulation/intensification/realization/taper) and week-in-block, a countdown ring to race day, volume/intensity multipliers for the current block.
*Science:* Classical block periodization (Issurin). Hyrox-specific block shape reflects Brandt et al. (2025) on race physiology.

**Today's session.** Recommended session type (easy run / tempo / intervals / long run / strength / compromised / station work / recovery / race simulation) with duration, prescription, rationale, and any warnings. The recommendation adapts to your readiness score, HRV CV, sleep hours, cycle phase, and days since last hard session.
*Science:* Polarized training distribution — ~80% low, ~20% high (Seiler 2010). Avoiding two hard sessions too close (Kiviniemi et al., 2007 — HRV-guided scheduling). Cycle-phase adjustments from McNulty (2020) and Hewett (2007). Hyrox-specific physiology from Brandt et al. (2025) — running is ~60% of total race time, so easy-run and threshold work dominate base blocks.

**Start session button** — currently disabled (Phase 2 feature per `docs/hyrox-module-spec.md`).

---

## `/body/workout/new` — Start a New Workout

Template picker. Lists your custom templates, the built-in templates (PPL, Upper/Lower, Full Body, etc.), plus a Freestyle option.

**Custom template editor (inline).** Search the exercise library, pick exercises, set target sets × reps, save as a reusable template.
*Science:* Volume landmarks (Israetel 2021) shape the template's default sets. Schoenfeld et al. (2016) — training each muscle 2× per week is the sweet spot for hypertrophy when volume is equated.

**Start Workout** — creates a WorkoutSession row and redirects to `/body/workout/[id]`.

---

## `/body/workout/[id]` — Active Workout Logger

Live workout logging page. Shows template name (or "Freestyle"), the readiness score captured at session start, and current cycle phase.

**Workout logger.**
- Per-set input: weight, reps, RPE (0–10, RIR-calibrated), warmup toggle.
*Science:* Zourdos et al. (2016) — RIR-based RPE correlates with bar velocity; most accurate within 3 RIR of failure. Hypertrophy target: RPE 6–8 (2–4 RIR). Strength: RPE 8–9 (1–2 RIR). Deload: RPE 5–6.
- Previous-session prefill — shows last time's weight/reps/RPE for the same exercise so you can progressively overload.
*Science:* Progressive overload is the primary driver of hypertrophy and strength adaptation (Schoenfeld 2017).
- Auto PR detection — flags sets that beat prior e1RM records.
- Goal tagging at session end — tag the workout to an active goal for roll-up analytics.

---

## `/mind` — Mind Mode

The self-experimentation, quick-logging, and behavioral-data page. Date navigator at top.

**Today Context card.** Readiness, sleep score + duration, HRV, stress summary, cycle phase — so you can correlate today's behavior to biometric state without flipping pages.

**Quick Tag.** One-tap tagging for behavioral or environmental events (alcohol, caffeine, meditation, screen time, travel, etc.) with optional metadata and linking to an active experiment.
*Science:* n=1 structured self-experimentation benefits from dense, timestamped event logs — correlating behavior to next-day HRV/sleep requires sufficient sample density (Plews 2013 on needing ≥3 HRV points/week for trend analysis generalizes to experimental logging).

**Nutrition input + macro summary + nutrition log.** Natural-language food entry (e.g. "2 eggs and toast at 8am"), parsed via USDA data into calories/protein/carbs/fat with meal-type classification and timestamp (with an unknown-time flag when you forget).
*Science:* Daily total protein and its distribution drive MPS (Morton 2018; Moore 2009, 2015). Logging meal timing enables per-meal protein threshold checks.

**Active Experiments.** Cards for each active experiment showing title, hypothesis, days logged, progress toward minimum duration (min-days × 2 for both conditions).
*Science:* Small-n experiments require minimum duration for statistical power. Bayesian inference is preferred over frequentist at low n (see Mind Mode framing in `docs/competitive-analysis.md`).

**All Experiments list.** Draft, completed, analyzed experiments with status badges.

**Insights feed.** Auto-generated correlations from `lib/insights.ts` — e.g. "days with alcohol logged: HRV 12ms lower on average."
*Science:* Correlation is observational, not causal — Mind Mode structured experiments are the causal counterpart. Insights serve as hypothesis generators.

**Environment card.** Latest PM2.5, temperature, humidity, noise levels from any connected env sensor.
*Science:* PM2.5 during sleep suppresses parasympathetic activity independent of training load (Chaudhuri 2022 — citation unverified). Bedroom temps > 24°C suppress slow-wave sleep 20–30% (Okamoto-Mizuno & Mizuno 2012). Noise > 40 dB fragments sleep via cortical arousals (Halperin 2014).

**Tag Timeline.** Chronological list of today's tags with timestamps and experiment links.

---

## `/mind/experiments/new` — Create an Experiment

Two modes: **Template picker** (pre-built experiments with IV/DV/lag pre-filled) and **Custom form** (full manual spec).

**Template cards.** Each shows title, hypothesis, independent variable (IV), dependent variable (DV), and lag days if non-zero.

**Custom experiment form.**
- Title, hypothesis
- Independent variable (what you change — behavior you tag)
- Dependent variable (what you measure)
- Metric field (deepSleepDuration, averageHrv, readiness score, temperatureDeviation, stressHigh, etc.)
- Source table (DailySleep / DailyReadiness / DailyStress)
- Lag days (0 = same day; 1 = next-day effect, etc.)
- Min days per condition (default 14)

*Science:* Lag days matter — e.g. alcohol-on-HRV is same-night or next-day; training-volume-on-HRV is 1–3 days lagged (Plews 2013). The min-days default of 14 gives each condition ~2 weeks, which yields enough samples to detect moderate effect sizes. All structured experimentation here maps to the methodology discussed in Baseline's Mind Mode positioning (see `docs/competitive-analysis.md`).

---

## `/mind/experiments/[id]` — Experiment Detail

Single-experiment view showing the full timeline and analysis.

**Experiment summary.** Title, hypothesis, IV, DV, status badge, treatment vs. control day counts, progress toward min-days goal.

**Daily logs.** Each entry captures the day, the independent-variable value (treatment or control), and the fetched dependent metric from the source table.

**Associated tags.** The 20 most recent activity tags associated with this experiment.

**Analysis (when enough data).** Comparison of mean DV across treatment vs. control days; indicates direction, magnitude, and confidence.
*Science:* Bayesian inference over frequentist at small n (appropriate given typical experiment length). Effect sizes should be reported with explicit confidence ranges to avoid over-interpreting noise — a principle that shapes how results are surfaced.

---

## `/coach` — Baseline Coach

Chat interface grounded in your real data. Listed as "Science-backed advice grounded in your real data."

**Chat.** Multi-turn conversation with an LLM that has access to your readiness, HRV, sleep, cycle phase, recent workouts, nutrition, and active goals.

**Session history.** Last 30 chat sessions with timestamps, persisted across visits.

**Active goals shown in context.** The coach knows your primary and secondary goals so advice reflects what you're actually training for (see `docs/goal-coach-redesign-spec.md`).
*Science:* The coaching context is constructed from the full variable set because every variable has cross-domain relevance — sleep affects strength AND endurance AND cognition. The primary-goal "lens" determines emphasis, not data access (Lamon 2021 on sleep × strength; Van Dongen 2003 on sleep × cognitive performance; etc.). Full rationale in `docs/goal-coach-redesign-spec.md` §2.

---

## `/goals` — Goals Manager

List of races, exams, body composition targets, and custom goals. Used to shape coach context and unlock modes like Hyrox.

**Goal list.** Ordered by status (active first), then deadline. Each goal has title, type, subtype, target, deadline, status, priority, primary flag, and notes.

**Goal types.** `race` | `strength` | `physique` | `cognitive` | `weight` | `health` | `custom`.

**Subtypes.** `hyrox` | `marathon` | `half_marathon` | `5k` | `powerlifting_meet` | `bodybuilding` | `cfa` | `finals` | `cut` | `bulk` | `recomp` | `sleep_optimization` | `hrv_baseline` | `custom`.

**Primary goal.** Exactly one goal can be marked primary; it becomes the coach's main optimization target. Secondary awareness is preserved for other active goals (no hard filtering of data).
*Science:* Goal-specific relevance weights are justified by the cross-domain research matrix in `research/variable-research.md` §15. All data remains available to the coach because sleep/HRV/nutrition all affect every goal; only the emphasis shifts.

**Primary driver of downstream features.**
- `subtype=hyrox` → creates a HyroxPlan, unlocks `/body/hyrox`.
- Goals feed into workout tagging on `/body/workout/[id]`.
- Goals feed coach system prompt and tradeoff reasoning.

---

## Cross-cutting Notes

- **Data source.** Oura V2 API (readiness, sleep, activity, stress, resilience, SpO2, HR, VO2max, sleep-time recommendations) plus Apple HealthKit (workouts, running metrics) plus manual logs (weight, nutrition, cycle phase, workouts, tags).
- **Data ownership.** All records live in a local SQLite/Prisma DB — no third-party cloud beyond the Oura/Apple sync.
- **Cycle-phase overlay.** Used as a *modifier* to readiness, never an override (see `docs/cycle-phase-logic.md` — "Readiness is the gate; cycle phase is the modifier"). Temperature deviation scoring is cycle-aware: luteal-phase elevation (+0.3–0.5°C) is discounted rather than flagged as illness (Sung et al., 2014; Smarr et al., 2020).

---

## References

All citations above trace to:
- `research/body-mode-research.md` — recovery, progressive overload, nutrition, cycle-phase (full citation list §References)
- `research/variable-research.md` — per-variable evidence mapped to strength/running/Hyrox domains (full citation list §References)
- `docs/cycle-phase-logic.md` — phase-by-phase training adjustments and references
- `docs/oura-api-research.md` — data source reference
- `docs/competitive-analysis.md` — positioning rationale
- `docs/goal-coach-redesign-spec.md` — coach relevance-lens framework
- `docs/hyrox-module-spec.md` — Hyrox block structure and session recommender
