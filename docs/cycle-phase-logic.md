# Cycle Phase Logic — Training Adjustments

**Last Updated:** 2026-04-02

This document defines how Baseline uses menstrual cycle phase data to adjust training recommendations across Body Mode and provide context in Mind Mode.

---

## The Four Phases

### 1. Menstrual Phase (Days 1–5)

**What's happening:** Hormone levels (estrogen and progesterone) are at their lowest. The uterine lining sheds. Energy may feel low, especially days 1–2, but many athletes feel progressively better through this phase.

**Biometric signatures:**

- **HRV:** Often returns toward baseline or rises (parasympathetic recovery as progesterone drops)
- **Body temp:** Drops back to baseline (shift from elevated luteal temps)
- **RHR:** Tends to decrease

**Training adjustments:**

- **Days 1–2:** Reduce volume by 20–30%. Focus on moderate loads, technique work, and movements that feel good. No PR attempts.
- **Days 3–5:** Ramp back toward normal. Strength capacity begins to return. Good window for moderate-heavy compound work.
- **Recovery:** Allow extra warm-up time. Prioritize mobility work.
- **Injury note:** Joint laxity may be slightly elevated due to low hormone levels. Emphasize controlled movement.

**Baseline behavior:** Display "Menstrual Phase" tag. Default to moderate intensity. Allow user override if feeling strong (days 3–5 often surprise).

---

### 2. Follicular Phase (Days 6–13)

**What's happening:** Estrogen rises steadily. FSH stimulates follicle development. Energy, mood, and pain tolerance tend to increase. This is the performance sweet spot for most women.

**Biometric signatures:**

- **HRV:** Tends to be at its highest — strong parasympathetic tone
- **Body temp:** Remains at or near baseline (pre-ovulatory low)
- **RHR:** At its lowest

**Training adjustments:**

- **Intensity:** This is the time to push. Heavy compounds, PR attempts, high-volume sessions, and new skill work.
- **Volume:** Can handle higher training volume (extra sets, accessory work).
- **Strength capacity:** Peak neuromuscular performance. Estrogen supports muscle force production and tendon resilience.
- **Recovery:** Faster recovery between sessions. Can train higher frequency.
- **Mind Mode context:** Cognitive performance also tends to peak — good window for complex self-experiments.

**Baseline behavior:** Display "Follicular Phase — Peak Performance Window" tag. Bias recommendations toward higher intensity. Surface PR history and suggest attempts when readiness aligns.

---

### 3. Ovulation Phase (Days 14–16)

**What's happening:** Estrogen peaks, triggering LH surge and ovulation. Brief testosterone spike. Peak strength potential but elevated injury risk.

**Biometric signatures:**

- **HRV:** May dip slightly around ovulation
- **Body temp:** Begins to rise (progesterone starts to increase post-ovulation)
- **RHR:** May tick up slightly

**Training adjustments:**

- **Intensity:** Still high-performance capable. Can maintain heavy loads.
- **CRITICAL — Injury risk:** ACL injury risk is 3–6x higher around ovulation due to estrogen's effect on ligament laxity. This is well-documented in sports medicine literature.
  - Emphasize proper warm-up and knee stability
  - Reduce plyometrics and high-impact cutting movements
  - Add extra attention to landing mechanics
  - Consider knee sleeves for heavy squats/lunges
- **Volume:** Moderate to high, but begin watching for early fatigue signals.
- **Recovery:** Still efficient but the transition is beginning.

**Baseline behavior:** Display "Ovulation — Strong but Watch Joints" tag. Maintain high intensity recommendations but surface an injury risk warning. Flag plyometric and high-impact movements.

---

### 4. Luteal Phase (Days 17–28)

**What's happening:** Progesterone dominates. Body temperature rises. PMS symptoms may appear in the late luteal phase (days 24–28). This phase has two distinct halves.

**Biometric signatures:**

- **HRV:** Progressively decreases (sympathetic dominance from progesterone)
- **Body temp:** Elevated 0.2–0.5°C above baseline
- **RHR:** Elevated

**Training adjustments — Early Luteal (Days 17–23):**

