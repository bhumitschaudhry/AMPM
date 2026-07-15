# Task 2 Report — Clerk Google OAuth plan

Date: 2026-07-15
Branch: `main`
Commit: `8b88a8d` — `feat: store Clerk identities on users`

## Scope owned

- Updated `server/prisma/schema.prisma`
- Added `server/prisma/migrations/20260715120000_add_clerk_identity/migration.sql`
- Did not modify auth runtime code
- Preserved unrelated working tree changes and prior Task 1 work

## Files changed

- `server/prisma/schema.prisma`
- `server/prisma/migrations/20260715120000_add_clerk_identity/migration.sql`

## Implementation summary

Updated the Prisma `User` model exactly per brief:

- `passwordHash` changed from required to nullable and kept mapped to `password_hash`
- `clerkUserId` added as nullable unique field mapped to `clerk_user_id`

Created the exact migration SQL from the brief:

```sql
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "clerk_user_id" TEXT;
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");
```

This is data-preserving and does not recreate or drop the `users` table.

## Commands run

### Read task brief

```powershell
Get-Content -Raw '.superpowers\sdd\task-2-brief.md'
```

### Inspect current state

```powershell
git status --short
Get-Content -Raw 'server\prisma\schema.prisma'
Get-Content -Raw 'server\package.json'
git log --oneline --decorate -n 10 -- server/prisma/schema.prisma server/prisma/migrations
```

### Verification commands from the brief

Run from `server`:

```powershell
npx prisma migrate deploy
```

Output:

```text
Prisma schema loaded from prisma\schema.prisma
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Environment variable not found: DATABASE_URL.
  -->  prisma\schema.prisma:7
   |
 6 |   provider = "postgresql"
 7 |   url      = env("DATABASE_URL")
   |

Validation Error Count: 1
[Context: getConfig]

Prisma CLI Version : 6.19.3
```

Result: could not deploy migration because no live database connection string was available in the environment.

```powershell
npx prisma generate
```

Output:

```text
Prisma schema loaded from prisma\schema.prisma

✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 237ms
```

Result: passed.

```powershell
npm run typecheck
```

Output:

```text
> ampm-server@1.0.0 typecheck
> tsc --noEmit
```

Result: passed with exit code 0.

### Commit

```powershell
git add server/prisma/schema.prisma server/prisma/migrations/20260715120000_add_clerk_identity/migration.sql
git commit -m "feat: store Clerk identities on users"
```

Output:

```text
[main 8b88a8d] feat: store Clerk identities on users
 2 files changed, 5 insertions(+), 1 deletion(-)
 create mode 100644 server/prisma/migrations/20260715120000_add_clerk_identity/migration.sql
```

## Verification summary

- Prisma migration SQL file matches the brief exactly
- Prisma client generation succeeded
- Server typecheck succeeded
- Live migration deployment could not be executed because `DATABASE_URL` was missing

## TDD evidence

This task was a schema-plus-migration change, not an auth runtime behavior change. I did not add tests because the brief explicitly scoped ownership to the Prisma `User` schema and exact migration only. Instead, verification was done through:

- exact migration SQL creation
- `npx prisma generate`
- `npm run typecheck`

No auth runtime code was changed.

## Self-review

- Scope check: only the requested Prisma schema and migration files were changed
- Data safety check: migration makes `password_hash` nullable and adds nullable `clerk_user_id`; it does not drop or recreate `users`
- Mapping check: existing email uniqueness, token fields, relations, and table/column mappings remained unchanged
- Boundary check: no auth route, middleware, Clerk runtime, or other application code was modified

## Concerns / limitations

1. `npx prisma migrate deploy` could not run because `DATABASE_URL` was not set in the current environment.
2. Git reported CRLF warnings for the touched Prisma files; no functional content issue was introduced, but line endings may be normalized by the user's git settings later.
3. The repository already had unrelated dirty/untracked changes before this task. They were intentionally left untouched.

---

## Task 2 review fix — nullable passwordHash login guard

Date: 2026-07-15

### Changed files for this fix

- `server/src/routes/auth-routes.ts`
- `server/src/__tests__/auth-flow.test.ts`

### Regression test evidence

Observed failure before the fix:

```text
❯ src/__tests__/auth-flow.test.ts (3 tests | 1 failed)
× login > returns the generic auth error for OAuth-only users without a password hash
  → expected 500 to be 401 // Object.is equality
```

Passed after the fix:

```text
npm test -- --run src/__tests__/auth-flow.test.ts src/__tests__/auth-routes.test.ts

Test Files  2 passed (2)
Tests       13 passed (13)
```

Typecheck evidence:

```text
npm run typecheck

> ampm-server@1.0.0 typecheck
> tsc --noEmit
```

### Notes

- Added the smallest safe null guard in `POST /login` so OAuth-only users now receive the existing generic `Invalid email or password.` response.
- Kept the Clerk route out of scope, as requested.
