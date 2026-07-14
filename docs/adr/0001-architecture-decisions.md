# ADR 0001: Architecture Decisions

Status: accepted
Date: 2026-07-14

## Context

The AMPM codebase is a PERN service split into `server`, `worker`, and `client`
packages with no shared workspace. The maintainability audit flagged several
deliberate trade-offs and areas of silent drift between the server and worker.
This record captures the decisions so the state does not drift back.

## Decisions

### 1. JWT refresh-token rotation + revocation (High security fix)
Refresh tokens are now **rotated on every use** and made **revocable** via a
`token_version` column on `User`. A refresh token embeds the version it was
issued under; `/refresh` rejects any token whose version no longer matches the
user's current version (e.g. after `/logout`). The server also **fails fast at
startup** if `JWT_SECRET` / `JWT_REFRESH_SECRET` are unset, and `docker-compose.yml`
no longer ships guessable default secrets.

Rationale: a long-lived refresh token in `localStorage` with no server-side
state is replayable after an XSS compromise. Rotation + versioned revocation
closes that gap without a separate token store.

### 2. Derived job status precedence (Medium correctness fix)
`deriveJobStatus` returns `processing` whenever any image is `PENDING`/`PROCESSING`,
even if another image has `FAILED`. The spec is self-contradictory for mixed
sets; the chosen precedence (in-flight images win over a sibling failure) is
now documented in the function's doc comment and asserted by tests. The
formerly-unreachable trailing `return "completed"` is retained only as a
defensive fallback with an explanatory comment.

### 3. Non-retryable failures must not be re-run (High fix)
The worker now calls `job.discard()` for `NON_RETRYABLE_FAILURE_REASONS`
(`INVALID_FILE`, `UNSUPPORTED_FORMAT`, `FILE_TOO_LARGE`) so BullMQ does not burn
AI-provider quota re-running inputs that can never succeed.

### 4. Job creation atomicity + enqueue safety (Medium fix)
`Job` + `Image` rows are written in a single Prisma transaction; if the
subsequent Redis enqueue fails, the DB writes are rolled back (job deleted,
cascading to images) so no orphaned `PENDING` images are left without a consumer.

### 5. Deferred: extract a shared `@ampm/shared` package (Medium)
Constants (`ALLOWED_MIME_TYPES`, `MAX_FILE_SIZE_*`), the `ImageJobData` type, and
the queue name are currently duplicated across `server` and `worker`. The
`MAX_FILE_SIZE_MB` env var now actually drives the limit in both, and the worker
validates the job payload shape at runtime (a renamed field fails loudly instead
of becoming `undefined`). A full shared package is deferred because it requires
introducing a workspace/build boundary across the three packages; until then the
worker `QUEUE_NAME` carries a comment pointing at `server/src/queue.ts`'s
`IMAGE_QUEUE_NAME` as the canonical value.