- **Intensity:** Moderate. Strength is still reasonable but declining.
- **Volume:** Reduce total volume by 10–15% from follicular peak.
- **Focus:** Hypertrophy-focused work (moderate weight, higher rep ranges 8–12). Progesterone increases protein synthesis — muscle building is still active.
- **Endurance:** Increased fat oxidation makes this a good phase for steady-state cardio.
- **Recovery:** Increased recovery needs. Allow extra rest between heavy sessions.

**Training adjustments — Late Luteal / PMS (Days 24–28):**

- **Intensity:** Reduce significantly. This is effectively a built-in deload week.
- **Volume:** Drop 20–40% from peak. Fewer sets, lighter loads.
- **Focus:** Technique refinement, mobility, yoga, light cardio, or rest days.
- **Mood/motivation:** Energy and motivation may be low. The system should acknowledge this and not push.
- **Recovery:** Prioritize sleep, hydration, and nutrition. Water retention and bloating are common.
- **Injury note:** Coordination and reaction time may decrease. Avoid technically demanding new movements.

**Baseline behavior:** Display "Luteal Phase" tag. Early luteal: moderate intensity with hypertrophy bias. Late luteal: auto-deload recommendations. If user logs PMS symptoms, further reduce intensity suggestions.

---

## Oura Body Temperature as Cycle Proxy (V2)

Oura's `temperature_deviation` field in the daily readiness endpoint reports deviation from the user's personal temperature baseline in °C.

**The signal:**

- **Follicular phase:** Temperature hovers near or slightly below baseline (deviation ≈ 0 or slightly negative)
- **Post-ovulation shift:** Temperature rises 0.2–0.5°C above baseline and stays elevated
- **Luteal phase:** Sustained elevation (deviation consistently positive)
- **Period onset:** Temperature drops back toward baseline

**Detection algorithm (V2 implementation):**

1. Collect rolling 60-day window of `temperature_deviation` values.
2. Compute personal baseline mean and standard deviation.
3. Detect the **biphasic shift**: identify the day where temperature transitions from below-mean to above-mean and sustains for 3+ consecutive days. This marks ovulation.
4. **Phase estimation:**
   - From temp drop to biphasic shift = Follicular (includes menstrual)
   - Biphasic shift point = Ovulation (± 1 day)
   - From shift to next temp drop = Luteal
   - Temp drop event = Menstrual onset
5. Cross-validate with:
   - Cycle length history (rolling average)
   - Manual phase logs (when available)
   - HRV trends (rising HRV → follicular, declining HRV → luteal)

**Confidence scoring:**

- **High confidence:** Temp signal + manual log agree, consistent cycle length
- **Medium confidence:** Temp signal clear but no manual confirmation
- **Low confidence:** Irregular temps, missing data, or first cycle being tracked
- Always show confidence level to user. Allow manual override.

**Limitations:**

- Illness, alcohol, late meals, and travel can distort temperature readings
- Hormonal birth control suppresses the natural temperature shift
- Irregular cycles make pattern detection harder
- Need at least 2 full tracked cycles to build a reliable baseline

---

## Integration with Readiness Score

Cycle phase and Oura readiness score work together, not in isolation:

| Readiness | Cycle Phase | Recommendation |
|---|---|---|
| High (85+) | Follicular | Full send. PR day. |
| High (85+) | Luteal (late) | Moderate intensity. Body is recovered but hormonal environment isn't optimal for peak performance. |
| Low (< 55) | Follicular | Rest. Even in the performance window, a bad readiness score means the body needs recovery. |
| Low (< 55) | Luteal (late) | Active recovery only. Double rest signal. |
| Moderate (70–84) | Ovulation | Train but warm up thoroughly. Watch joints. |
| Moderate (70–84) | Menstrual (1–2) | Light session or rest. Don't push through. |

**Rule:** Readiness score is the primary gate. Cycle phase is the modifier. A low readiness score always takes priority over a favorable cycle phase.

---

## References

- Bruinvels et al. (2021). "Sport, exercise and the menstrual cycle." British Journal of Sports Medicine.
- McNulty et al. (2020). "The effects of menstrual cycle phase on exercise performance in eumenorrheic women." Sports Medicine.
- Hewett et al. (2007). "Anterior cruciate ligament injuries in female athletes." American Journal of Sports Medicine.
- Oura. "Temperature Trends" — cloud.ouraring.com/docs
