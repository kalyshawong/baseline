# Handoff: Baseline UI Redesign — "Athletic" system

## Overview
A full visual redesign of **Baseline** (the self-experimentation / training-readiness app) across all five top-level screens: **Dashboard, Mind, Body, Coach, Goals**. The redesign replaces the previous flat, monotone card stack with a bold, high-contrast "Athletic" system — condensed display type, a warm-dark surface palette, a single gold brand accent, glow-depth on panels, and angled (skewed) cuts on interactive chrome. The information architecture and data are **unchanged**; this is a visual + layout rework only.

The previous UI's two core complaints were addressed:
1. **Flat / no personality** → bold Bebas Neue display numerals, gold accent, glow-depth, angled chrome.
2. **Disconnected cards / no rhythm** → each screen now has a clear hero → supporting → detail hierarchy, equal-height rows, and grouped sections instead of uniform floating cards.

## About the Design Files
The files in this bundle are **design references authored in plain HTML + CSS** — static prototypes that show the intended look, layout, type, color, and (lightly) interaction. **They are not production code to paste in.** Your task is to **recreate these designs inside the existing Baseline codebase** — a **Next.js / React / TypeScript app styled with Tailwind v4 + CSS variables** (`src/app/globals.css`) — using its established components and patterns. Reproduce the *visual outcome*; implement it the React/Tailwind way (the prototypes use hand-written CSS classes and a couple of inline `<script>`-mounted tweak panels purely for demo).

In practice: introduce the new design tokens into `globals.css`, restyle the existing components (`src/components/**`) and route pages (`src/app/**`) to match, and keep all existing data fetching, server components, and API calls intact.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and component treatments. Recreate pixel-closely using the codebase's existing component structure. The prototypes use representative/sample data (real labels, plausible numbers) — wire your real Prisma/data sources in place of the hardcoded sample values.

---

## Design System (shared — implement first)

These map to `baseline.css` (global) + `baseline-body.css` / `baseline-coach.css` / `baseline-goals.css` (per-area modules) in the bundle. Port the tokens into `src/app/globals.css` CSS variables, then build Tailwind utilities/components from them.

### Color tokens (oklch)
| Token | Value | Use |
|---|---|---|
| `--bg` | `oklch(0.142 0.010 70)` | page background (warm near-black) |
| `--surf` | `oklch(0.195 0.010 70)` | card / panel surface |
| `--surf2` | `oklch(0.228 0.010 70)` | inset / secondary surface |
| `--line` | `oklch(0.30 0.010 70)` | hairline borders, dividers |
| `--ink` | `oklch(0.97 0.003 264)` | primary text |
| `--dim` | `oklch(0.66 0.012 264)` | secondary text |
| `--faint` | `oklch(0.50 0.012 264)` | tertiary / labels |
| `--gold` (brand accent) | `oklch(0.82 0.155 88)` | primary accent, active nav, CTAs |
| `--green` | `oklch(0.82 0.17 150)` | positive / "strong" / good |
| `--amber` | `oklch(0.83 0.16 80)` | caution / "today's call" |
| `--red` | `oklch(0.66 0.21 25)` | menstrual phase / critical |
| `--blue` | `oklch(0.74 0.13 232)` | deep-sleep / info |

**Goal category colors** (Goals screen, semantic — keep distinct):
race `var(--amber)` · strength `oklch(0.70 0.17 300)` · physique `oklch(0.73 0.19 350)` · cognitive `oklch(0.74 0.13 250)` · weight `oklch(0.78 0.15 158)` · health `oklch(0.80 0.10 195)` · custom `var(--dim)`.

> Note: the previous app used Tailwind's emerald/amber/red/blue/etc. The redesign keeps the **same semantic meaning** (green=good, amber=caution, red=alert) but shifts the surface palette warm-dark and adds a single gold brand accent. Status semantics from the source (`tierStyles`, `volumeStatusLabel`, fatigue thresholds, insight tiers) carry over unchanged — only the hues are retuned.

### Typography
- **Display / numerals:** `"Bebas Neue"` (Google Fonts) — used for all big numbers, verdicts, headings, nav brand. Tall condensed all-caps. Apply `letter-spacing: .01–.02em`.
- **UI / body:** `"Archivo"` (Google Fonts), weights 400/500/600/700/800.
- **Tabular numerals:** `font-variant-numeric: tabular-nums` on any metric number.
- Section labels ("overlines"): Archivo 11px, weight 700, `letter-spacing: .2em`, `text-transform: uppercase`, color `--faint`, `white-space: nowrap`.

