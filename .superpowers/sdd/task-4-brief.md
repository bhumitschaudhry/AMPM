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

