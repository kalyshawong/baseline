# Build Watchdog — 2026-06-20

## Typecheck (`npx tsc --noEmit`)
**Clean.** Exit 0, no errors.

## Lint (`npm run lint` → `next lint`)
**Could not run — lint is not set up in this project.**

Not a code error. Two compounding issues:

1. **ESLint is not installed and not configured.** No `.eslintrc*` / `eslint.config.*` file exists, and `eslint` is not in `dependencies`/`devDependencies` (no `node_modules/.bin/eslint`). `next lint` therefore drops into its interactive "How would you like to configure ESLint?" prompt, which can't be answered in a non-interactive run, so it exits 1.
2. **`next lint` is deprecated** and will be removed in Next.js 16.

### Effect
The scheduled watchdog's lint pass is non-functional and will report a false failure every run. Only the typecheck half is actually doing anything.

### Suggested fix (one-time, by the user)
Migrate to the ESLint CLI per Next's guidance:

```
npx @next/codemod@canary next-lint-to-eslint-cli .
```

This installs ESLint + the Next plugin and writes a config, after which `npm run lint` runs non-interactively. Once that's done, the watchdog's lint step will work as intended.

(No code-level lint findings exist to report, because lint never executed.)
