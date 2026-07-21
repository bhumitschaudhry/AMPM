# ADR 0001: Architecture Decisions

Status: accepted  
Date: 2026-07-14

## Context

The AMPM codebase is split into [client](file:///E:/AMPM/client), [server](file:///E:/AMPM/server), and [worker](file:///E:/AMPM/worker) packages without a shared workspace configuration. This log records key architectural decisions to prevent future state drift.

## Decisions

### 1. JWT Refresh Token Rotation & Revocation
- **Implementation**: Refresh tokens rotate on every use. Revocation is handled via a `token_version` column on the [User](file:///E:/AMPM/server/prisma/schema.prisma) model.
- **Validation**: Incoming requests to `/api/auth/refresh` verify if the token's embedded version matches the database version. On logout, the database `token_version` is incremented, instantly invalidating all existing refresh tokens.
- **Security**: The server fails fast at startup if security secrets (`JWT_SECRET` / `JWT_REFRESH_SECRET`) are missing.

### 2. Derived Job Status Precedence
- **Rule**: [deriveJobStatus](file:///E:/AMPM/server/src/constants.ts) prioritizes active states. It returns `processing` if any child image is `PENDING` or `PROCESSING`, even if another image has already failed.
- **Safety**: A defensive fallback returning `completed` is placed at the end of the status evaluation block.

### 3. Non-Retryable Failure Handling
- **Rule**: Non-retryable errors (`INVALID_FILE`, `UNSUPPORTED_FORMAT`, `FILE_TOO_LARGE`) do not undergo queue retries.
- **Implementation**: The worker invokes `job.discard()` immediately, saving API credit quota.

### 4. Atomic Job & Image Creation
- **Rule**: Database entries and queue operations must remain synchronized.
- **Implementation**: Job and image metadata are written in a single Prisma transaction. If queueing the task in Redis fails, the transaction is rolled back, deleting the job and preventing orphaned database records.

### 5. Deferred Code Sharing Refactor
- **Status**: Deferred extracting a shared package (e.g. `@ampm/shared`).
- **Workaround**: Types like [ImageJobData](file:///E:/AMPM/worker/src/process-image.ts) and constants like [ALLOWED_MIME_TYPES](file:///E:/AMPM/server/src/constants.ts) remain duplicated. We ensure alignment through strict runtime schema validation in the worker, and cross-reference the canonical queue name in [server/src/queue.ts](file:///E:/AMPM/server/src/queue.ts).

### 6. SHA-256 Image Content Deduplication
- **Implementation**: Uploaded image buffers are digested to SHA-256 (`content_hash`) and indexed in PostgreSQL (`images.content_hash`).
- **Optimization**: If an existing completed image with identical hash is found for the user, AI metadata is copied directly and marked `COMPLETED` immediately, bypassing queueing and external AI API costs.

### 7. Security Hardening & Input Defense
- **Implementation**: API Gateway enforces Helmet security headers, recursive XSS sanitization, UUID route parameter validation, and 1MB request body parsing limits.
- **Rate Limiting**: Protected endpoints enforce per-user rate limits (10 uploads / 15 min; 20 retries / 15 min) via `express-rate-limit`.

### 8. Safety-First AI Worker Pipeline Ordering
- **Pipeline Flow**: Google Cloud Vision SafeSearch and Label Detection run before Hugging Face BLIP image captioning.
- **Quota Protection**: If SafeSearch flags an upload as unsafe (`LIKELY` or `VERY_LIKELY`), caption generation is skipped to avoid sending unsafe material to third-party endpoints and to preserve AI token budget.

