# Baseline — Roadmap

**Last updated:** 2026-05-27
**Horizon:** Rest of 2026 (June → December)
**Format:** Now / Next / Later
**Owner:** Kalysha (solo)

---

## Where things actually stand

The product is more built than the docs suggest. Phase 1, Phase 2a (Mind), and Phase 2b (Body) all shipped — including a bunch of "unplanned" wins (Coach, Goals, Weight, HealthKit sync, Oura expansion, Goal-Coach redesign, Goals/Coach UI redesign). The 2026-05-27 drift report counts **23 silent features** shipped but undocumented and **17 doc claims** that no longer match the code. PRD still lists Body-mode features as "not yet shipped" that have been live for weeks.

So the "everything is a mess" feeling is mostly bookkeeping debt, not feature debt:

- **22 days of uncommitted code** sitting in the working tree — the backfill-past-workouts feature, one cohesive change across 5 src files
- **2 High-severity bugs** in that uncommitted code (BUG-H1 unvalidated `date`, BUG-H2 UTC-vs-local timezone regression of BUG-008)
- **7 High-severity Next.js CVEs** that `npm audit fix` clears in one command
- **Source-of-truth docs (PRD, architecture, features)** last updated ~6 weeks ago, drifted hard from reality
- **5 bug-scan items** from prior audits still open (Promise.all fan-outs, nutrition rate limit, non-transactional writes)
- **Hyrox race on 2026-06-03** — 7 days out. Code freeze until after.

Most of the work below is consolidation and debt paydown, plus two real feature bets: making Hyrox session-tracking actually work, and the meal-insights v2 already drafted as a prompt.

---

## Now (June 2026)

The post-race month. Goal: clear the mess so July starts on a clean foundation.

| Item | Status | Why | Owner / Date |
|---|---|---|---|
| **Race week freeze** | Not Started | Hyrox 2026-06-03. No risky merges until after. | Through 2026-06-03 |
| **Ship the backfill-workouts feature** | At Risk | 5 files, 22 days stale. But fix BUG-H1 + BUG-H2 first (10 min each, helpers already exist). Then commit per `.commit-plan.md` Group 1. | Week of 2026-06-09 |
| **`npm audit fix`** | Not Started | Kills 7 High-severity Next CVEs + postcss XSS. Zero-risk, non-breaking. | Same session as above |
| **Sync docs to reality** | Not Started | Refresh PRD (Oura table 5→12 endpoints, Body-mode "not yet shipped" list, coach context counts), architecture.md (Prisma model count 18→39, schema sections), features.md is closest to current. This *is* the "everything is a mess" feeling. | Mid-June |
| **Hyrox v2: enable "Start session"** | Not Started | Currently disabled per `hyrox-module-spec.md`. The race-day plan view works; the live tracking flow doesn't. Highest-value new feature in flight. | Late June |
| **Drain prior bug-scan backlog** | Not Started | Promise.all fan-outs (`/mind`, `/body`, `/api/coach/tradeoffs`, `/page.tsx`); nutrition Anthropic rate limit; nutrition non-transactional writes. All flagged 2026-05-11, still open. | June, spread across sessions |

**On Track:** 0 · **At Risk:** 1 · **Not Started:** 5 · **Done this period:** 0

---

## Next (July → September 2026)

Feature investments, plus the upgrades that have been sitting in the dep-watch.

| Item | Why | Notes |
|---|---|---|
| **Meal insights v2 — "weekly patterns" card** | Prompt already drafted (`oura-meal-response-insights-prompt.md`). Natural extension of the meal-source tagging that just shipped. Highest-leverage new feature. | Move prompt into `docs/prompts/` first |
| **Apple Watch metric discovery** | Unblocks VO2 Max + running speed/power/GCT/vertical oscillation/stride length/cardio recovery in the coach. Needs one tracked outdoor run + HAE config + update placeholder case names in `healthkit-sync/route.ts`. | Cheap once race training resumes |
| **`@anthropic-ai/sdk` 0.82 → 0.98** | Closes moderate advisory. 1 call site to spot-check (streaming in coach). | Low–medium effort |
| **Prisma 6 → 7** | Smallest-surface major bump per dep-watch. Likely a single `lib/prisma.ts` change. | Sequence first among the upgrade trio |
| **Dark mode** | Open issue, often-requested polish. Tailwind 4 makes this cheap. | Optional if other items eat the quarter |
| **Workout templates → relational** | Currently stored as JSON string in `WorkoutTemplate.exercises`. Quality-of-life refactor; query power unlocks template analytics. | Bundle with v2 template editor work if any |

