# Build watchdog — 2026-06-11

Automated typecheck + lint pass on Baseline.

## Typecheck (`npx tsc --noEmit`) — ❌ 2 errors

Both in the same backfill script; the app source is clean.

1. `scripts/backfill-gi-outcomes.ts:68` — TS2578: Unused `@ts-expect-error` directive.
2. `scripts/backfill-gi-outcomes.ts:70` — TS2353: `giOutcome` does not exist in `WorkoutNoteUpdateInput`.

### Root cause
The script writes `giOutcome`, `giConfidence`, `giEvidence`, `giNeedsReview` to `WorkoutNote`, but **none of these `gi*` fields exist in `prisma/schema.prisma`** (confirmed: `grep giOutcome prisma/schema.prisma` → no match). So the generated Prisma client type rejects them.

The two errors are linked: the `@ts-expect-error` on line 68 is positioned above `data: {` (line 69, which has no error), so it's flagged as unused — while the actual type error fires one line lower on `giOutcome:` (line 70) and stays unsuppressed. The comment claims "gi* fields exist after the migration," but the migration is either not present, not applied, or the client wasn't regenerated.

### Suggested fix
The real fix is a schema decision, not a directive tweak — these are the lazy-attractor options vs. the correct one:
- **If the `gi*` fields are intended:** add them to the `WorkoutNote` model in `prisma/schema.prisma`, run the migration, and regenerate the client. Then both errors disappear and the `@ts-expect-error` can be deleted.
- **If they live elsewhere** (e.g. inside `signalSnapshot` JSON per the data conventions): rewrite the script to write into that field instead.
- Moving/keeping the `@ts-expect-error` to silence line 70 would compile but leaves a write to non-existent columns — that would fail at runtime, so don't ship that.

## Lint (`npm run lint`) — ⚠️ did not run

`next lint` is deprecated (removed in Next.js 16) and **no ESLint config exists** (`eslint.config.*` / `.eslintrc*` not found). The command drops into an interactive "How would you like to configure ESLint?" prompt and never lints, so it can't run in this automated context.

This is a config gap, not a code lint failure. To restore an automated lint pass, migrate off `next lint`:
```
npx @next/codemod@canary next-lint-to-eslint-cli .
```
and commit the resulting flat config so `npm run lint` runs non-interactively.
