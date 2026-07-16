# AMPM Deployment and Configuration Guide

This guide details how to configure the local environment and deploy the **AMPM** service to production using Neon (PostgreSQL), Upstash (Redis), Cloudflare R2 (Storage), Cloudflare Pages (Client), and Fly.io (API and Worker).

---

## Production Deployment Layout

- **Client**: Cloudflare Pages, located in [client/](file:///E:/AMPM/client).
- **API Server**: Fly.io application powered by [fly.server.toml](file:///E:/AMPM/fly.server.toml), code in [server/](file:///E:/AMPM/server).
- **Worker**: Fly.io application powered by [fly.worker.toml](file:///E:/AMPM/fly.worker.toml), code in [worker/](file:///E:/AMPM/worker).
- **PostgreSQL**: Neon Managed Database.
- **Redis / BullMQ**: Upstash Serverless Redis over TLS.
- **Object Storage**: Cloudflare R2 (S3-compatible API).

---

## 1. Environment Configuration (`.env`)

Configure your local `.env` file based on [.env.example](file:///E:/AMPM/.env.example). 

### Setup Commands
- **Windows**: `Copy-Item .env.example .env`
- **macOS/Linux**: `cp .env.example .env`

### Core Environment Variables

| Variable | Scope | Description |
|---|---|---|
| `DATABASE_URL` | API & Worker | Database connection string. Use Neon's pooled connection for production (with `sslmode=require`). |
| `DIRECT_DATABASE_URL` | API | Neon's unpooled direct connection string, required for running migrations. |
| `REDIS_URL` | API & Worker | Connection URL. For production, use Upstash's secure TLS URL (`rediss://...`). |
| `JWT_SECRET` | API | Random 32-byte hex string for signing Access Tokens. |
| `JWT_REFRESH_SECRET` | API | Random 32-byte hex string for signing Refresh Tokens. |
| `GOOGLE_CLOUD_VISION_API_KEY` | Worker | Google Vision API key with Vision API enabled. |
| `HUGGINGFACE_API_TOKEN` | Worker | Hugging Face read access token. |
| `GOOGLE_CLIENT_ID` | API | Google OAuth client ID (from Google Cloud Console). |
| `GOOGLE_CLIENT_SECRET` | API | Google OAuth client secret (from Google Cloud Console). |
| `VITE_GOOGLE_CLIENT_ID` | Client | Google OAuth client ID exposed to the browser. |
| `R2_ACCOUNT_ID` | API & Worker | Cloudflare Account ID. |
| `R2_ACCESS_KEY_ID` | API & Worker | Cloudflare R2 API token Access Key. |
| `R2_SECRET_ACCESS_KEY` | API & Worker | Cloudflare R2 API token Secret Access Key. |
| `R2_BUCKET_NAME` | API & Worker | Targeted Cloudflare R2 bucket name. |
| `CLIENT_URL` | API | The origin URL of the Client (e.g. `https://<pages-project>.pages.dev`). |
| `VITE_API_URL` | Client | The base URL of the API gateway (e.g. `https://ampm-api.fly.dev/api`). |

---

## 2. Infrastructure Setup

### 2.1 Database & Redis
1. **Neon (PostgreSQL)**: Create a Neon project, copy the connection string, and note both the pooled (`DATABASE_URL`) and direct (`DIRECT_DATABASE_URL`) connection strings.
2. **Upstash (Redis)**: Create a Serverless Redis instance, enable TLS, and copy the `rediss://` URL.

### 2.2 Cloudflare R2 Storage
1. Create a bucket (e.g. `ampm-uploads-production`).
2. Go to **R2 > Manage R2 API Tokens**, create a token with **Object Read & Write** permissions, and copy the Access Key ID and Secret Access Key.

---

## 3. Fly.io API and Worker Deployment

Ensure the `flyctl` CLI is installed and you are logged in (`fly auth login`).

### Step 3.1: Create Applications
```powershell
fly apps create ampm-api
fly apps create ampm-worker
```

### Step 3.2: Configure Secrets
Set the production secrets for both apps:

```powershell
# Set secrets for the API Server (ampm-api)
fly secrets set --app ampm-api `
  DATABASE_URL="<neon-pooled-url>" `
  DIRECT_DATABASE_URL="<neon-direct-url>" `
  REDIS_URL="<upstash-rediss-url>" `
  JWT_SECRET="<jwt-secret>" `
  JWT_REFRESH_SECRET="<jwt-refresh-secret>" `
  GOOGLE_CLOUD_VISION_API_KEY="<google-vision-api-key>" `
  HUGGINGFACE_API_TOKEN="<huggingface-token>" `
  GOOGLE_CLIENT_ID="<google-client-id>" `
  GOOGLE_CLIENT_SECRET="<google-client-secret>" `
  R2_ACCOUNT_ID="<cloudflare-account-id>" `
  R2_ACCESS_KEY_ID="<r2-access-key-id>" `
  R2_SECRET_ACCESS_KEY="<r2-secret-access-key>" `
  R2_BUCKET_NAME="<r2-bucket-name>" `
  CLIENT_URL="https://<pages-project>.pages.dev"

# Set secrets for the Background Worker (ampm-worker)
fly secrets set --app ampm-worker `
  DATABASE_URL="<neon-pooled-url>" `
  REDIS_URL="<upstash-rediss-url>" `
  GOOGLE_CLOUD_VISION_API_KEY="<google-vision-api-key>" `
  HUGGINGFACE_API_TOKEN="<huggingface-token>" `
  R2_ACCOUNT_ID="<cloudflare-account-id>" `
  R2_ACCESS_KEY_ID="<r2-access-key-id>" `
  R2_SECRET_ACCESS_KEY="<r2-secret-access-key>" `
  R2_BUCKET_NAME="<r2-bucket-name>"
```

### Step 3.3: Deploy Services
1. **Deploy API Server**:
   ```powershell
   fly deploy --config fly.server.toml .
   ```
   *(Note: The server build runs `prisma migrate deploy` automatically before startup).*
2. **Deploy Worker**:
   ```powershell
   fly deploy --config fly.worker.toml .
   ```
3. **Scale Worker**: Ensure at least one worker machine is active.
   ```powershell
   fly scale count 1 --app ampm-worker
   ```

---

## 4. Client Deployment (Cloudflare Pages)

1. Navigate to **Workers & Pages > Create application > Pages > Connect to Git** in the Cloudflare Dashboard.
2. Select the repository and configure the build settings:
   - **Root directory**: `client`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Under **Environment Variables**, define:
   - `VITE_API_URL`: `https://ampm-api.fly.dev/api`
   - `VITE_GOOGLE_CLIENT_ID`: `<your-google-client-id>`
4. Deploy the application.
5. Update the `CLIENT_URL` secret on the API Server to point to the allocated production Pages domain:
   ```powershell
   fly secrets set --app ampm-api CLIENT_URL="https://<pages-project>.pages.dev"
   ```

---

## 5. End-to-End Verification

1. **API Health**: Request `https://ampm-api.fly.dev/api/health` and verify it returns `{"status": "ok"}`.
2. **Authentication**: Navigate to your client URL, verify the Google OAuth button and login page load, and log in.
3. **Media Processing**: Upload an image. Verify the file writes to R2, database jobs are created, the worker picks up the job via BullMQ, and the client displays the caption, tags, and safety categorization notifications once processing completes.
