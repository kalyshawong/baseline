# API Route Hygiene Audit — 2026-05-01

Audit of every `src/app/api/**/route.ts` against seven hygiene checks.

## Legend

- **TC** — try-catch wraps every exported handler
- **SE** — Structured errors via `apiError()` from `src/lib/utils.ts`
- **JP** — `request.json()` calls catch SyntaxError → 400
- **PE** — Prisma error mapping (P2025 → 404, P2002 → 409, others → 500 + log)
- **AP** — Anthropic protection: rate limiting AND context caching (only applies to routes that directly `import` `@anthropic-ai/sdk`)
- **IV** — Input validation (numeric ranges, string lengths, enums, date formats) on user-supplied input
- **SJ** — `safeJsonParse` for DB JSON fields (not raw `JSON.parse`)

✓ = pass · ✗ = fail · N/A = not applicable to this route

## Summary

- Routes audited: **36**
- Failures by category: TC **2** · SE **3** · JP **0** · PE **3** · AP **0** · IV **20** · SJ **1**
- Total failed checks: **29** across **23** routes

### Top 3 routes most in need of attention

1. **`src/app/api/sync/route.ts`** — fails TC, SE, PE, IV (4 checks). Auth block is outside try-catch; catch returns a non-standard `{ success, error }` shape; no Prisma mapping; `lookbackDays` query param unvalidated.
2. **`src/app/api/coach/sessions/[id]/route.ts`** — fails TC, SE, PE (3 checks). Neither GET nor DELETE has try-catch; the only error path is a hand-rolled 404; a missing-id DELETE will surface as a 500 instead of a 404.
3. **`src/app/api/coach/tradeoffs/route.ts`** — fails SE, PE (2 checks). The catch block silently swallows every error and returns `{ tradeoffs: [] }` with status 200, masking real failures (DB outages, runtime exceptions) as "no tradeoffs".

## Checklist

| # | Route | TC | SE | JP | PE | AP | IV | SJ |
|---|---|---|---|---|---|---|---|---|
| 1 | `auth/oura/callback/route.ts` | ✓ | ✓ | N/A | ✓ | N/A | ✓ | N/A |
| 2 | `auth/oura/route.ts` | ✓ | ✓ | N/A | N/A | N/A | N/A | N/A |
| 3 | `coach/route.ts` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | N/A |
| 4 | `coach/sessions/[id]/route.ts` | ✗ | ✗ | N/A | ✗ | N/A | N/A | N/A |
| 5 | `coach/tradeoffs/route.ts` | ✓ | ✗ | N/A | ✗ | N/A | N/A | N/A |
| 6 | `cycle-phase/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 7 | `env-readings/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 8 | `exercises/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 9 | `experiments/[id]/analyze/route.ts` | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 10 | `experiments/[id]/logs/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 11 | `experiments/[id]/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 12 | `experiments/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 13 | `goals/[id]/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 14 | `goals/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 15 | `healthkit-sync/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 16 | `hyrox/plan/[id]/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 17 | `hyrox/plan/route.ts` | ✓ | ✓ | N/A | ✓ | N/A | ✓ | N/A |
| 18 | `hyrox/today/route.ts` | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 19 | `life-context/defs/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 20 | `life-context/logs/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 21 | `nutrition/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 22 | `profile/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 23 | `sync/route.ts` | ✗ | ✗ | N/A | ✗ | N/A | ✗ | N/A |
| 24 | `tags/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 25 | `templates/[id]/route.ts` | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 26 | `templates/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | ✗ |
| 27 | `weight/[id]/route.ts` | ✓ | ✓ | N/A | ✓ | N/A | N/A | N/A |
| 28 | `weight/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 29 | `workouts/[id]/goals/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 30 | `workouts/[id]/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 31 | `workouts/[id]/sets/[setId]/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 32 | `workouts/[id]/sets/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✓ | N/A |
| 33 | `workouts/apple-watch/route.ts` | ✓ | ✓ | N/A | ✓ | N/A | ✗ | N/A |
| 34 | `workouts/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 35 | `workouts/rpe-suggestions/route.ts` | ✓ | ✓ | ✓ | ✓ | N/A | ✗ | N/A |
| 36 | `workouts/trends/route.ts` | ✓ | ✓ | N/A | ✓ | N/A | ✗ | N/A |

