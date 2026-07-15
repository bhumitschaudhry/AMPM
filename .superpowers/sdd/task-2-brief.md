### Task 2: Extend the user model for OAuth-only identities

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20260715120000_add_clerk_identity/migration.sql`

**Interfaces:**
- Prisma `User` exposes `clerkUserId: string | null` and `passwordHash: string | null`.

- [ ] **Step 1: Change the schema.**

Update `User`:

```prisma
passwordHash String? @map("password_hash")
clerkUserId  String? @unique @map("clerk_user_id")
```

Keep existing email uniqueness, token fields, relations, and mappings unchanged.

- [ ] **Step 2: Create and apply the migration.**

Run from `server` with the project database available:

```powershell
npx prisma migrate deploy
npx prisma generate
```

Before running the command, create `server/prisma/migrations/20260715120000_add_clerk_identity/migration.sql` with:

```sql
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "clerk_user_id" TEXT;
CREATE UNIQUE INDEX "users_clerk_user_id_key" ON "users"("clerk_user_id");
```

Expected: deployment makes `password_hash` nullable and adds a nullable unique `clerk_user_id` column without dropping existing data. Do not recreate or delete `users`.

- [ ] **Step 3: Verify the generated client.**

```powershell
npm run typecheck
```

Expected: the server typecheck passes after Prisma generation.

- [ ] **Step 4: Commit.**

```powershell
git add server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat: store Clerk identities on users"
```

