# Build Watchdog — 2026-06-03

**Typecheck (`tsc --noEmit`): FAIL — 2 errors**
**Lint (`next lint`): could not run — ESLint not configured (interactive setup prompt)**

## Typecheck errors

Both errors are in the same backfill script and share one root cause.

1. `scripts/backfill-gi-outcomes.ts:68` — TS2578: Unused `@ts-expect-error` directive.
2. `scripts/backfill-gi-outcomes.ts:70` — TS2353: `'giOutcome'` does not exist in `WorkoutNoteUpdateInput` (also covers `giConfidence`, `giEvidence`, `giNeedsReview` in the same object literal).

### Root cause
The `gi*` fields the script writes (`giOutcome`, `giConfidence`, `giEvidence`, `giNeedsReview`) **do not exist on the `WorkoutNote` model**. Confirmed:
- Not in `prisma/schema.prisma` (`model WorkoutNote` at line 614 has no `gi*` fields).
- Not in the generated client (`node_modules/.prisma/client/index.d.ts`).

The script's inline comment says *"gi\* fields exist after the migration"* — but that migration was never added. So the `@ts-expect-error` is doubly wrong: it's placed on the comment line (line 68), which suppresses errors on line 69 `data: {` — a line that has no error — hence TS2578 "unused". Meanwhile the actual error one line lower (line 70) goes unsuppressed → TS2353.

### Fix options
- **If GI-outcome tracking is meant to ship:** add the four `gi*` fields to `WorkoutNote` in `schema.prisma`, run `prisma migrate` + `prisma generate`, then delete the now-unnecessary `@ts-expect-error`.
- **If it's stale/abandoned WIP:** remove or gate `scripts/backfill-gi-outcomes.ts` so it doesn't poison the typecheck.

This blocks `tsc --noEmit` from passing even though it's a one-off script rather than app/runtime code.

## Lint — inconclusive
`next lint` could not produce results: no ESLint config exists in the repo (no `.eslintrc*`, no `eslintConfig` block), so `next lint` drops into its interactive "How would you like to configure ESLint?" setup prompt and cancels under non-interactive execution. This is a config gap, not a lint failure — there are no lint results to report either way. Note `next lint` is also deprecated (removed in Next.js 16); worth migrating to the ESLint CLI when convenient.
