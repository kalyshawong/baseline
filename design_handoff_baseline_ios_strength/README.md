# Handoff: Baseline — iOS Strength mode (lifter)

## Overview
A strength-training mode for the Baseline iPhone app, for a bodybuilding / strength lifter who trains 4–6 days a week on a split, does no cardio, wears a Garmin, logs every set, and is always in a bulk, cut or maintain phase. Everything is compared to **his own history**, never to a population.

It answers his three questions:
- **Today:** what am I training, and can I push it? → Today call + in-session log.
- **This week:** is each muscle getting enough work, and am I recovering? → Body tab + evening check-in.
- **This block:** am I progressing, and when do I deload? → Block view + e1RM.

## Files
| File | What it is |
|---|---|
| `Baseline iOS Strength.html` | Interactive prototype inside an iPhone frame. |
| `Strength Screens.html` | Canvas showing all 9 screen states side by side. Every frame is the live prototype opened on a given state. |
| `baseline-mobile.css` | The existing iOS design system, unchanged copy (tokens, device frame, tab bar, `.panel`, `.mcard`, `.tagchip`, `.seg`, `.btn`, `.pill`, `.g-sec`, `.appbar`). |
| `baseline-strength.css` | All new strength components, prefixed `st-`. Loads after `baseline-mobile.css`. |
| `baseline-strength.js` | Prototype logic. The data objects at the top of the file (`MUSCLES`, `EX`, `LIFTS`, `RAMP`, `VARS`) double as the data-model spec. |

The URL parameter `?screen=` opens a specific state: `today`, `log`, `sheet`, `summary`, `body`, `block`, `checkin-e`, `checkin-m`, `mind`. `&bare=1` removes the scaling (used by the canvas).

These are **design references in HTML/CSS/JS**. Rebuild them in the target codebase (SwiftUI natively). Tokens, sizes and copy are final (high fidelity). The device bezel, status bar and scaling are for presentation only.

## Design language (unchanged)
- Warm-black surfaces `--bg / --surf / --surf2`, 1px `--line` hairlines, gold `--gold` accent.
- Bebas Neue for big numbers and titles, Archivo for text.
- Sharp corners, skewed chrome (parallelogram `clip-path`) on pills and tabs, glow-depth panels.
- **Status colors:**
  - **Push** `--green`
  - **Hold** `--amber`
  - **Deload** `--red`
  - **Your band / your normal** `--blue`
  - **Today's plan:** gold dashed stripe
- **Spacing scale:** 6 / 10 / 14 / 20 pt.
  - 16pt page padding.
  - 14pt between cards.
  - `.panel` padding 17×18.
- **Tap targets ≥44pt** everywhere. In the session log they are ≥52pt. The RIR/RPE buttons are 62pt tall, and the steppers are 64pt tall with 52pt ± buttons.
- **Data only on cards.** No coaching chips, no citations. The only definitions shown are the Push / Hold / Deload legend and the deload trigger rule.
- **Source labeling:** Garmin's modeled values (Body Battery, sleep score) are always labeled **"Garmin model · context"**. Resting HR is a Garmin measurement compared against his own normal. Fatigue is labeled **"Baseline signal"**.

## Navigation
- The tab bar stays **Today · Mind · Body · Coach · Goals**. Coach and Goals are unchanged and out of scope; the prototype shows a stub for them.
- **Full-screen modals (tab bar hidden):**
  - In-session log (from Today → Start).
  - Session summary (from Finish).
  - Check-in (from the Today links or the summary).
- **Pushed screen:** Block (from Today or Body). It shows a `‹ Body` back link, and the Body tab stays selected.
- Experiments live in **Mind**.

## Screens

### 1. In-session log (`#v-log`) — the core screen
Used mid-set with 90 seconds of rest, one-handed, with sweaty thumbs. Everything he taps sits in the **bottom dock** (thumb zone). The top half is for reading only.

