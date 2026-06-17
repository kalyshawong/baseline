# Build Watchdog — 2026-05-01

## Summary

- **Typecheck (`npx tsc --noEmit`)**: 1 error
- **Lint (`npm run lint`)**: did not run — `next lint` prompted interactively for ESLint config (no `.eslintrc*` / `eslint.config.*` present in repo). Not a regression in code; tooling setup.

## Typecheck errors

1. `src/app/body/page.tsx:310:12` — TS2739: `<WeightCard>` is missing four required props: `goalDeadline`, `goalCals`, `tdee`, `weeklyRate`.

   The `WeightCard` component (defined in `src/components/weight/weight-card.tsx`, lines 3–14) declares all four as required on its `Props` interface. The other call site in `src/app/page.tsx:454` passes them; the body page call site at line 310 does not.

   **Fix options**:
   - Pass the four missing props from `src/app/body/page.tsx` (compute/derive them in the page like `src/app/page.tsx` already does), or
   - Mark them optional on `Props` (`goalDeadline?: Date | null`, etc.) if the body page is intentionally a slimmer view.

## Lint

`next lint` is now deprecated in Next 15.x and prompts to choose a config because none exists. Two options:

- Migrate to the ESLint CLI per the Next.js codemod (`npx @next/codemod@canary next-lint-to-eslint-cli .`), or
- Add a minimal `eslint.config.mjs` so `next lint` runs non-interactively.

Until then, the lint step in this watchdog produces no signal.
