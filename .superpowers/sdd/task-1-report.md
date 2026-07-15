# Task 1 Report — Clerk Google OAuth dependencies/config

## Status

Completed and committed.

## Commit

- `f59c8ef` — `build: add Clerk OAuth dependencies`

## Files changed

Committed:

- `client/package.json`
- `client/package-lock.json`
- `server/package.json`
- `server/package-lock.json`
- `.env.example`
- `docker-compose.yml` (only the Clerk hunks were staged; pre-existing local edits in this file were left unstaged)
- `client/Dockerfile`

Left untouched as unrelated local workspace changes:

- `.gitignore`
- `worker/Dockerfile`
- `.mimocode/`
- `.superpowers/`
- `architecture.md`

## What changed

- Added `@clerk/react` to the client dependencies.
- Added `@clerk/backend` to the server dependencies.
- Added Clerk env placeholders to `.env.example`:
  - `CLERK_SECRET_KEY=`
  - `VITE_CLERK_PUBLISHABLE_KEY=`
- Added `CLERK_SECRET_KEY: ${CLERK_SECRET_KEY}` to the server service in `docker-compose.yml`.
- Added a client Docker build arg/env bridge for `VITE_CLERK_PUBLISHABLE_KEY` in `client/Dockerfile`.
- Added the client build arg wiring in `docker-compose.yml`.

## Tests and exact results

- `npm install @clerk/react` in `client` — succeeded, added 6 packages, audited 206 packages, 0 vulnerabilities.
- `npm install @clerk/backend` in `server` — succeeded, added 9 packages, audited 302 packages, 2 high severity vulnerabilities reported by npm audit.
- `git diff --check` — passed with no whitespace errors; Git only warned that LF will be replaced by CRLF on next touch for existing files.
- `Get-Content client/package.json, server/package.json | Select-String '@clerk/'` — found both direct dependencies once:
  - `@clerk/react`
  - `@clerk/backend`
- `npm ls --depth=0 @clerk/react` — resolved `@clerk/react@6.12.3`.
- `npm ls --depth=0 @clerk/backend` — resolved `@clerk/backend@3.11.5`.

## TDD evidence

- Not applicable. This task was configuration/dependency wiring only; no code-path behavior was implemented.

## Self-review findings

- Confirmed the client image builds in an isolated Docker build stage, so a Vite build arg is required for the publishable key.
- Confirmed the server secret key is only surfaced on the server side, not in the client image.
- Confirmed the staged `docker-compose.yml` changes only contain the Clerk additions; unrelated pre-existing edits in that file remain unstaged.
- Confirmed both Clerk packages are present in the workspace manifests and lockfiles after installation.

## Concerns

- `npm install` on the server pruned stale lockfile entries unrelated to Clerk while regenerating `server/package-lock.json`. The live dependency checks passed, and the removed packages were not referenced by `server/package.json` or the codebase.
- There are still unrelated local changes in the working tree that were intentionally not touched.

## Review fix follow-up

I restored the pruned swagger lockfile subtree in `server/package-lock.json` so the file keeps both the Clerk additions and the unrelated swagger-jsdoc entries, without changing `server/package.json`.

Fix commit:

- `2144ed5` — `fix: restore swagger-jsdoc lockfile entries`

Commands run after the restore:

- `git diff --check`
- `git show HEAD:server/package-lock.json | rg -n '^        "@clerk/backend"|^        "swagger-jsdoc"|^        "@types/swagger-jsdoc"|^    "node_modules/@apidevtools/json-schema-ref-parser"|^    "node_modules/swagger-jsdoc"'`

Outputs:

- `git diff --check`
  - `warning: in the working copy of 'docker-compose.yml', LF will be replaced by CRLF the next time Git touches it`
  - `warning: in the working copy of 'server/package-lock.json', LF will be replaced by CRLF the next time Git touches it`
  - `warning: in the working copy of 'worker/Dockerfile', LF will be replaced by CRLF the next time Git touches it`
- `git show HEAD:server/package-lock.json | rg ...`
  - `20:        "@clerk/backend": "^3.11.5",`
  - `21:        "swagger-jsdoc": "^6.2.8",`
  - `31:        "@types/swagger-jsdoc": "^6.0.4",`
  - `39:    "node_modules/@apidevtools/json-schema-ref-parser": {`
  - `4252:    "node_modules/swagger-jsdoc": {`
