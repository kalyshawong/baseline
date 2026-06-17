# Build watchdog — 2026-05-21

Automated typecheck + lint pass on `/Users/kalysha/projects/baseline`.

## Typecheck (`npx tsc --noEmit`)

Clean. Exit 0, no errors.

## Lint (`npm run lint` → `next lint`)

Failed (exit 1), but **not** with code-level errors. The project has no ESLint configuration:

- No `.eslintrc*` file
- No `eslint.config.*` file
- `package.json` lint script is still the default `"lint": "next lint"`

When invoked, `next lint` drops into an interactive prompt asking how to configure ESLint (Strict / Base / Cancel). In a non-TTY environment like this scheduled run, that prompt exits non-zero immediately — so we get a failure without ever linting any source.

Two additional notes from the same output:

- `next lint` is deprecated and will be removed in Next.js 16. The recommended migration is `npx @next/codemod@canary next-lint-to-eslint-cli .`.
- Until ESLint is configured (or the script is repointed at the ESLint CLI directly), this watchdog will keep flagging lint as broken even though the underlying code may be fine.

## Recommended fix

Run the codemod (or scaffold a config manually) so `npm run lint` actually exercises ESLint against the codebase:

```
npx @next/codemod@canary next-lint-to-eslint-cli .
```

Then re-run the watchdog to get a real lint signal.
