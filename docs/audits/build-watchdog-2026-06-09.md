# Build watchdog — 2026-06-09

**Status:** ❌ typecheck failing · ⚠️ lint could not run (no ESLint config)

## `npx tsc --noEmit` — 2 errors

| File:line | Code | Message |
|---|---|---|
| scripts/backfill-gi-outcomes.ts:68 | TS2578 | Unused `@ts-expect-error` directive. |
| scripts/backfill-gi-outcomes.ts:70 | TS2353 | Object literal may only specify known properties, and `giOutcome` does not exist in type `WorkoutNoteUpdateInput` / `WorkoutNoteUncheckedUpdateInput`. |

**Root cause (both errors are one issue):** the `gi*` fields (`giOutcome`, `giConfidence`, `giEvidence`, `giNeedsReview`) are not present on the generated Prisma `WorkoutNote` type. Either the migration that adds them hasn't been applied, or `prisma generate` hasn't been re-run since. Two knock-on effects:

- The `@ts-expect-error` on line 68 sits above `data: {` (line 69), which has no error, so the directive is flagged unused (TS2578). The real error is on line 70 (`giOutcome:`).
- A matching `@ts-expect-error` on line 37 (above the `where` filter, line 38) is currently doing the suppressing for the read side, so that one isn't flagged.

**Fix options:**
1. If the migration is meant to be live: run the Prisma migration + `npx prisma generate`, then remove both `@ts-expect-error` directives (they'll become unused once the types exist).
2. If staying pre-migration: move the line-68 directive down so it sits immediately above `giOutcome:` (line 70), the line that actually errors.

**Scope:** `scripts/backfill-gi-outcomes.ts` is an **untracked** new file (`??` in git) — a one-off backfill script, not app/runtime code. No tracked files are affected.

## `npm run lint` (`next lint`) — did not complete

`next lint` dropped into its interactive first-run setup ("How would you like to configure ESLint?") because no ESLint config exists in the repo (`.eslintrc*` / `eslint.config.*` not found). It can't run non-interactively in this state, so no lint results were produced — this is a config gap, not a code error. Note: `next lint` is also deprecated and slated for removal in Next.js 16.

To get lint running headlessly, add an ESLint config (e.g. migrate to the ESLint CLI per Next's `next-lint-to-eslint-cli` codemod) so the watchdog can capture real lint output going forward.