### Spacing / shape
- Page is a fixed **1320px** centered column (desktop-only for now; mobile is a later pass), `padding: 0 36px`.
- Panels: **sharp corners (no border-radius)** — this is intentional to the aesthetic.
- Card gap / section gap: **14px** standard.
- **Glow-depth** (the signature panel treatment):
  ```css
  background: var(--surf);
  background-image: linear-gradient(160deg, oklch(1 0 0/.032), transparent 42%);
  box-shadow: inset 0 1px 0 oklch(1 0 0/.05), 0 12px 30px -16px #000;
  ```
- **Accent glow** on the gold CTA/active items: `box-shadow: 0 0 24px -6px var(--gold)`.
- **Angled cut** on nav items / buttons / pills / badges:
  `clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%)`.

### Shared chrome
- **Top nav** (`src/components/nav.tsx`): brand "BASELINE" in Bebas + a skewed gold square mark; nav links uppercase Archivo 13px/700; active link = solid gold bg, dark text, accent glow, angled clip.
- **Date stepper / sync**: angled square buttons, Bebas date label.
- Reusable primitives in `baseline.css`: `.panel`, `.chip`, `.tagchip`, `.pill` (`.g/.a/.muted`), `.btn` (+`.ghost`/`.block`), `.field`, `.seg` (segmented control), `.check`, `.insight` (tiered correlation card), `.empty` (dashed empty-state).

---

## Screens / Views

