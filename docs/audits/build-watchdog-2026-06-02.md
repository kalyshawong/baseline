# Build watchdog — 2026-06-02

**Status:** ⚠️ Broken (typecheck failing) · lint not configured

## Summary

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ❌ 2 errors (1 file) |
| `npm run lint` (`next lint`) | ⚠️ Not configured — no error in code |

All type errors are confined to a single backfill script (`scripts/backfill-gi-outcomes.ts`). App/route code typechecks clean.

## tsc errors

```
scripts/backfill-gi-outcomes.ts(68,11): error TS2578: Unused '@ts-expect-error' directive.
scripts/backfill-gi-outcomes.ts(70,13): error TS2353: Object literal may only specify known
  properties, and 'giOutcome' does not exist in type WorkoutNoteUpdateInput.
```

### Root cause

The script writes `giOutcome`, `giConfidence`, `giEvidence`, `giNeedsReview` to `prisma.workoutNote.update(...)`, but **none of those `gi*` fields exist on the `WorkoutNote` model in `prisma/schema.prisma`**. The comment on line 68 (`// @ts-expect-error gi* fields exist after the migration`) assumes a migration that was never landed in the schema.

Two failures cascade from this:

- **TS2353 (line 70):** `giOutcome` isn't a known property of `WorkoutNoteUpdateInput`, so the `data: {}` object is rejected.
- **TS2578 (line 68):** the `@ts-expect-error` is positioned on the line before `data: {` (line 69), where there is no error to suppress — so it's flagged as unused, even though the real error is one line down on 70.

### Fix options

1. **If the gi* fields are intended:** add them to the `WorkoutNote` model in `prisma/schema.prisma`, run `prisma migrate` + `prisma generate`. The `@ts-expect-error` then becomes removable and both errors clear.
2. **If not yet ready:** move the `@ts-expect-error` directly onto line 70 (`giOutcome: c.outcome,`) so it suppresses the actual error, OR exclude `scripts/**` from the typecheck if these one-off scripts shouldn't gate the build.

## Lint

`next lint` halted on an interactive ESLint-setup prompt ("How would you like to configure ESLint?") — there's no `.eslintrc*` / `eslint.config.*` and no ESLint Next.js plugin configured. The exit code 1 came from the killed prompt, **not** from lint violations in the code. Also note: `next lint` is deprecated and removed in Next.js 16.

To get real lint coverage, configure ESLint once (`Strict` preset) or migrate to the ESLint CLII per Next's `next-lint-to-eslint-cli` codemod. Until then this watchdog can't lint.
