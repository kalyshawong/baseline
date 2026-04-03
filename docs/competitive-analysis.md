# Baseline — Competitive Analysis

**Last Updated:** 2026-04-02

---

## Competitive Landscape

Baseline sits at the intersection of biometric tracking, strength training, cycle-aware fitness, and personal experimentation. No single competitor covers all of these. The opportunity is in the integration.

---

## Direct Competitors

### Oura App

- **What it does well:** Sleep tracking, readiness scores, temperature trends, body clock insights. Clean UI.
- **What it lacks:** No training programming. No workout logging. No cycle-phase training adjustments. No self-experimentation framework. Data stays in Oura's ecosystem.
- **Baseline advantage:** Uses Oura as a data source but adds the training intelligence and experimentation layer Oura doesn't provide.

### Whoop

- **What it does well:** Strain tracking, recovery scores, HRV trends, sleep coaching. Strong community.
- **What it lacks:** Proprietary hardware lock-in. $30/month subscription. No strength training specifics (tracks strain but not sets/reps/weight). No cycle-phase integration. No data export or API for personal projects.
- **Baseline advantage:** Open, data-owning approach. Actual progressive overload tracking. Cycle awareness. No subscription.

### Strong / Hevy (Workout Trackers)

- **What they do well:** Clean workout logging. Progressive overload tracking. Exercise libraries. Social features (Hevy).
- **What they lack:** Zero biometric integration. No readiness-based adjustment. No cycle awareness. No self-experimentation. They track what you did but don't help you decide what to do.
- **Baseline advantage:** Training logging + biometric context + cycle phase = intelligent recommendations, not just a logbook.

### Clue / Flo (Cycle Trackers)

- **What they do well:** Cycle prediction, symptom logging, educational content. Clue has strong research backing.
- **What they lack:** No training integration. No biometric data beyond what you manually log. No performance optimization angle.
- **Baseline advantage:** Treats cycle phase as a performance variable, not just a health tracker. Connects phase data to actual training outcomes.

### Exist.io

- **What it does well:** Correlates data from multiple sources (Oura, Fitbit, RescueTime, etc.). Shows trends and correlations automatically.
- **What it lacks:** Passive — no structured experimentation. No training programming. Correlations are observational, not experimental. No cycle tracking.
- **Baseline advantage:** Structured A/B testing (Mind Mode) produces causal insights, not just correlations. Active training recommendations, not passive dashboards.

### Gyroscope

- **What it does well:** Beautiful health dashboards. Aggregates many data sources. Coach feature.
- **What it lacks:** Expensive ($30/month for full features). No strength training specifics. No self-experimentation. No cycle-phase training logic. Dashboard-heavy, action-light.
- **Baseline advantage:** Action-oriented (tells you what to do today), not just visualization. Free/self-hosted. Experimentation built in.

---

## Feature Comparison Matrix

| Feature | Baseline | Oura | Whoop | Strong/Hevy | Clue | Exist.io |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Sleep/readiness tracking | via Oura | Native | Native | — | — | via integrations |
| HRV monitoring | via Oura | Native | Native | — | — | via integrations |
| Workout logging (sets/reps/weight) | Native | — | — | Native | — | — |
| Progressive overload tracking | Native | — | — | Native | — | — |
| Readiness-based training adjustment | Native | — | Partial | — | — | — |
| Cycle phase tracking | Native | — | — | — | Native | — |
| Cycle-aware training recommendations | Native | — | — | — | — | — |
| Structured self-experimentation | Native | — | — | — | — | — |
| Data correlation/insights | Native | Basic | Basic | — | — | Native |
| Data ownership (self-hosted) | Yes | No | No | Partial | No | No |
| Open API / extensible | Yes | Yes (source) | No | No | No | Yes |
| Cost | Free | Included w/ ring | $30/mo | Free/Premium | Free/Premium | $6/mo |
| Environment sensing | Phase 3 | — | — | — | — | — |
| Bar velocity tracking | Phase 2 | — | — | — | — | — |

---

## Positioning

Baseline's moat is **integration depth + personal agency**:

1. **No other tool combines biometrics + strength training + cycle awareness + experimentation.** Competitors own one or two of these; Baseline connects all four.

2. **Data ownership.** Self-hosted, open-source (eventually), no subscription. Your body's data stays on your hardware.

3. **Active, not passive.** Baseline tells you what to do today, not just what happened yesterday. Recommendations adapt to your readiness, cycle, and experimental findings.

4. **Built for women who train.** Cycle-phase training adjustment is a first-class feature, not an afterthought or a pink-washed add-on.

5. **Scientific self-experimentation.** Mind Mode enables structured n=1 experiments — a capability that doesn't exist in any consumer fitness app.

---

## Risks and Gaps

- **Oura API dependency:** If Oura changes or restricts their API, the data pipeline breaks. Mitigation: abstract the data source layer, prioritize HealthKit as a secondary source.
- **Single-user focus:** Limits network effects and community features that drive retention in competitors. Mitigation: this is intentional for Phase 1 — dogfooding first, scale later.
- **No mobile app (Phase 1):** Logging workouts on a phone is essential for gym use. A web app on mobile is workable but not ideal. Mitigation: responsive design, quick-entry optimized for mobile browser. Native app in Phase 2/3.
- **Statistical rigor in Mind Mode:** Small sample sizes in n=1 experiments limit statistical power. Mitigation: set minimum duration requirements, use appropriate statistical methods (Bayesian over frequentist for small n), and clearly communicate confidence levels.
