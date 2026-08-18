# API Route Hygiene Audit — 2026-07-01

Scope: all 41 `src/app/api/**/route.ts` files. One row per route file. Each column is a hygiene check applied across every exported handler in the file.

**Legend:** ✓ pass · ✗ fail · N/A not applicable (check doesn't apply to this route)

**Checks:**
1. **try/catch** — every exported handler (GET/POST/PUT/DELETE/PATCH) wraps its logic in try/catch.
2. **apiError** — errors returned via `apiError()` from `src/lib/utils.ts` (not raw ad-hoc `NextResponse.json` error shapes).
3. **JSON-safe** — routes calling `request.json()` return 400 on malformed JSON. (`apiError()` maps `SyntaxError → 400`, so any `request.json()` inside the try satisfies this.)
4. **Prisma-map** — Prisma errors mapped `P2025 → 404`, `P2002 → 409`, else `500 + server log` (handled by `apiError()`).
5. **Anthropic** — routes that reach the Anthropic API have rate limiting AND context caching (BUG-004 pattern).
6. **Input-valid** — user input validates numeric ranges, string lengths, enum values, and date formats.
7. **safeJsonParse** — DB JSON-string fields deserialized via `safeJsonParse`, never raw `JSON.parse`.

## Results

| # | Route | try/catch | apiError | JSON-safe | Prisma-map | Anthropic | Input-valid | safeJsonParse |
|---|-------|:---------:|:--------:|:---------:|:----------:|:---------:|:-----------:|:-------------:|
| 1 | auth/oura/callback | ✓ | ✓ | N/A | ✓ | N/A | ✓ | N/A |
| 2 | auth/oura | ✓ | ✓ | N/A | N/A | N/A | N/A | N/A |
| 3 | coach | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | N/A |
| 4 | coach/sessions/[id] | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 5 | coach/tradeoffs | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 6 | cycle-phase | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 7 | env-readings | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 8 | exercises | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 9 | experiments/[id]/analyze | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 10 | experiments/[id]/logs | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 11 | experiments/[id] | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 12 | experiments | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 13 | goals/[id] | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 14 | goals | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 15 | healthkit-sync | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 16 | hyrox/plan/[id] | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 17 | hyrox/plan | ✓ | ✓ | N/A | ✓ | N/A | ✓ | N/A |
| 18 | hyrox/sessions | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 19 | hyrox/today | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 20 | life-context/defs | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 21 | life-context/logs | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 22 | nutrition | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | N/A |
| 23 | profile | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 24 | sync | ✓ | ✓ | N/A | ✓ | N/A | ✓ | N/A |
| 25 | tags | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 26 | templates/[id] | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 27 | templates | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | ✓ |
| 28 | weight/[id] | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 29 | weight | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 30 | workout-notes/[id]/analyze | ✓ | ✓ | N/A | ✓ | ✗ | N/A | ✓ |
| 31 | workout-notes/[id] | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | N/A |
| 32 | workout-notes | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | N/A |
| 33 | workouts/[id]/goals | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 34 | workouts/[id] | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 35 | workouts/[id]/sets/[setId] | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 36 | workouts/[id]/sets | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 37 | workouts/apple-watch | ✓ | ✓ | N/A | ✓ | N/A | ✓ | N/A |
| 38 | workouts/manual | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 39 | workouts | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 40 | workouts/rpe-suggestions | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 41 | workouts/trends | ✓ | ✓ | N/A | ✓ | N/A | ✓ | N/A |

## Summary

- **Routes audited:** 41
- **Total ✗ marks:** 8, spread across 8 distinct route files (no file fails more than one check).

Failures by category:

| Check | Failures | Routes |
|-------|:--------:|--------|
| 1. try/catch | 0 | — |
| 2. apiError | 0 | — |
| 3. JSON-safe | 0 | — |
| 4. Prisma-map | 0 | — |
| 5. Anthropic protection | 4 | workout-notes/[id]/analyze, nutrition, workout-notes, workout-notes/[id] |
| 6. Input validation | 4 | exercises, experiments/[id]/logs, experiments/[id], experiments |
| 7. safeJsonParse | 0 | — |

No route fails more than one category. Eight ✗ marks fall on eight distinct route files.

## Failures detail

### Check 5 — Anthropic protection (4)

The reference implementation is `coach/route.ts:15-41`: an in-memory token-bucket rate limiter (`checkRateLimit`, 10 req/min) **plus** a 5-minute context cache (`getCachedContext`). None of the routes below carry either guard, so each request makes an uncapped call to Claude — unbounded token spend and no throttle. Every one already wraps the SDK call in `withAnthropicRetry`, but retry is resilience, not rate limiting or caching, and does not satisfy this check.

- **`src/app/api/workout-notes/[id]/analyze/route.ts:16,174-183`** — *direct* `@anthropic-ai/sdk` import. Instantiates `new Anthropic()` and calls `client.messages.create` (Sonnet, 600 max tokens) on every POST with no rate limit and no caching. The system prompt (`ANALYZE_SYSTEM_PROMPT`, lines 41-65) is large and static — a prime candidate for prompt caching. Highest-priority fix: it's the only *direct* SDK importer missing the BUG-004 pattern.
- **`src/app/api/nutrition/route.ts:74`** — *indirect* via `estimateMacros()` (`src/lib/usda.ts:1,21-23`, which imports the SDK). Every meal-log POST calls Claude with no rate limit and no cache. High traffic surface (logged multiple times a day).
- **`src/app/api/workout-notes/route.ts:113`** — *indirect* via `classifyGiFields()` → `classifyNarrative()` (`src/lib/gi-classifier.ts:79,119-121`). Each note POST triggers a Claude classification call, unthrottled.
- **`src/app/api/workout-notes/[id]/route.ts:68`** — *indirect* via `classifyGiFields()` on every narrative PATCH; same exposure as above.

Note: `experiments/[id]/analyze` was checked and does **not** reach Anthropic (`analyzeExperiment` in `src/lib/correlation.ts` is pure statistics), so it is correctly N/A.

### Check 6 — Input validation (4)

The codebase has strong shared validators in `src/lib/utils.ts` (`validateNumber`, `validateString`, `validateEnum`, `validateDateString`, `collectErrors`) — used well in goals, profile, workouts/[id], etc. The four routes below predate or skip them and validate only presence, letting unchecked types/ranges/dates flow into `new Date(...)` and Prisma.

- **`src/app/api/exercises/route.ts:32-44`** — POST checks required-field *presence* only. No string-length cap on `name`/`muscleGroup`/`movementPattern`/`equipment`; `defaultSets`/`defaultReps` are written with `?? 3` / `?? 10` but never type- or range-checked (a client can send `defaultSets: "abc"` or `9e9`); `isCompound` not type-checked.
- **`src/app/api/experiments/[id]/logs/route.ts:34-56`** — POST validates only that `independentValue` is defined. `day` is passed to `new Date(day)` (line 40) with no format/NaN guard → an invalid date reaches the `experimentId_day` upsert key; `independentValue` has no numeric range check; `notes`/`intensity` have no length/type caps.
- **`src/app/api/experiments/[id]/route.ts:39-45`** — PATCH whitelists fields but validates none of them: `status` is not enum-checked (any string persists), `endDate` goes through `new Date(body.endDate)` (line 43) with no NaN guard, and `title`/`hypothesis` have no length caps.
- **`src/app/api/experiments/route.ts:30-43`** — POST checks presence of the six required fields only. `lagDays`/`minDays` accept any value/type (default `0`/`14` but overridable with unchecked input), `metricSource` is not enum-validated, and no string-length caps on `title`/`hypothesis`/`independentVariable`/`dependentVariable`. GET (`:9-12`) passes `status` straight into the Prisma `where` with no enum check (goals/route.ts does guard this — inconsistent).

## Observations (not scored as failures)

These are minor gaps worth a follow-up but not hard ✗ against the seven checks:

- **`weight/route.ts:10`** — GET uses raw `parseInt(...)` for `days` with no range clamp, unlike sibling routes that use `parseIntInRange` (e.g. workouts/apple-watch, workouts/trends). A huge value just widens the query window; low risk.
- **`workouts/rpe-suggestions/route.ts:14-19`** — validates `exerciseIds` is an array but sets no length cap and doesn't check element types; a large array drives N sequential Prisma queries (mild DoS vector). Compare `workouts/[id]/goals/route.ts:26` which caps at 50.
- **`tags/route.ts:45-49`** — POST validates `category` (enum) and clamps `limit`, but `tag` has no length cap and `timestamp`/`start_date`/`end_date` go through `new Date(...)` without NaN guards.
- **`hyrox/plan/[id]/route.ts:90-95`** — validates all numeric fields and `status` (enum) well, but `raceDate`/`startDate` use `new Date(body.x)` with no NaN guard.
- **JSON-parse convention** — every route relies on `apiError()`'s `SyntaxError → 400` branch rather than the unused `parseRequestBody()` helper in `utils.ts`. This passes check 3, but the helper is dead code; either adopt it or delete it.

## Top 3 routes most in need of attention

1. **`workout-notes/[id]/analyze/route.ts`** — the only *direct* `@anthropic-ai/sdk` route missing the BUG-004 protection. Largest static system prompt (ideal for prompt caching) and an uncapped Sonnet call per request. Add the `checkRateLimit` + context/prompt-cache pattern from `coach/route.ts`.
2. **`nutrition/route.ts`** — highest-traffic Anthropic-backed endpoint (meals logged several times daily), fully unthrottled via `estimateMacros`. Add rate limiting; consider caching the static macro-estimation system prompt in `usda.ts`.
3. **`experiments/route.ts`** (with its siblings `experiments/[id]` and `experiments/[id]/logs`) — the weakest input validation in the codebase: unvalidated enums, dates flowing into `new Date()` and Prisma keys, and no string-length caps. Retrofit the shared `validate*` helpers already used by goals/profile.
