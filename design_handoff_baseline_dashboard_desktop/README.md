# Handoff: Baseline Dashboard — desktop grid (≥768px)

Layout + hierarchy pass only. The "Athletic" system is unchanged (tokens, Bebas/Archivo, gold accent, sharp corners, glow-depth `.panel`, skewed chrome). Mobile/iOS untouched.

## Files
- `Baseline Dashboard.html` — the reference. Sample data = the labels and numbers from the 1440px screenshot.
- `baseline.css` — shared system (unchanged copy). All tokens come from here.
- `baseline-dashboard.css` — new dashboard grid + card modules. Only this file is new.

One override worth knowing: `baseline.css` sets `body{width:1320px}`. `baseline-dashboard.css` changes it to `body{width:auto;max-width:1320px}` so the page can shrink to 1024. Port that as the page container (`max-w-[1320px] mx-auto`).

## Container
- Max content width **1320px**, side padding **36px** → 1248px content at ≥1320.
- All gaps **14px** (between cards and between rows).
- `.dash` is `display:grid; gap:14px` — rows stack; each row is its own grid.

## Rows (top → bottom), heights at 1440×900
Order is: today (call, scores, actions) → today's evidence → signals → workouts → reference/history (60-night baseline, 14-night timing chart). History sits below the day.

| Row | Grid | Cards | Height |
|---|---|---|---|
| 1 Hero | `1fr 260px 240px` | Today's Call · Score stack (Baseline/Readiness/Sleep) · Action stack (Log food / Log workout / Open coach) | ~290px |
| 2 Evidence | `1.1fr 1.15fr 1fr` | Sleep · Your Baseline · (Calories over Cycle, stacked) | ~300px |
| 2b Signals | 1 col | Signals · yours only (two amber tiles) | ~110px |
| 3 Workouts | `1fr 1fr` | Strength · Upper · Running | ~600px |
| 4 Reference | `1fr 2fr` | Activity · Sleep timing (14 nights) | ~330px |
| 5 Tonight | 1 col | Sleep target strip | ~56px |

Header + date strip ≈ 150px. Page total ≈ **2,000px** at 1440 (was ~3,800). Workout cards run ~600px after the added session / volume / baseline blocks — the ~400px target was relaxed by the user for those two cards. The three main actions sit in the hero row, above the fold.

Paired rows use `align-items:stretch`; each card is `display:flex; flex-direction:column` so footers (`.pfoot`, `.recov`, `.wk .foot`, `.timing .note`) pin to the bottom with `margin-top:auto`.

## Workout card (`.wk`) — brought into the system
Order inside the card:
1. Overline `WORKOUT` + time range (right)
2. Title in Bebas (`.ttl`, 30px)
3. Heart rate: overline `AVG HEART RATE`, Bebas 44px in `--red` + `bpm`, `range lo–hi` right-aligned
4. HR curve (SVG, 64px, `preserveAspectRatio:none`, red stroke + 18% red fill)
5. Zone bar (`.zbar`, 6px, segments flex by %) + zone legend (`.zleg`, Z1 blue · Z2 green · Z3 gold · Z4 orange `oklch(0.74 0.17 55)` · Z5 red) + "Zones vs your observed max" note
6. `.vsb` "vs your baseline · last 60 days": three mini stats (label · Bebas 28px delta · your-usual sub-line); red = abnormal, amber = watch, ink = in band. Running also carries a red `.flag` "Did something happen?" box with Add notes / Discuss with coach when a run is far off pace.
7. Tiles (`.tiles`, `grid-auto-flow:column` so 2 or 3 tiles share the width): Duration / Distance / Active cal — overline label + Bebas 32px
8. `.sess` "What you did": exercise line (or splits for a run), then "Weekly volume · vs your MEV / MAV / MRV" as `.pill` chips — `.g` in MAV · `.a` at MEV · `.r` below MEV · `.muted` reference.
9. `.meta`: Pre-workout fuel, Notes (+ Fasted / Edit)
10. Footer: "Discuss with coach →" (blue link, gold on hover)

Two workouts in a day sit side by side (`.workouts`, `1fr 1fr`). A single workout should span both columns (`grid-column:1/-1`) — the same internal layout works at full width.

## Other card notes
- **Score stack / action stack**: `grid-template-rows:repeat(3,1fr)` so the three cards fill the hero height. Actions are `<a class="panel act">` with a 4px gold left rule.
- **Your Baseline**: 4px `--blue` left rule, `YOUR NORMAL` pill in blue.
- **Sleep**: 64px Bebas duration, gold score badge, single Latency row (red, one line), stage bar (Deep/REM/Light flex by minutes), recovery footer.
- **Sleep timing**: CSS grid rows `44px 1fr 38px` (date · track · duration). Bars are absolutely positioned inside `.trk` with `left/width` as % of the 12am–2pm (14h) axis. 2h gridlines via `repeating-linear-gradient`. Today's row bolded. Colors: green in band · red short · blue long · gold today.
- **Your Baseline** now carries a third block: 60-day run HR conclusion (168 bpm across easy/long/tempo) with a one-line read. Blue accent, no red — it is a set-point, not an alert.
- Cards show data only, except the Running `.flag` and the Your Baseline read lines, which the user asked for explicitly.

## Breakpoints
- **≥1200px** — full grid above.
- **900–1200px** (covers 1024): hero `1fr 220px 210px`; evidence stays 3-col; reference tightens to `1fr 1.5fr`; workouts stay side by side.
- **768–900px**: hero `1fr 200px`, actions move to a 3-up row under the hero; evidence goes 2-col (Sleep | Your Baseline) with Calories + Cycle as a 2-up row beneath; workouts 2-col; reference stacks to one column.
- Verdict type is `clamp(88px, 9.5vw, 124px)` so STANDARD never wraps.

## Tailwind mapping hints
Tokens → `globals.css` variables as before. Grids are plain `grid grid-cols-[1fr_260px_240px] gap-[14px]` etc. The HR SVG can be a small client component that takes a `number[]` and draws the path; the zone bar/legend take `{zone, range, pct}[]`.
