# Build watchdog — 2026-08-24

## Typecheck: PASS
`npx tsc --noEmit` → exit 0, no errors.

## Lint: CANNOT RUN (tooling gap, not a code regression)

`npm run lint` → exit 1. It does not report lint errors; it never gets that far.

```
> next lint
`next lint` is deprecated and will be removed in Next.js 16.
? How would you like to configure ESLint?
❯  Strict (recommended) / Base / Cancel
```

Root cause: the repo has **no ESLint setup at all**.

- No `.eslintrc*` / `eslint.config.*` file in the repo root
- No `eslintConfig` key in `package.json`
- `eslint` and `eslint-config-next` are absent from both `dependencies` and `devDependencies`, and not present in `node_modules`

So `next lint` drops into its interactive first-run setup wizard, which hangs/fails in any non-TTY context (this watchdog, and CI too). This has presumably never worked — it is not a regression from recent commits.

Additional wrinkle: the project is on Next `^15.3.0`, and `next lint` is deprecated and removed in Next 16. Setting up ESLint via the wizard would buy a config that needs migrating again soon.

### Suggested fix (needs a human decision — not applied)

Migrate straight to the ESLint CLI rather than using the deprecated wizard:

```bash
npm i -D eslint eslint-config-next @eslint/eslintrc
npx @next/codemod@canary next-lint-to-eslint-cli .
```

That installs ESLint, writes a flat `eslint.config.mjs` wired to `eslint-config-next`, and rewrites the `lint` script to `eslint .` — which runs cleanly non-interactively and survives the Next 16 upgrade.

Until then, this watchdog can only verify typecheck.

### Note on working tree
Three files had uncommitted modifications at check time (`src/app/mind/page.tsx`, `src/components/mind/quick-tag.tsx`, `src/components/mobile/mobile-quick-tag.tsx`). They typecheck clean.
