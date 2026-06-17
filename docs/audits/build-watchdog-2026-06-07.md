# Build Watchdog — 2026-06-07

Automated typecheck + lint pass on Baseline.

## Typecheck (`npx tsc --noEmit`) — 2 errors

Both in the same one-off backfill script, not in app code:

1. `scripts/backfill-gi-outcomes.ts:68` — `TS2578: Unused '@ts-expect-error' directive.`
2. `scripts/backfill-gi-outcomes.ts:70` — `TS2353: Object literal may only specify known properties, and 'giOutcome' does not exist in type '...WorkoutNoteUpdateInput...'.`

These are coupled. The `@ts-expect-error` on line 68 was meant to suppress the `giOutcome`/`giConfidence`/`giEvidence`/`giNeedsReview` write on the following block (comment says "gi* fields exist after the migration"). TS is now flagging both that the directive isn't suppressing anything on its line (2578) **and** that `giOutcome` still isn't a known property on `WorkoutNoteUpdateInput` (2353).

Likely cause: the Prisma client is stale or the migration adding the `gi*` fields to `WorkoutNote` hasn't been applied/generated in this checkout. Fix path: run `npm run db:generate` (and confirm the migration is present). If the client regenerates with the fields, both errors clear and the `@ts-expect-error` should be removed. If the `gi*` fields were intentionally dropped, delete the directive and the field writes.

## Lint (`npm run lint` → `next lint`) — not configured / could not run

`next lint` did not produce errors or warnings — it dropped into the interactive ESLint setup prompt ("How would you like to configure ESLint? Strict / Base / Cancel"), which means **no ESLint config exists in the project** and there's no `eslint` dependency in `package.json`. In a non-interactive run this hangs rather than linting.

Net: lint is effectively a no-op right now. Two options:
- Set up ESLint once (`Strict` recommended) so this watchdog actually checks lint, or
- Drop the lint step from the watchdog until ESLint is adopted.

Note: `next lint` is also deprecated and will be removed in Next.js 16; the migration path is `npx @next/codemod@canary next-lint-to-eslint-cli .`.

## Bottom line
Typecheck is broken by a stale-Prisma-client / migration mismatch in the backfill script — most likely fixed by `npm run db:generate`. Lint isn't running at all because ESLint was never configured.
