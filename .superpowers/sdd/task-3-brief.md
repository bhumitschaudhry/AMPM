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