**Top half (scrolls):**
- **Header** `.st-lh`:
  - ✕ close (44pt).
  - PUSH A · elapsed timer · "2 of 16 sets".
  - **RIR / RPE** toggle (session-wide).
  - **Finish** button.
- **Exercise strip** `.st-exstrip`: horizontal chips, one per exercise (`1 · Bench`, `2 / 4 sets`). Gold underline marks the current one; the count turns green when all sets are done.
- **Exercise head:**
  - Name (Bebas 30).
  - Muscle · "Last Sep 20" · e1RM for main lifts.
  - Once today's best beats last time, a green "▲ 136.7 today" appears.
- **Set table** `.st-sets`. Columns `28 / 1.1fr / 1fr / 44`: **Set · Last · Today · RIR**. Rows are 52pt.
  - *Last* is last session's same set inline: `100 × 8 RIR 2`.
  - *Done* rows have a green number and a check with the RIR.
  - The *active* row has `--surf2` fill and a 3pt gold rule, and its Today value updates live from the steppers.
  - *Next* rows are faint.
  - Tap any row to make it active; tapping a done row edits it.
  - An extra set beyond last time's count shows **"+1 set · push"** in green. This is the Today call applied.
  - A new exercise shows **"First time"**, plus a note row: "No previous session. Today's sets become the reference for next time."
- **+ SET / + EXERCISE** buttons, dashed, 48pt. They never leave the flow.
  - + Set copies the last set.
  - + Exercise opens a bottom sheet with search and recent exercises. Each row shows the last date and last set, or "No previous session".

**Bottom dock** `.st-dock`, pinned above the home indicator:
1. **Rest timer** `.st-rest`:
   - Label, then "Experiment · 3:00 rest" in blue, because the running experiment sets the rest length.
   - Countdown (Bebas 40).
   - **−15 / +15 / Skip** buttons, 46×44.
   - 2pt gold progress line.
   - At 0 it shows **GO** in gold with a glow, and Skip becomes Clear.
   - Idle state: "Rest timer starts when you log a set · 3:00 this block".