(Rows alphabetized.)

## Failures detail

### TC — try-catch coverage

- **`coach/sessions/[id]/route.ts:4-17`** — `GET` handler has no `try`. Hand-rolls the 404 for missing session but lets every other Prisma error bubble up unhandled.
- **`coach/sessions/[id]/route.ts:19-26`** — `DELETE` handler has no `try`. P2025 (record-not-found) on a missing id will surface as an unhandled exception → 500.
- **`sync/route.ts:6-16`** — Auth/header reading happens outside the try block (try only opens at line 18). Any throw from `request.headers.get` or URL parsing during auth would bypass the catch and return an unstructured Next.js error response.

### SE — Structured errors via `apiError()`

- **`coach/sessions/[id]/route.ts:14`** — Returns `NextResponse.json({ error: "Not found" }, { status: 404 })` directly with no `apiError` path elsewhere. There is no `catch` block in either handler, so the route never reaches the structured-error utility at all.
- **`coach/tradeoffs/route.ts:77-79`** — Catch block returns `NextResponse.json({ tradeoffs: [] })` (status 200) instead of routing through `apiError(error)`. Errors are silently masked as empty results — callers cannot distinguish "no tradeoffs" from "server crashed".
- **`sync/route.ts:36-42`** — Catch returns `NextResponse.json({ success: false, error: ... }, { status: 500 })`. Shape (`{ success, error }`) differs from the project standard `{ error }` produced by `apiError()`, and Prisma error codes are never inspected.

### PE — Prisma error mapping

- **`coach/sessions/[id]/route.ts:24`** — `prisma.chatSession.delete` will throw `P2025` for an unknown id. Without a catch, Next surfaces it as a 500 instead of the expected 404.
- **`coach/tradeoffs/route.ts:77`** — Catch swallows everything (including Prisma errors) into a 200 with empty tradeoffs.
- **`sync/route.ts:34-42`** — Catch never inspects `error.code`, so any Prisma error from `syncOuraData` returns a 500 with the raw message rather than the mapped 404/409.

### AP — Anthropic protection

No failures. The only direct importer of `@anthropic-ai/sdk` is `coach/route.ts`, which has both rate limiting (`checkRateLimit`, lines 13–26) and context caching (`getCachedContext`, lines 29–39).

> **Note (not a checklist failure, but worth flagging):** `nutrition/route.ts` does not directly import `@anthropic-ai/sdk` but indirectly invokes it through `estimateMacros` in `src/lib/usda.ts:1-50`. That call has retry but no per-route rate limit or context cache. The BUG-004 pattern was originally about coach; consider extending it to `nutrition` POST since it can issue uncapped Claude calls per request.

### IV — Input validation

Routes accepting user input but missing one or more of: numeric range, string length, enum, or date format checks.

