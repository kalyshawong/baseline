# Build Watchdog — 2026-05-07

## Summary

- **Typecheck (`npx tsc --noEmit`):** clean (exit 0, no errors).
- **Lint (`npm run lint` → `next lint`):** could not run — ESLint is not configured in this repo, so `next lint` drops into an interactive setup prompt and never produces a pass/fail result.

## Lint blocker detail

`next lint` asks "How would you like to configure ESLint? Strict / Base / Cancel" and waits on stdin. In a non-interactive scheduled run, it just hangs at that prompt. There is no `.eslintrc*` or `eslint.config.*` file at the repo root, and `eslint` is not listed in `devDependencies` in `package.json`.

Also worth noting: Next.js prints a deprecation notice — *"`next lint` is deprecated and will be removed in Next.js 16. For new projects, use create-next-app to choose your preferred linter. For existing projects, migrate to the ESLint CLI: `npx @next/codemod@canary next-lint-to-eslint-cli .`"*

## Suggested fix

Pick one and the watchdog can run lint cleanly:

1. Run `npx @next/codemod@canary next-lint-to-eslint-cli .` to generate an ESLint config and switch the `lint` script to use the ESLint CLI directly.
2. Or run `npm run lint` once interactively, choose **Strict**, commit the resulting config, and the next scheduled run will work.

Until one of those happens, the lint half of this watchdog is effectively a no-op.