2. **Caption:** "SET 3 · Bench" on the left, last session's same set on the right.
3. **Steppers:** load (± the exercise's increment, e.g. 2.5 kg) and reps (±1). The value shows in Bebas 34.
4. **One-tap RIR / RPE row:** 5 buttons, 62pt, gold outline.
   - RIR mode: `0 1 2 3 4+`. RPE mode: `10 9 8 7 ≤6`. RIR is stored internally.
   - **Tapping a value logs the set.** No separate Log button, so a set that matches the plan is one tap.
   - Logging starts the rest timer, moves on to the next set, and shows a toast ("Set 3 · 102.5 × 8 · RIR 2 · Undo") above the dock.
5. When every set of the exercise is done, the dock shows **"Next · Incline DB press ›"**. After the last exercise it shows **"Finish session ›"** (62pt gold).

**Session summary** (`#v-summary`), on Finish:
- **Volume:** Σ load × reps, with the % change vs last session of the same template.
- **Sets:** done / planned, plus duration vs last time.
- **Top set:** the highest-e1RM set on a main lift.
- **e1RM vs last time** for each main lift, e.g. "Bench 133.3 → 136.7 kg, +3.3".
- **Weekly sets after today** per trained muscle: new total, band, and "In your band" / "Under your min" / "Over your max".
- A link to the evening check-in, then **Done**.
- **e1RM formula:** RIR-adjusted Epley, `load × (1 + (reps + RIR) / 30)`. Best set per lift.

### 2. Body tab, lifter version (`#v-body`)
There is **no running section and no HRV / stress / SpO₂ cards.**

1. **Weekly sets vs your band.** Rolling 7 days, one row per muscle (12). Columns `86 / 1fr / 58`.
   - The track scales 0–24 sets.
   - The blue fill is his band (min–max); the 2pt blue tick is his adaptive target.
   - This week's sets show as a 6pt bar: green in band, dim under min, amber over max.
   - Today's planned sets are a gold dashed extension.
   - The value reads "8 / 10–18".
   - **Empty states** replace the track with text: Calves "Band not learned yet · 3 of 6 weeks logged"; Abs "No ab sets logged · 6 weeks of sets learns a band".
   - Footnote: bands are learned from his last 14 weeks of logged sets and how he recovered from them.
2. **Estimated 1RM · 12 weeks.** 2×2 `.mcard` tiles with value, 12-week change and a gold sparkline, for Bench, Squat and OHP. Deadlift is an empty state: "Logged twice in 8 weeks. A trend needs 4 sessions."
3. **Soreness map** from the last check-in, read-only.
   - Front and back figures built from tiles, not an anatomical drawing.
   - Grid columns in a 44 : 30 : 30 : 44 ratio, filling the figure width (about 44 / 30 / 30 / 44pt on a 393pt screen). Rows are 46pt. Map panels use 12pt side padding.
   - Front: side delts, front delts, biceps, chest, abs, quads. Back: rear delts, back, triceps, glutes, hamstrings, calves.
   - Left and right pairs share one value.
   - Tile fill scale: 0 `--surf2`, 1 amber 30%, 2 amber 62%, 3 red, plus a legend.
4. **Fatigue.** A Baseline signal with 3 states (Fresh / Building / High), shown as the word in Bebas 40 plus a 3-segment gauge. It lists its three inputs:
   - 7-day resting HR vs his normal.
   - Top-set reps at RPE 8 on bench.
   - Muscles at soreness 2+ for 48 h.
5. **Garmin card**, tagged "CONTEXT":
   - Body Battery 72 and sleep score 81, both labeled "Garmin model · context".
   - Resting HR 54 bpm, "Your normal 56".
6. A link to Block.

### 3. Today call, lifter version (`#v-today`)
- **Call card:** 5pt green rule and glow when any muscle is Push.
  - Session name (PUSH A).
  - One row per muscle on deck: name, "sets this week · band · soreness", and a **Push / Hold / Deload** verdict in Bebas 40, colored.
  - Legend: Push = add load or a set vs last session · Hold = repeat last session · Deload = half the sets, −10% load.
- **"What made the call"**: exactly four inputs vs his 60-day normal, each with an effect tag (Supports push / Normal / Holds triceps / Room in chest):
  1. Sleep last night vs his normal. The Garmin sleep score sits underneath as context.
  2. Resting HR vs his normal.
  3. Soreness in today's muscles, from the last check-in.
  4. Sets this week vs his band.
  - **No HRV** anywhere.
- **Start button:** 66pt gold. "Start Push A · 6 exercises · 16 sets · last time 68 min". After the session it becomes "Push A logged · View session summary".
- **Links:** Morning weigh-in · Evening check-in · Block. Each turns green with the saved value once done.
- **Empty state** (not drawn; build it): if there was no check-in last night, the soreness row reads "No check-in last night — soreness left out of today's call", and the call uses the other three inputs.

### 4. Check-in (`#v-checkin`) — additions to the existing check-in
A Morning / Evening segmented control at the top.
- **Evening:**
  - **Session RPE** 1–10: 5×2 grid, 50pt, labeled "1 very easy … 10 max effort".
  - **Soreness:** the same tile map as Body, but editable. Each tap steps the value 0 → 1 → 2 → 3 → 0, and a readout echoes "Triceps → 2 Moderate".
  - **Protein vs his 170 g target:** Yes / Close / No.
  - **Tags:** the existing tag chips.
  - **Save check-in.**
- **Morning:**
  - **Body weight** stepper: ±0.1 kg, value in Bebas 58, prefilled from yesterday.
  - 3 cells: 7-day avg · rate (kg/wk) · phase target (bulk +0.25–0.50 kg/wk).
  - A 28-day chart: daily dots, gold 7-day average, blue target corridor from the phase start, and a gold diamond for today.
  - **Cut** flips the corridor negative; **maintain** is a ±0.1 kg/wk corridor.
  - **Save weight.**

### 5. Block view (`#v-block`) — one screen
- **Title:** MESO 3 · Hypertrophy · date range · phase.
- **Week track:** W1–W5 + Deload. The current week is filled gold, and Deload has a dashed outline.
- **Planned volume ramp:** 6 columns, each bar a dashed outline of planned total sets.
  - Done weeks are filled `--dim`; the current week is filled gold.
  - Today's planned sets show as a gold dashed stack on the current week.
  - Values sit above the bars: "100+16 of 120".
- **Deload signals:** three checks, amber when met. A deload is suggested **only when all three line up**:
  - Fatigue signal is High for 3+ days.
  - 3+ muscles at soreness 2+ for 48 h.
  - 3+ muscles above his max band.
  - Status box: "1/3 · Deload stays in week 6…". At 3/3 the box's copy changes to suggest moving the deload forward.
- **e1RM since block start:** Bench / Squat / OHP.

### 6. Experiments for lifters (`#v-mind`)
- **Running experiment card:** green rule.
  - Variable A vs B, outcome, block length.
  - Block pips 1–6: past arms shown, the current one gold, future ones "?".
  - "This block: B · 3 min rest on every set · rest timer set for you" (this feeds the log's rest timer).
  - Sessions on protocol.
  - Lock box: "Results unlock Oct 18, after block 6. **No interim numbers are shown.**"
- **Designer:** the existing Mind experiment designer did not exist as a component in this project, so it is built here from `.tagchip`, `.seg` and `.panel`. It has 3 steps plus a review.
  1. **Variable:** Sleep extension · Pre-workout carbs · Caffeine timing · Creatine · Training frequency · Rest intervals. The one already running is disabled and marked "Running". A–B arm cards appear below. Creatine locks blocks to 4 weeks (saturation and washout note). Frequency locks to 2 weeks and keeps weekly sets equal.
  2. **Outcome:** *Volume at prescribed RPE* (top-set load × reps at RPE 7 / 8 / 9) or *Estimated 1RM*, plus the lift. Deadlift is disabled with the reason given (not enough sessions).
  3. **Randomized blocks:** block length, then 4 / 6 / 8 blocks. Blocks are drawn in balanced pairs (AB or BA), and each arm is revealed on its first Monday.
  - **Review** sentence with dates. **Queue experiment**: it starts after the current one ends, since only one blocked experiment runs at a time.

## State & data (see the top of `baseline-strength.js`)
- `MUSCLES[]`: `{id, n, sets (rolling 7 d), band:[min, adaptive, max] | null, empty (reason text), sore 0–3}`.
- `EX[]` session template: `{n, sh, m (primary muscle), main, inc (kg step), lastDate, last:[[load, reps, rir]], plan:[[load, reps]]}`. Runtime per set: `{load, reps, rir, done, last}`.
- `LIFTS[]`: 12 weekly e1RM values, or `null` + empty reason.
- `RAMP`: planned / done weekly totals, today's planned sets, current week index.
- `VARS[]` experiment variables: `{A, B, len options, note, running}`.
- Check-in: `{rpe 1–10, sore{muscle: 0–3}, protein Yes|Close|No, tags[], weight kg}`.
- Persisted in the prototype: the last screen (`localStorage: baseline_strength_screen`). Natively, persist the in-progress session so a crash or app switch mid-set loses nothing.

## Empty-state rule
A card never shows a bare dash. It says why it is empty and what fills it. Examples in the build:
- Calves and Abs bands.
- Deadlift e1RM, and the disabled Deadlift outcome.
- A new exercise's "First time" set rows.
- The add-exercise sheet with no search match.
- Top set when no main lift was logged.
- The rest timer idle line.

## Out of scope
- Coach and Goals tabs.
- Mind's Log and Findings sections (unchanged; see `design_handoff_baseline_mind/`).
- Dashboard features from the endurance build (runs, HRV verdicts, cycle).
