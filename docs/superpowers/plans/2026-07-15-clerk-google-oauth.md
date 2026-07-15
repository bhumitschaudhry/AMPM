# Clerk Google OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or **superpowers:executing-plans** to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google sign-in through Clerk while exchanging the verified Clerk session for the existing AMPM JWT pair.

**Architecture:** Clerk owns the Google OAuth flow in the browser. The callback sends a Clerk session token to `POST /api/auth/clerk`; the API verifies it, creates or finds an AMPM user, and issues the existing access/refresh tokens. Existing password auth, JWT middleware, refresh rotation, logout, and protected routes remain unchanged.

**Tech Stack:** React 19, React Router 7, Vite, `@clerk/react`, Express, Prisma/PostgreSQL, `@clerk/backend`, Vitest, TypeScript.

## Global Constraints

- Google/Clerk users are OAuth-only; do not add password creation or recovery for them.
- Existing local email/password users and AMPM JWT sessions must continue to work unchanged.
- Do not automatically link a Clerk identity to an existing local-password account with the same email; return a conflict instead.
- Never log Clerk tokens, AMPM tokens, passwords, or other credential material.
- Do not replace AMPM JWT verification with Clerk verification across the API.
- Every new production function must have a focused test, and each new test must be observed failing before implementation.

---

### Task 1: Add Clerk dependencies and configuration surfaces

**Files:**
- Modify: `client/package.json`, `client/package-lock.json`
- Modify: `server/package.json`, `server/package-lock.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `client/Dockerfile` if its Vite build needs an explicit key argument

**Interfaces:**
- Produces `VITE_CLERK_PUBLISHABLE_KEY` for the browser and `CLERK_SECRET_KEY` for the API.

- [ ] **Step 1: Add dependencies.**

Run:

```powershell
Set-Location client
npm install @clerk/react
Set-Location ../server
npm install @clerk/backend
Set-Location ..
```

Expected: both manifests and lockfiles contain the new direct dependency and no unrelated package.

- [ ] **Step 2: Add environment variables.**

Add to `.env.example`:

```dotenv
# Clerk Google OAuth
CLERK_SECRET_KEY=
VITE_CLERK_PUBLISHABLE_KEY=
```

Add `CLERK_SECRET_KEY: \${CLERK_SECRET_KEY}` to the server environment in `docker-compose.yml`. Inspect `client/Dockerfile`; if Vite builds inside Docker without inheriting the host environment, add a build argument and pass `VITE_CLERK_PUBLISHABLE_KEY` through the client build configuration.

- [ ] **Step 3: Verify configuration changes.**

Run:

```powershell
git diff --check
Get-Content client/package.json, server/package.json | Select-String '@clerk/'
```

Expected: no whitespace errors and both Clerk packages are listed once.

- [ ] **Step 4: Commit.**

```powershell
git add client/package.json client/package-lock.json server/package.json server/package-lock.json .env.example docker-compose.yml client/Dockerfile
git commit -m "build: add Clerk OAuth dependencies"
```

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

### Task 3: Implement the Clerk token exchange on the server

**Files:**
- Create: `server/src/auth/clerk-auth.ts`
- Modify: `server/src/routes/auth-routes.ts`
- Modify: `server/src/__tests__/auth-routes.test.ts`
- Modify: `server/src/__tests__/auth-flow.test.ts`

**Interfaces:**
- `verifyClerkSessionToken(token: string): Promise<{ userId: string; email: string }>` verifies a Clerk token and returns only the verified identity fields.
- `POST /api/auth/clerk` returns `{ accessToken: string; refreshToken: string; user: { id: string; email: string } }`.

- [ ] **Step 1: Write failing tests.**

Mock `@clerk/backend` at the module boundary and extend the Prisma test doubles. Add tests named:

```typescript
it('registers POST /clerk')
it('rejects a missing Clerk bearer token with 401')
it('rejects an invalid Clerk token with 401')
it('creates an OAuth-only user from a verified Clerk identity')
it('returns the existing user for a known Clerk identity')
it('rejects a verified email that belongs to a password account with 409')
it('rejects local login for an OAuth-only user')
```

For creation, assert Prisma receives `email`, `clerkUserId`, and `passwordHash: null`, and assert both returned tokens are strings. For an OAuth-only local login, return `passwordHash: null` and assert the generic `Invalid email or password.` response.

- [ ] **Step 2: Run focused tests and verify RED.**

```powershell
Set-Location server
npm test -- src/__tests__/auth-routes.test.ts src/__tests__/auth-flow.test.ts
```

Expected: the new tests fail because the route, verifier, and nullable-password handling do not exist. Fix test setup errors until failures are feature failures.

- [ ] **Step 3: Implement the verifier.**

In `server/src/auth/clerk-auth.ts`, import `verifyToken` from `@clerk/backend`. Require `CLERK_SECRET_KEY`, call:

```typescript
const claims = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
```

Read `claims.sub` as the Clerk user ID. Use the verified email claim when present; otherwise use `createClerkClient({ secretKey })` to retrieve the user and select its verified primary email. Reject missing or unverified email with an actionable 400 error. Return only `{ userId, email }`.

- [ ] **Step 4: Implement the exchange route.**

Add `POST /clerk` without `authenticateToken`. Read a Bearer token, verify it, then apply:

```typescript
const byClerkId = await prisma.user.findUnique({ where: { clerkUserId: identity.userId } });
if (byClerkId) return issueTokens(byClerkId);

