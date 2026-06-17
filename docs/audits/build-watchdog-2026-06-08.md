# Build Watchdog — 2026-06-08

Automated typecheck + lint pass on Baseline. **Unchanged from 2026-06-07** — same 2 errors, still open. This is now the 2nd consecutive day (and recurs in earlier runs); it's a standing breakage, not a fresh regression.

## Typecheck (`npx tsc --noEmit`) — 2 errors

Both in the same one-off backfill script, not in app code:

1. `scripts/backfill-gi-outcomes.ts:68` — `TS2578: Unused '@ts-expect-error' directive.`
2. `scripts/backfill-gi-outcomes.ts:70` — `TS2353: Object literal may only specify known properties, and 'giOutcome' does not exist in type '...WorkoutNoteUpdateInput...'.`

These are coupled. The `@ts-expect-error` on line 68 was meant to suppress the `giOutcome`/`giConfidence`/`giEvidence`/`giNeedsReview` write on the following block (comment: "gi* fields exist after the migration"). TS flags both that the directive suppresses nothing on its line (2578) **and** that `giOutcome` still isn't a known property on `WorkoutNoteUpdateInput` (2353).

Confirmed this run: `grep` finds **no `gi*` fields in `prisma/schema.prisma`** and **no migration referencing `giOutcome`**. So the "after the migration" the comment assumes was never created/committed in this checkout — the script targets fields that don't exist in the schema. `npm run db:generate` alone won't fix it; the schema + migration would need to actually add the `gi*` columns to `WorkoutNote`, or the script and its directive should be deleted as dead code.

Fix path (pick one):
- If GI-outcome backfill is still intended: add `giOutcome` / `giConfidence` / `giEvidence` / `giNeedsReview` to `WorkoutNote` in the schema, migrate, regenerate, then remove the `@ts-expect-error`.
- If abandoned: delete `scripts/backfill-gi-outcomes.ts` (or at least the field writes + directive). It can't run successfully as-is.

## Lint (`npm run lint` → `next lint`) — not configured / could not run

`next lint` produced no errors or warnings — it dropped into the interactive ESLint setup prompt ("How would you like to configure ESLint? Strict / Base / Cancel"), meaning **no ESLint config exists** and there's no `eslint` dependency in `package.json`. Running `npx eslint .` directly confirms: "ESLint couldn't find an eslint.config.(js|mjs|cjs) file." In a non-interactive run this hangs rather than linting.

Net: lint is a no-op. Either set up ESLint once (`Strict` recommended) so this watchdog checks lint, or drop the lint step until ESLint is adopted. (`next lint` is also deprecated, removed in Next.js 16.)

## Bottom line
Typecheck broken by a backfill script written against `gi*` fields that were never added to the Prisma schema — a `db:generate` won't fix it; schema+migration or delete-the-script is required. Lint still isn't running because ESLint was never configured. Both have been open since at least 2026-06-07.
