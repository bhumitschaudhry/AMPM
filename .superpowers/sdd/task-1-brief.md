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