const byEmail = await prisma.user.findUnique({ where: { email: identity.email } });
if (byEmail?.passwordHash) {
  throw createHttpError(409, 'An AMPM account already exists for this email. Sign in with email and password.');
}
if (byEmail) {
  throw createHttpError(409, 'This email is already linked to another account.');
}

const user = await prisma.user.create({
  data: { email: identity.email, clerkUserId: identity.userId, passwordHash: null },
});
return issueTokens(user);
```

Reuse the existing token-generation function so claims, expiry, and token versions match local auth. Update `/login` to return the generic invalid-credentials error when `passwordHash` is null instead of passing null to bcrypt.

- [ ] **Step 5: Run focused tests and verify GREEN.**

```powershell
npm test -- src/__tests__/auth-routes.test.ts src/__tests__/auth-flow.test.ts
```

Expected: all focused auth tests pass with no unhandled warnings.

- [ ] **Step 6: Commit.**

```powershell
git add server/src/auth/clerk-auth.ts server/src/routes/auth-routes.ts server/src/__tests__/auth-routes.test.ts server/src/__tests__/auth-flow.test.ts
git commit -m "feat: exchange Clerk sessions for AMPM tokens"
```

### Task 4: Add the Clerk browser provider and Google redirect flow

**Files:**
- Modify: `client/src/main.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/LoginPage.tsx`
- Create: `client/src/pages/ClerkCallbackPage.tsx`
- Modify: `client/src/pages/LoginPage.test.tsx`
- Create: `client/src/pages/ClerkCallbackPage.test.tsx`

**Interfaces:**
- `ClerkCallbackPage` completes Clerk's redirect, calls `getToken()`, exchanges it with `/auth/clerk`, stores AMPM tokens, and navigates to `/`.
- Login keeps the existing form and adds a `Continue with Google` button.

- [ ] **Step 1: Write failing client tests.**

Mock `@clerk/react` hooks/components and the API module. Add:

```typescript
it('renders Google sign-in alongside the password form')
it('exchanges the Clerk token and stores AMPM tokens after callback completion')
it('shows the exchange error when callback authentication fails')
```

The callback test should make `useAuth()` return `{ isLoaded: true, isSignedIn: true, getToken: async () => 'clerk-session' }`, resolve `api.post('/auth/clerk')`, and assert both localStorage keys and navigation to `/`.

- [ ] **Step 2: Run client tests and verify RED.**

```powershell
Set-Location client
npm test -- src/pages/LoginPage.test.tsx src/pages/ClerkCallbackPage.test.tsx
```

Expected: the new tests fail because the provider, route, and callback page do not exist.

- [ ] **Step 3: Add the provider.**

In `client/src/main.tsx`, wrap the existing router with `ClerkProvider` from `@clerk/react` when `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` is present. Without the key, render the existing app without a provider so local auth remains usable.

- [ ] **Step 4: Add Google sign-in and callback.**

On `LoginPage`, use `useSignIn()` and call:

```typescript
await signIn.authenticateWithRedirect({
  strategy: 'oauth_google',
  redirectUrl: '/sso-callback',
  redirectUrlComplete: '/sso-callback',
});
```

Render a disabled Google button and explanatory text when the publishable key is absent. Show redirect-initiation errors in the existing banner.

Create `ClerkCallbackPage` using `AuthenticateWithRedirectCallback` and `useAuth`. Once `isLoaded && isSignedIn`, call `getToken()`; reject null with `Could not complete Google sign-in. Please try again.`; post the token as `Authorization: Bearer <token>` to `/auth/clerk`; store the returned AMPM tokens; navigate to `/`. Render a loading message while Clerk completes the redirect.

Register:

```tsx
<Route path="/sso-callback" element={<ClerkCallbackPage />} />
```

- [ ] **Step 5: Run client tests and verify GREEN.**

```powershell
npm test -- src/pages/LoginPage.test.tsx src/pages/ClerkCallbackPage.test.tsx
```

Expected: all focused client tests pass.

- [ ] **Step 6: Commit.**

```powershell
git add client/src/main.tsx client/src/App.tsx client/src/pages/LoginPage.tsx client/src/pages/ClerkCallbackPage.tsx client/src/pages/LoginPage.test.tsx client/src/pages/ClerkCallbackPage.test.tsx
git commit -m "feat: add Clerk Google sign-in flow"
```

### Task 5: Document setup and run full verification

**Files:**
- Modify: `README.md`
- Modify: `client/Dockerfile` and `docker-compose.yml` if Task 1 required the Vite build argument

**Interfaces:**
- Developers can configure Clerk and Google locally without needing undocumented steps.

- [ ] **Step 1: Document setup.**

Add to `README.md`:

1. Create a Clerk application.
2. Enable Google under social connections.
3. Set `CLERK_SECRET_KEY` for the API and `VITE_CLERK_PUBLISHABLE_KEY` for the client.
4. Register `http://localhost:5173/sso-callback` as the redirect URL in Clerk.
5. Run the migration before starting the server.
6. Google emails already used by local accounts must use local login; the app does not silently link them.

Update the authentication description and API table with `POST /api/auth/clerk`.

- [ ] **Step 2: Run all tests.**

```powershell
Set-Location server
npm test
Set-Location ../client
npm test
```

Expected: both commands exit 0 with zero failed tests.

- [ ] **Step 3: Run typechecks and builds.**

```powershell
Set-Location server
npm run typecheck
npm run build
Set-Location ../client
npm run typecheck
npm run build
```

Expected: all four commands exit 0.

- [ ] **Step 4: Inspect the final diff.**

```powershell
Set-Location ..
git diff main...HEAD --stat
git diff main...HEAD --check
git status --short --branch
```

Expected: only implementation commits are ahead of `main`; pre-existing user changes remain unstaged and uncommitted. Confirm no secrets, `node_modules`, or unrelated formatting changes are included.

- [ ] **Step 5: Commit documentation.**

```powershell
git add README.md client/Dockerfile docker-compose.yml
git commit -m "docs: document Clerk Google OAuth setup"
```

After this task, rerun the full verification commands before claiming completion, then use the finishing workflow to push as requested.

