# AMPM Deployment and Configuration Guide

This guide is intentionally local-only. [deployment_guide.md](file:///E:/AMPM/deployment_guide.md) is ignored by Git (configured in [.gitignore](file:///E:/AMPM/.gitignore)) and must not be committed to source control because it contains deployment-specific credentials, URLs, and operational notes.

---

## Deployment Layout

- **Client**: Cloudflare Pages, located in [client/](file:///E:/AMPM/client).
- **API Server**: Fly.io application powered by [fly.server.toml](file:///E:/AMPM/fly.server.toml), code in [server/](file:///E:/AMPM/server).
- **Worker**: Fly.io application powered by [fly.worker.toml](file:///E:/AMPM/fly.worker.toml), code in [worker/](file:///E:/AMPM/worker).
- **PostgreSQL**: Neon Managed Database.
- **Redis / BullMQ**: Upstash Serverless Redis over TLS.
- **Object Storage**: Cloudflare R2 (S3-compatible API).

Always use separate production resources and credentials from development. **Never** place backend secrets, private API keys, or R2 credentials in Cloudflare Pages environment variables. The Vite build bundle exposes variables prefixed with `VITE_` directly in the browser.

---

## 1. Local Environment Setup (`.env`)

To start developing or running migrations locally, configure your `.env` file from the provided template [.env.example](file:///E:/AMPM/.env.example).

### Step 1.1: Copy the Template
Run the appropriate command in the project root to create your local `.env`:

- **Windows PowerShell**:
  ```powershell
  Copy-Item .env.example .env
  ```
- **macOS / Linux / Git Bash**:
  ```bash
  cp .env.example .env
  ```

### Step 1.2: Detailed Variable Configuration

Open your newly created `.env` file and configure the variables following the guidelines below:

#### Database Configuration
- **`POSTGRES_PASSWORD`**:
  - **Purpose**: Defines the PostgreSQL password for the local Docker database container.
  - **Action**: Change the default value to a strong, random password (e.g., `ampm-super-secure-2026`).
- **`DATABASE_URL`**:
  - **Purpose**: The database connection string used by the API server and Prisma.
  - **Local Default**: `postgresql://ampm:${POSTGRES_PASSWORD}@localhost:5432/ampm?schema=public` (points to the container configured in [docker-compose.yml](file:///E:/AMPM/docker-compose.yml)).
  - **Production (Neon)**: Set this to the Neon connection string with connection pooling (usually ends with `-pooler` in the host). **Important**: Ensure `sslmode=require` and `schema=public` are present as query parameters.
    - Example: `postgresql://user:pass@ep-cool-snowflake-123456-pooler.us-east-2.aws.neon.tech/ampm?sslmode=require&schema=public`

#### Redis & Queue Configuration
- **`REDIS_URL`**:
  - **Purpose**: Connection string for BullMQ queue state and notification pub/sub.
  - **Local Default**: `redis://localhost:6379` (points to local Redis).
  - **Production (Upstash)**: Use the TLS-enabled connection string starting with `rediss://`.
    - Example: `rediss://default:your-upstash-password@your-db-name.upstash.io:6379`
- **`REDIS_HOST` & `REDIS_PORT`**:
  - **Purpose**: Fallback host/port variables if the runtime environment splits them.
  - **Local Default**: `localhost` and `6379`.
  - **Production**: Map to your Upstash host name and port (e.g., `your-db-name.upstash.io` and `6379`).

#### Authentication & JWT Settings
- **`JWT_SECRET`**:
  - **Purpose**: Cryptographic signature key for short-lived user Access Tokens.
  - **Action**: Generate a secure 256-bit random key. Do not leave it empty; the server will crash on startup if missing.
  - **Command**: Generate this using:
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
- **`JWT_REFRESH_SECRET`**:
  - **Purpose**: Cryptographic signature key for user Refresh Tokens.
  - **Action**: Generate a *different* secure key using the command above. Never reuse `JWT_SECRET`.
- **`JWT_EXPIRES_IN`**:
  - **Purpose**: Lifespan of access tokens.
  - **Default**: `15m` (15 minutes).
- **`JWT_REFRESH_EXPIRES_IN`**:
  - **Purpose**: Lifespan of refresh tokens.
  - **Default**: `7d` (7 days).

#### AI Engine Integrations
- **`GOOGLE_CLOUD_VISION_API_KEY`**:
  - **Purpose**: Google Cloud API Key for OCR and image safety/content moderation.
  - **How to Get**:
    1. Open [Google Cloud Console](https://console.cloud.google.com).
    2. Create or select your project.
    3. Search for **Cloud Vision API** in the API Library and click **Enable**.
    4. Navigate to **APIs & Services > Credentials**.
    5. Click **Create Credentials** -> **API key**.
    6. Copy the key and optionally restrict it to the Vision API.
- **`HUGGINGFACE_API_TOKEN`**:
  - **Purpose**: API token for the Hugging Face Inference API to generate image captions.
  - **How to Get**:
    1. Log in to your [Hugging Face Settings > Tokens](https://huggingface.co/settings/tokens).
    2. Click **New Token**.
    3. Choose role **Read** and name it `ampm-deployment`.
    4. Copy the resulting token.

#### Clerk Integration (Used for production client/server authentication)
- **`CLERK_SECRET_KEY`**:
  - **Purpose**: Server-side secret key to verify Clerk JWTs in [server/src/auth/clerk-auth.ts](file:///E:/AMPM/server/src/auth/clerk-auth.ts).
  - **How to Get**: Create an application on the [Clerk Dashboard](https://dashboard.clerk.com). Go to **API Keys** and copy the **Secret Key** (starts with `sk_`).
- **`VITE_CLERK_PUBLISHABLE_KEY`**:
  - **Purpose**: Client-side public key to initialize Clerk.
  - **How to Get**: Copy the **Publishable Key** (starts with `pk_`) from the Clerk API Keys screen.

#### Cloudflare R2 Storage
- **`R2_ACCOUNT_ID`**:
  - **Purpose**: Your Cloudflare R2 account identifier.
  - **How to Get**: Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/), navigate to **R2 Object Storage** in the sidebar, and locate the **Account ID** under the summary section.
- **`R2_ACCESS_KEY_ID` & `R2_SECRET_ACCESS_KEY`**:
  - **Purpose**: S3-compatible credentials used to write and read images from R2.
  - **How to Get**:
    1. In the R2 page of the Cloudflare Dashboard, click **Manage R2 API Tokens** (on the right).
    2. Click **Create API token**.
    3. Set name to `ampm-deploy`, select **Object Read & Write** permissions.
    4. Click **Create API Token** and copy both credentials immediately.
- **`R2_BUCKET_NAME`**:
  - **Purpose**: The targeted R2 bucket name.
  - **Action**: Create a bucket in the Cloudflare R2 portal (e.g. `ampm-uploads-prod`) and place the name here.

#### General System Configuration
- **`MAX_FILE_SIZE_MB`**: Limits maximum upload size (e.g. `5`).
- **`MAX_RETRIES`**: Retries for worker image processing (e.g. `3`).
- **`RETRY_DELAY_MS`**: Backoff delay between worker retries (e.g. `5000`).
- **`PORT`**: Express server port (defaults to `3001` locally).
- **`CLIENT_URL`**: Allowed origin for CORS. Must match the client URL (e.g., `http://localhost:5173` locally, or `https://<your-project>.pages.dev` in production).
- **`VITE_API_URL`**: Root route of the Express API. Use `/api` locally for Vite proxy routing, or the deployed API gateway URL `https://<ampm-api>.fly.dev/api` in production.

---

## 2. Managed Services Setup

### 2.1 Neon (PostgreSQL)
1. Sign up on [Neon](https://neon.tech) and create a project.
2. In the console, retrieve the connection URL.
3. Make sure to retrieve both:
   - **Pooled connection string**: Use for runtime queries (`DATABASE_URL`). Add `&sslmode=require` if not automatically present.
   - **Direct connection string**: If Neon provides a separate unpooled direct database connection string, use it as `DIRECT_DATABASE_URL` (necessary for running Prisma migrations on Fly.io).

### 2.2 Upstash (Redis)
1. Sign up on [Upstash](https://upstash.com) and create a new serverless Redis database.
2. Enable TLS (default in Upstash).
3. Copy the Node.js/generic connection string (starts with `rediss://`).

### 2.3 Cloudflare R2
1. Create a bucket in Cloudflare R2 (e.g., `ampm-uploads-production`).
2. Generate read/write credentials as detailed in **Section 1.2**.
3. (Optional) Set up CORS policies on your bucket if you allow direct client-side uploads later, though current uploads route through the server.

---

## 3. Fly.io API and Worker Deployment

Ensure you have installed the `flyctl` CLI tool and run `fly auth login` before running deployment commands.

### Step 3.1: Create Fly.io Applications
From the project root, create your two applications:
```powershell
fly apps create ampm-api
fly apps create ampm-worker
```
*(If you want to use different names, update the `app` value in [fly.server.toml](file:///E:/AMPM/fly.server.toml) and [fly.worker.toml](file:///E:/AMPM/fly.worker.toml) to match).*

### Step 3.2: Configure secrets on Fly.io
Set the environment secrets for both applications using `fly secrets set`.

#### A. Set secrets for the API Server (`ampm-api`):
```powershell
fly secrets set --app ampm-api `
  DATABASE_URL="<neon-pooled-url>" `
  DIRECT_DATABASE_URL="<neon-direct-url>" `
  REDIS_URL="<upstash-rediss-url>" `
  JWT_SECRET="<your-generated-jwt-secret>" `
  JWT_REFRESH_SECRET="<your-generated-jwt-refresh-secret>" `
  CLERK_SECRET_KEY="<clerk-secret-key>" `
  GOOGLE_CLOUD_VISION_API_KEY="<google-vision-api-key>" `
  HUGGINGFACE_API_TOKEN="<huggingface-token>" `
  R2_ACCOUNT_ID="<cloudflare-account-id>" `
  R2_ACCESS_KEY_ID="<r2-access-key-id>" `
  R2_SECRET_ACCESS_KEY="<r2-secret-access-key>" `
  R2_BUCKET_NAME="<r2-bucket-name>" `
  CLIENT_URL="https://<pages-project>.pages.dev" `
  MAX_FILE_SIZE_MB="5" `
  MAX_RETRIES="3" `
  RETRY_DELAY_MS="5000"
```

#### B. Set secrets for the Background Worker (`ampm-worker`):
The worker requires database, Redis, storage, and AI engine keys, but does not need JWT or Clerk secrets (as authentication is handled at the gateway):
```powershell
fly secrets set --app ampm-worker `
  DATABASE_URL="<neon-pooled-url>" `
  REDIS_URL="<upstash-rediss-url>" `
  GOOGLE_CLOUD_VISION_API_KEY="<google-vision-api-key>" `
  HUGGINGFACE_API_TOKEN="<huggingface-token>" `
  R2_ACCOUNT_ID="<cloudflare-account-id>" `
  R2_ACCESS_KEY_ID="<r2-access-key-id>" `
  R2_SECRET_ACCESS_KEY="<r2-secret-access-key>" `
  R2_BUCKET_NAME="<r2-bucket-name>" `
  MAX_FILE_SIZE_MB="5" `
  MAX_RETRIES="3" `
  RETRY_DELAY_MS="5000"
```

### Step 3.3: Run Fly.io Deployments
Execute deployment commands from the project root:

1. **Deploy API Server**:
   ```powershell
   fly deploy --config fly.server.toml .
   ```
   *Note: The server build runs `prisma migrate deploy` automatically using the `DIRECT_DATABASE_URL` before startup.*

2. **Deploy Worker**:
   ```powershell
   fly deploy --config fly.worker.toml .
   ```
   *Ensure the worker process count has at least one active machine:*
   ```powershell
   fly scale count 1 --app ampm-worker
   ```

3. **Check Deployments**:
   Verify everything is green and running:
   ```powershell
   fly status --app ampm-api
   fly logs --app ampm-api
   fly status --app ampm-worker
   fly logs --app ampm-worker
   ```

---

## 4. Configure Clerk Authentication

1. Go to the [Clerk Dashboard](https://dashboard.clerk.com).
2. Choose your production application and select **Paths / Redirects**.
3. Set the Allowed Redirect URI to handle production sign-ins:
   ```text
   https://<your-pages-project>.pages.dev/sso-callback
   ```
4. Verify you have transferred your production API Keys (`CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY`) to their respective Fly.io and Cloudflare settings.

---

## 5. Client Deployment (Cloudflare Pages)

1. Sign in to your Cloudflare Dashboard and navigate to **Workers & Pages**.
2. Click **Create application** -> **Pages** -> **Connect to Git**.
3. Select your repository and configure the build environment:
   - **Project Name**: Choose your preferred name (this determines your `<pages-project>.pages.dev` URL).
   - **Production Branch**: `main`
   - **Framework Preset**: None (or choose Vite if available).
   - **Root directory**: `client`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Add the following **Environment Variables** in the Pages project setup (under Settings -> Variables after creating the project, or during initialization):
   - `VITE_CLERK_PUBLISHABLE_KEY`: `<your-clerk-publishable-key>`
   - `VITE_API_URL`: `https://ampm-api.fly.dev/api` (use your actual Fly API application URL).
5. Click **Save and Deploy**.
6. **Post-Deployment Alignment**: Once Cloudflare allocates your Pages URL (e.g., `https://ampm-production.pages.dev`), update your API Server's `CLIENT_URL` secret on Fly.io to enforce correct CORS restrictions:
   ```powershell
   fly secrets set --app ampm-api CLIENT_URL="https://<pages-project>.pages.dev"
   ```

---

## 6. End-to-End Verification

Follow these verification checks to ensure the stack is healthy:

1. **Verify API Health Check**:
   Open a browser or run a curl request against your API's health endpoint:
   `https://<ampm-api>.fly.dev/api/health`
   Verify it returns: `{"status": "ok"}`
2. **Access Client Interface**:
   Go to `https://<pages-project>.pages.dev/` and verify the Clerk authentication interface loads correctly.
3. **Register/Login**:
   Complete the sign-in flow and authenticate.
4. **Media Upload Test**:
   Upload a supported image (under 5MB).
5. **Verify Database and Storage write**:
   Confirm that the file is uploaded to your Cloudflare R2 bucket and a database record is created.
6. **Pipeline Verification**:
   Inspect the worker logs using `fly logs --app ampm-worker` to check if BullMQ successfully received the job, initiated the Hugging Face captioning model, processed safety restrictions via Google Cloud Vision API, and marked the job status as successful.
7. **Client Feedback**:
   Confirm that the user interface updates with the generated caption, tags, and safety categorization notifications.