**Capacity note:** Pick 3 of 6. A solo builder at typical pace ships 1 substantive thing per month — meal insights v2 and Apple Watch discovery are the two non-negotiables; the third slot is the SDK bump or Prisma 7. Dark mode and template refactor are stretch.

---

## Later (October → December 2026)

Strategic directions, not commitments. Order will shift.

| Item | Why | Open question |
|---|---|---|
| **HealthKit cycle auto-sync** | Last unshipped item from Cycle V2. `CyclePhaseLog.source = "healthkit"` is reserved but no path writes it yet. | Worth the work given manual logging works fine? |
| **Oura temp-proxy cycle phase detection** | The other half of Cycle V2 — predict phase transitions from BBT shift. | Calibration period needs ~2 cycles of paired manual + temp data first |
| **Recharts 2 → 3** | Visible regressions easy to spot in dev. Sequence after Prisma 7. | Codemod helps but every chart reading internal state needs touch |
| **Next 15 → 16** | Async `params`/`searchParams` ripple through every dynamic route. Codemod exists but it's the biggest upgrade by far. Defer until 16 is stable. | Pin the version that has the longest support window |
| **Phase 2c — Arduino IMU (barbell velocity)** | Spec written, hardware not built. Real engineering project — firmware, BLE, velocity profiling. | Honest question: is this still wanted, or has Apple Watch + RPE covered the use case? |
| **Env sensor hardware build** | Parts (~$47) ordered months ago. Endpoint is live. Just needs breadboard + wires + firmware. | Same question — does Mind mode still need PM2.5/noise/temp to be useful? |
| **Phase 3 scale work** (multi-user, Postgres, mobile, public API) | Only matters if Baseline opens beyond dogfooding. | Decision point, not a roadmap item, until that's the goal |

---

## Risks and dependencies

- **Race-week freeze (through 2026-06-03)** — every Now item except itself depends on this clearing. No technical risk; just calendar.
- **BUG-H1 + BUG-H2** block clean shipping of backfill — but they're 10-minute fixes with helpers already in `2ebca6e`. The risk is *not* fixing them and either (a) shipping the unvalidated date field as the new user-facing surface, or (b) the timezone regression silently breaking the rest timer every evening for west-of-UTC users.
- **Doc-drift fix has no hard dependency** but is the foundational lift — every subsequent roadmap update gets cheaper once PRD/architecture match reality.
- **Apple Watch metric discovery needs a real outdoor run with HAE configured**. Easy to schedule, easy to forget. Tie it to first post-race run.
- **Hyrox v2 "Start session" depends on hyrox-module-spec.md Phase 2 being written** — the spec referenced in code is for the read-only race plan that already shipped. Need to author the session-tracking spec before building.

---

## Capacity sanity check

Solo, side-project pace. Realistic monthly output: **1 substantive feature + 2–4 small fixes/bumps**. The Now column has 6 line items but most are low-effort (bug fixes, `npm audit fix`, doc sync) so it's feasible. Next column lists 6 — explicitly oversubscribed, pick 3. Later column is directional, not committed.

If anything new gets added to Now, something equivalent moves to Next. Don't grow the Now column past 6 items without cutting.

---

## What's NOT on this roadmap (intentionally)

- **Marketing / launch** — the one-pager (`Baseline_One_Pager.docx`) exists but Baseline is still dogfooding-only. Listing "share with users" before deciding to open it would be roadmap theater.
- **The full 30-bug backlog from `docs/bugs.md`** — most are fixed. The remaining handful are folded into "drain prior bug-scan backlog" in Now.
- **New experiment templates, new nutrition features, new coach prompts** — Mind mode is feature-complete. Build only on real friction, not on novelty.
- **AI/LLM rewrites of existing modules** — they work. Don't.

---

## Changes since prior roadmap

There was no prior consolidated roadmap — pieces lived across `docs/PRD.md §7`, `docs/task-tracker.md`, `docs/build-sequence-rationale.md`, `docs/phase-2-spec.md`, `docs/phase-3-spec.md`, `docs/hyrox-module-spec.md`, `.commit-plan.md`, `.dep-watch-2026-05-27.md`, and `docs/drift/drift-2026-05-27.md`. This file is the single home going forward. The others can stay as supporting specs; update this one when priorities shift.
