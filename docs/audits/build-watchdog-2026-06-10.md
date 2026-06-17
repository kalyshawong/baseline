# Build Watchdog — 2026-06-10

**Status:** ❌ typecheck failing · ⚠️ lint not runnable

## Typecheck (`npx tsc --noEmit`) — 2 errors

| # | File:line | Error |
|---|-----------|-------|
| 1 | `scripts/backfill-gi-outcomes.ts:68` | TS2578 — Unused `@ts-expect-error` directive |
| 2 | `scripts/backfill-gi-outcomes.ts:70` | TS2353 — `giOutcome` does not exist in `WorkoutNoteUpdateInput` |

### Root cause (single)
The script writes `giOutcome`, `giConfidence`, `giEvidence`, `giNeedsReview` to `WorkoutNote`, but **none of these fields exist in `prisma/schema.prisma`** (grep returns nothing; there's no `prisma/migrations/` dir either). The in-code comment claims "gi* fields exist after the migration" — that migration was never added, so the Prisma client has no such fields.

The two errors are the same problem: the `@ts-expect-error` on line 68 is positioned above `data: {` (line 69), which has no error, so it's flagged unused — and the real error on line 70 (`giOutcome`) leaks through. Even if the directive were moved, it would only be masking a write that fails at runtime.

### Fix options
- **If GI outcome tracking is intended:** add the four `gi*` fields to the `WorkoutNote` model in `schema.prisma`, run `prisma migrate` / `db push` + `prisma generate`, then remove the `@ts-expect-error`.
- **If not:** this script is dead/abandoned — delete `scripts/backfill-gi-outcomes.ts` or stub it out.

Only `scripts/` is affected — no app/`src` code is broken, so the running app is unaffected.

## Lint (`npm run lint`) — could not run

`next lint` dropped into its **interactive** "How would you like to configure ESLint?" prompt and stalled (no `eslintConfig` / `.eslintrc*` file, no `eslint` in devDependencies). In a non-interactive scheduled run it can't be answered, so lint produced no result — neither clean nor failing. Pre-existing config gap, not a regression.

To make lint runnable headlessly, set up ESLint once (`next lint` Strict, or migrate to the ESLint CLI per the Next 16 deprecation notice).
