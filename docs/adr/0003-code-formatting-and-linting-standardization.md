# 3. Standardize Code Formatting, Linting, and Git Commit Hooks

**Status:** Accepted
**Date:** 2026-07-22

## Context

The monorepo containing the client, server, and worker lacked centralized code formatting (Prettier/Biome) and pre-commit checks. In addition, each service (`client`, `server`, `worker`) duplicate-declared identical or nearly-identical ESLint configurations. This made it easy to commit poorly-formatted code and required rule updates to be copy-pasted across three configs.

We needed a system that:

1. Centrally manages developer-facing tools (Prettier, Biome, husky, lint-staged).
2. Standardizes formatting and lint rules across all files.
3. Automatically runs linting/formatting on staged files before commits.
4. Shares ESLint rules without breaking CI runs (where package-level dependency installation is isolated and root `node_modules` might not be populated).

## Decision

We decided to:

1. Create a root-level `package.json` containing only development-only tools (`prettier`, `@biomejs/biome`, `husky`, `lint-staged`). We did not configure npm workspaces to avoid altering package-lock.json files or breaking individual Docker configurations.
2. Create a shared `eslint.config.mjs` at the root exporting a `getBaseConfig` function. The package-level configs import this helper and pass their own local `@eslint/js` and `typescript-eslint` modules. This avoids importing any root dependencies, ensuring ESLint works locally or in CI without root packages installed.
3. Add `.prettierrc`, `.prettierignore`, and `biome.json` configurations at the root directory.
4. Set up `husky` and `lint-staged` configurations to format and lint staged files automatically on git commit.

## Alternatives Considered

- **Using npm workspaces / yarn workspaces:**
  - _Why not chosen:_ This would merge `package-lock.json` files and create symlinks. Doing so runs the risk of breaking existing Docker builds (which copy specific package files and lockfiles separately) and introduces significant risk to the deployment build process.
- **Importing dependencies in root `eslint.config.mjs`:**
  - _Why not chosen:_ If root ESLint config imported `@eslint/js` directly, running `eslint` inside a service in CI would fail unless `npm install` was also run at the root (since Node.js ESM imports resolve relative to the file on disk). By passing dependencies into a function, we avoid root imports entirely.

## Consequences

**This makes easier:**

- Standardizing and enforcing code quality and style automatically.
- Running formatting and lint checks on staged files only, reducing commit-time overhead.
- Updating lint rules monorepo-wide in a single root file.

**This makes harder, or forecloses:**

- Directly executing root ESLint commands without installing root packages first, though developers can still easily run package-specific commands (`npm run lint` or `--prefix`).

**Risks introduced:**

- Slight increase in hook execution time during commits, mitigated by targeting only staged files via `lint-staged`.
