# Build Watchdog — 2026-04-28

Automated typecheck + lint pass on `/Users/kalysha/projects/baseline`.

## Summary

- **Typecheck (`tsc --noEmit`)**: 1 error
- **Lint (`npm run lint` → `next lint`)**: could not run — interactive setup prompt (no ESLint config present)

## Typecheck errors

### 1. `src/app/body/page.tsx:310` — TS2739

`<WeightCard ... />` is missing 4 required props from `Props`:

- `goalDeadline`
- `goalCals`
- `tdee`
- `weeklyRate`

The component contract in `src/components/weight/weight-card.tsx` (lines 3–14) requires 10 props. The other call site, `src/app/page.tsx:461`, passes all 10 correctly — only `body/page.tsx` was left behind when the component was extended.

Likely fix: pass the same four values that `src/app/page.tsx` already computes (`goalDeadline`, `goalCals`, `tdee`, `weeklyRateLb` → `weeklyRate`) at the `body/page.tsx` call site.

## Lint status

`npm run lint` (which runs `next lint`) launches an interactive ESLint setup wizard rather than executing a lint pass:

```
? How would you like to configure ESLint?
  Strict (recommended)
  Base
  Cancel
```

There is no `.eslintrc*` / `eslint.config.*` in the repo and no ESLint deps in `package.json`. Lint cannot be evaluated until ESLint is configured (or the script is updated). Note that `next lint` itself is deprecated and will be removed in Next.js 16; the wizard suggests migrating with `npx @next/codemod@canary next-lint-to-eslint-cli .`.

This is a tooling gap, not a code regression — flagged here for awareness, not as a build break.
