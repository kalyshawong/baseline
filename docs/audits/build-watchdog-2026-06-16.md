# Build Watchdog — 2026-06-16

**Status:** ⚠️ typecheck failing · lint not runnable

## Typecheck (`npx tsc --noEmit`) — 2 errors

Both errors are in a single standalone script. No `app/`, `src/`, or component code is affected, so the app itself still compiles — but `tsc --noEmit` exits non-zero repo-wide.

| File:line | Error | Message |
|---|---|---|
| `scripts/backfill-gi-outcomes.ts:68` | TS2578 | Unused `@ts-expect-error` directive |
| `scripts/backfill-gi-outcomes.ts:70` | TS2353 | `'giOutcome' does not exist` in `WorkoutNoteUpdateInput` |

### Root cause (anomaly flagged)
The script writes `giOutcome / giConfidence / giEvidence / giNeedsReview` to `prisma.workoutNote.update(...)` with the comment `// @ts-expect-error gi* fields exist after the migration`. **That claim is false** — none of those `gi*` fields exist in `prisma/schema.prisma` (the `WorkoutNote` model has `signalSnapshot` but no `gi*` columns), and they aren't in the generated Prisma client either. So:

- The migration the comment refers to was never applied (or never written).
- The `@ts-expect-error` lands on the `data: {` line (68), which has no error, so TS reports it unused; the real error fires one line down on `giOutcome` (70).

The script is dead against the current schema — it would fail at runtime too, not just typecheck.

### Fix options
1. If GI-outcome persistence is intended: add `giOutcome`, `giConfidence`, `giEvidence`, `giNeedsReview` to the `WorkoutNote` model, migrate, regenerate the client. Then both errors clear and the `@ts-expect-error` should be removed.
2. If not intended / abandoned: delete or `.gitignore` the script (it's referenced only by its own usage comments — nothing imports it).

## Lint (`npm run lint`) — could not run

`next lint` is deprecated and **no ESLint config exists in the repo**, so the command drops into an interactive "How would you like to configure ESLint?" setup prompt instead of running a pass. It can't complete non-interactively and reports no lint results either way.

Recommend migrating off `next lint` (removed in Next.js 16) to the ESLint CLI — e.g. `npx @next/codemod@canary next-lint-to-eslint-cli .` — and committing an `eslint.config.*` so the watchdog can actually lint.