### 1. Dashboard (`src/app/page.tsx`)
- **Purpose:** the daily "should I train" answer + day's vitals.
- **Layout:** single 1320px console. Hero "Today's Call" band (gold/amber), then Hyrox taper countdown, activity, sleep, cycle, calories, quick actions, tonight.
- **Hero (Today's Call):** amber-accent band, big Bebas verdict ("EASY"), `Caution` status flag (angled), baseline/readiness/sleep evidence, recommendation in amber. Maps to existing `TodayCallCard`.
- **Hyrox taper card:** gold block, big Bebas day count ("6") with the headline above and "days to race" below — **note the spacing fix:** `.cd .big` needs `margin-top: 12px` and `.cd .lbl` `margin-top: 4px` so the number isn't cramped against its label.
- Sleep stages bar, calorie in/out/net, walk log — all retained from source.

### 2. Mind (`src/app/mind/page.tsx`) — "Workbench" layout
- **Purpose:** structured self-experimentation: log inputs (left) → discover correlations (right).
- **Layout:** page header ("MIND MODE" / "Structured self-experimentation") + date stepper. Full-width **context bar** (Readiness / Sleep / HRV / Stress + menstrual phase note). Then a **two-column split**: `grid-template-columns: 360px 1fr`.
  - **Left "Inputs · Log" rail:** Quick Tag (chips + custom input + time), Log Food (meal-type seg + source seg + time + textarea + Log Meal), Life Context flags (toggle chips).
  - **Right "Findings":** a filter bar (`All / Strong / Trends / Watching` with counts + Sort), a **featured top finding** (green band, big "+26%" delta block), then a flowing 2-col grid of `.insight` cards (tiers: green "Strong signal", amber "Suggestive trend", gray "Watching"), a "Show archived signals" affordance, then Active Experiments + Environment tiles.
- **Built to scale:** the findings grid keeps flowing as correlations accumulate (source `insights.ts` feeds these).
- **Renamed:** the source has two cards both titled "Today's Context" — the flags card is renamed **"Life Context"** to remove the duplicate.
- Insight card maps to `insights-feed.tsx`; left modules to `quick-tag.tsx`, `nutrition-input.tsx`, `life-context-card.tsx`; context bar to `today-context.tsx`.

### 3. Body (`src/app/body/page.tsx`) — "Command Deck" layout
- **Purpose:** training readiness, recovery, composition.
- **Layout:** Hyrox strip → full-width amber **readiness hero band** (verdict "EASY" + Volume/Intensity/HRV-CV/Baseline mods column) → labelled **sectioned grids**:
  - **Recovery Signals** — 4-up metric cards (HRV/Stress/SpO₂/Resilience) → `recovery-signals-row.tsx`.
  - **Cycle + Fatigue** — two-col: cycle-phase guidance + selector | fatigue composite (`/8`, bullet reasons, deload protocol).
  - **Running & Cardio** — 3-up grid of 9 metric cards + respiratory note → `running-metrics-card.tsx`.
  - **Strength** — two-col (1.5fr/1fr): Weekly Volume zones (MEV/MAV/MRV bars, Israetel) | PRs + Recent Workouts → `volume-zones.tsx`.
  - **Recovery** — Sleep Breakdown | Nutrition Check (Morton/Moore/Loucks) → `nutrition-check.tsx`.
  - **Composition & Energy** — Weight/Body-comp + trend SVG | TDEE & targets.
- **Equal-height rows:** two-column sections use `align-items: stretch` + `height:100%` children so paired cards align top & bottom (this was an explicit fix).
- Future: Strength section is designed to lift out into its own page cleanly.

### 4. Coach (`src/app/coach/page.tsx`) — "Focus" layout
- **Purpose:** conversational, science-backed coaching.
- **Layout:** centered ~1000px column. Title, a `+ New Chat` + `History` row (sessions live behind the History affordance rather than a persistent sidebar). **Lens bar**: per-goal focus pills (★ primary, days-left) + Holistic + a **blue "Daily Brief" mode**. A pinned **Daily Brief card** (blue) leads the thread. Messages: user bubbles right (gold right-border), assistant bubbles left with light markdown (`## h2`, `**bold**`, bullets). Typing indicator. Composer (textarea + gold Send).
- Maps to `chat-interface.tsx` (keep the lens/mode logic, tradeoff alerts, suggested prompts, markdown renderer).

### 5. Goals (`src/app/goals/page.tsx`) — "Board" layout
- **Purpose:** typed goals feeding coach context.
- **Layout:** **Primary Focus hero** (gold band, large countdown ring "4d to race", title, target). **Active Goals** as a **3-column grid of tiles** (each: centered countdown ring colored by type, type badge, title, target, deadline) + a dashed "+ New Goal" tile. Then **Archived** / **Completed** strikethrough rows.
- **Countdown ring:** SVG, two concentric circles, progress via `stroke-dashoffset = circ * (1 - pct)`, rotated -90°, "Nd" centered. Maps to `countdown-ring.tsx`. Color = goal type color.
- Keep the full type system (Race/Strength/Physique/Cognitive/Weight/Health/Custom) + subtypes + primary star + edit/archive/complete from `goals-manager.tsx`.

---

## Interactions & Behavior
- **Nav:** active item = gold fill; links navigate between the five routes.
- **Hover:** nav non-active → `--surf2` bg; cards/buttons brighten; goal-card actions (Done/Archive/Edit/×) fade in on hover.
- **Segmented controls / toggle chips:** selected = gold fill, dark text, subtle glow.
- **Coach:** lens pills switch focus/mode; Daily Brief = blue mode; Enter sends (Shift+Enter newline); optimistic message append + typing indicator (keep source behavior).
- **Goals:** star toggles primary; Done/Archive/Edit/Delete (keep source optimistic updates + API calls).
- **Transitions:** keep subtle (.12s) color/bg transitions on interactive elements; avoid heavy motion.
- All existing API routes, server-component data fetching, and state logic from the source components are **preserved** — only presentation changes.

## State Management
No new state model. Reuse the source components' existing `useState`/`useTransition`/server-component patterns. The two **Tweaks panels** (Mind, Body) in the prototypes are **demo-only** (a small React-on-CDN panel that mutates CSS variables) — do **not** port them to production; they're just to show adjustable accent / spacing / density / card-alignment.

## Design Tokens
See the **Design System** section above — all colors (oklch), the two font families, the 14px gap rhythm, sharp corners, the glow-depth shadow recipe, the accent-glow recipe, and the angled `clip-path`. Port these into `src/app/globals.css` as the source of truth.

## Assets
- **Fonts:** Bebas Neue + Archivo via Google Fonts (`next/font` recommended).
- **Icons:** minimal inline SVG (clock, chevrons, ring arcs). No icon library required; match the existing codebase's icon approach if it has one.
- **No raster/image assets** — everything is type, CSS, and SVG.

## Files (in this bundle)
Design system:
- `baseline.css` — global tokens + shared chrome/components
- `baseline-body.css`, `baseline-coach.css`, `baseline-goals.css` — per-area modules

Final screen prototypes (the canonical references):
- `Baseline Dashboard.html`
- `Baseline Mind.html`
- `Baseline Body.html`
- `Baseline Coach.html`
- `Baseline Goals.html`

(The `directions/` exploration files and `*Options*.html` comparison canvases are **not** included — they were intermediate option-comparisons. The five files above are the approved finals.)

## Source codebase mapping (quick reference)
| Screen | Route | Key components to restyle |
|---|---|---|
| Dashboard | `src/app/page.tsx` | `dashboard/today-call-card`, `metric-card`, sleep/cycle/calorie cards |
| Mind | `src/app/mind/page.tsx` | `mind/today-context`, `life-context-card`, `quick-tag`, `nutrition-input`, `nutrition-log`, `insights-feed`, `env-card` |
| Body | `src/app/body/page.tsx` | `body/readiness-tier-card`, `recovery-signals-row`, `volume-zones`, `running-metrics-card`, `nutrition-check`, `trends-charts`, `weight/*`, `hyrox-summary-card` |
| Coach | `src/app/coach/page.tsx` | `coach/chat-interface` |
| Goals | `src/app/goals/page.tsx` | `goals/goals-manager`, `goals/countdown-ring` |
| Shared | `src/app/layout.tsx`, `globals.css` | `components/nav`, `date-nav` |