- **`coach/route.ts:43-46`** — `message` is presence-checked but not length-bounded (could be megabytes); `sessionId`/`focusGoalId` not validated as strings; `mode` only triggers behavior when `=== "today"` but no rejection of other values.
- **`env-readings/route.ts:14-19`** — Only `timestamp` presence is checked. `pm25`, `temperature`, `humidity`, `pressure`, `noise_db`, `lux` accept any value. `device_id` length not capped. `GET hours` query param parsed with `parseInt` and used directly (NaN propagates into `Date` math).
- **`exercises/route.ts:30-34`** — POST validates required-field presence only. No length cap on `name`, no enum check on `muscleGroup`/`movementPattern`/`equipment`, no range on `defaultSets`/`defaultReps`. GET `q` length not capped.
- **`experiments/[id]/logs/route.ts:33-36`** — Only `independentValue` presence is checked (no number type, no range). `day` accepted in any format consumable by `new Date()`. `intensity` and `notes` neither validated nor length-capped.
- **`experiments/[id]/route.ts:39-46`** — `allowedFields` filter blocks unknown keys but does not validate `status` against the enum, `title`/`hypothesis` length, or `endDate` format (any string passes through `new Date(...)`, can become Invalid Date).
- **`experiments/route.ts:29-42`** — Required-field presence only. No length on `title`/`hypothesis`, no range on `lagDays`/`minDays`, no enum on `metricSource`. GET `status` query param not enum-validated.
- **`goals/[id]/route.ts:14-25`** — PATCH iterates allowed fields and assigns them straight to `data` without enum-checking `status` or `priority`, length-checking `title`/`notes`/`target`, or rejecting invalid `deadline` strings.
- **`goals/route.ts:23-35`** — POST validates `type` enum but no length cap on `title`/`notes`/`target`, no validation that `deadline` is a parseable ISO string before `new Date(deadline)`.
- **`healthkit-sync/route.ts:410-411`** — `body.data` accepted without shape validation; `metric.data[i].qty`, `metric.data[i].date` types not enforced strictly (relies on per-case `if (!d.qty || !d.date)`). Risk: malformed payloads coerce silently.
- **`nutrition/route.ts:22-31`** — `text` length not bounded (drives Anthropic token cost). `mealType` not strictly validated (silently defaults to "snack" instead of rejecting unknown values). `eatenAt` accepted as any `Date`-parseable string.
- **`profile/route.ts:17-35`** — Allowed-fields list is enforced but no range validation on `bodyWeightKg`, `bodyFatPct`, `heightCm`, `age`, `targetWeightKg`, `dailyCalorieTarget`, and no enum check on `sex`, `experienceLevel`, `activityLevel`, `goal`, `unit`.
- **`sync/route.ts:19-21`** — `lookbackDays = Number(...)` — no NaN guard, no upper bound, no lower bound. A user-controlled query param feeds directly into the sync window.
- **`templates/route.ts:25-42`** — POST validates `name` and exercise-array shape (presence of `exerciseName`/`targetSets`/`targetReps`) but no length on `name`, no range on `targetSets`/`targetReps`, no enum on `split`, no max array length on `exercises`.
- **`workouts/[id]/goals/route.ts:30-34`** — PUT validates `goalIds` is an array but does not check entries are non-empty strings or cap the array length (DOS via huge array of fake ids inside a transaction).
- **`workouts/[id]/route.ts:39-45`** — PATCH copies `sessionRPE`, `notes`, `completedAt`, `durationMin` into `data` with no range or format checks. `completedAt` strings can become Invalid Date and persist.
- **`workouts/[id]/sets/[setId]/route.ts:24-33`** — PATCH lacks the BUG-011 range checks present on the sibling POST route — `reps`, `weight`, `rpe`, `notes` all written through unchecked.
- **`workouts/apple-watch/route.ts:8-9`** — `days` query param parsed via `parseInt` with no NaN/range guard; NaN flows into `setDate(getDate() - NaN)` and produces an Invalid Date.
- **`workouts/rpe-suggestions/route.ts:12-19`** — Validates `exerciseIds` is an array but does not bound length or check entries are non-empty strings; long arrays trigger an N+1 against `prisma.workoutSession.findFirst`.
- **`workouts/route.ts:9-10, 30-36`** — GET `limit` parsed without range/NaN check. POST `templateName` length not bounded; `date` is only loosely validated by being concatenated to `T00:00:00.000Z` (e.g. `?` becomes Invalid Date).
- **`workouts/trends/route.ts:14`** — `weeks` parsed via `parseInt` and capped with `Math.min(parseInt(...), 13)`. `Math.min(NaN, 13) === NaN`, which then drives `rangeStart` via `setUTCDate` math and yields Invalid Date.

### SJ — `safeJsonParse` for DB JSON fields

- **`templates/route.ts:53`** — POST returns the just-created template with `JSON.parse(template.exercises)` instead of `safeJsonParse(template.exercises, [])`. The GET handler at line 13 uses `safeJsonParse` correctly; the POST handler should match.
