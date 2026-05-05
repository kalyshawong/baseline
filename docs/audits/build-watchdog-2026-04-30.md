# Build Watchdog — 2026-04-30

## Summary

- **Typecheck (`npx tsc --noEmit`):** 1 error
- **Lint (`npm run lint`):** Not configured — interactive setup prompt; no `.eslintrc*` / `eslint.config*` present. `next lint` is also deprecated (slated for removal in Next.js 16).

## TypeScript errors (top 1)

1. `src/app/body/page.tsx:310` — `TS2739`: `<WeightCard …>` is missing required props `goalDeadline`, `goalCals`, `tdee`, `weeklyRate`.

   The `WeightCard` component (`src/components/weight/weight-card.tsx`, lines 3–14) declares those four props as required, but the call site in `body/page.tsx` only passes `latestWeightKg`, `latestBodyFat`, `unit`, `goal`, `targetWeightKg`, `weightTrend`.

   Fix options: either pass the four missing props from `body/page.tsx` (they appear to be already-computed values like `tdee` and the goal context elsewhere in the page), or mark them optional (`?`) in the `Props` interface if the card should render without them.

## Lint

`npm run lint` runs `next lint`, which dropped into an interactive ESLint setup prompt because no ESLint config exists in the repo. No actual lint pass ran. To get lint signal back, either:

- Run `npx @next/codemod@canary next-lint-to-eslint-cli .` to migrate to the ESLint CLI (Next 16 is deprecating `next lint`), or
- Add a minimal `eslint.config.mjs` and update the `lint` script.

Until then, lint is effectively skipped in CI/watchdog runs.
