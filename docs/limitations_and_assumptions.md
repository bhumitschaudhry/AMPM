# Design Decisions, Assumptions, and Limitations

This document captures the core assumptions, key design decisions, and known limitations of the **AMPM** service.

---

## Core Assumptions

1. **File Types and Size**: The system assumes images are uploaded in JPEG, PNG, or WEBP formats only, and that each image is under 5MB. These limits are validated both at the API gateway layer (via Multer) and at the worker layer (via Sharp) for defense-in-depth.
2. **Independent Media Processing**: Within a multi-image upload job, each image is processed independently in the queue. A failure or delay in processing one image does not block other images in the same job.
3. **External API Dependencies**: The asynchronous workers rely on the Google Cloud Vision API and Hugging Face BLIP model. Any service interruptions or rate limits on these providers will affect pipeline execution, which is mitigated using BullMQ retry queues.

---

## Key Design Decisions

1. **Dynamic Job Status Derivation**: Rather than storing and updating a job status field in the database, the job's overall status is computed dynamically at runtime based on the statuses of its child images. This prevents out-of-sync states and ensures the UI always shows correct information.
2. **Refresh Token Rotation (RTR)**: The authentication layer rotates refresh tokens on every verification. A `token_version` counter is maintained on the user record in PostgreSQL to allow instant global logout/revocation of all active sessions.
3. **Database-Queue Cohesiveness**: Database records and queue operations are executed atomically. If the Redis queue enqueuing fails, the database transaction is rolled back to prevent orphaned database records.
4. **SHA-256 Content Hash Deduplication**: Uploaded image buffers are hashed to SHA-256 digests. If an indexed `content_hash` match exists for the user, processing results are copied immediately into the new record with `COMPLETED` status, bypassing BullMQ queueing and AI API calls. Re-checks inside Prisma transactions protect against concurrent upload race conditions and delete orphaned Cloudflare R2 uploads.
5. **Safety-First Pipeline Ordering**: Google SafeSearch runs first. Unsafe images stop the pipeline immediately (no label detection, no BLIP captioning), saving API credit quota and preventing unsafe content transmission to further providers. The user is notified in-app.
6. **Defense-in-Depth Security & Tiered Rate Limiting**: The server enforces Helmet security headers, recursive XSS payload sanitization, UUID route validation, 1MB payload caps, and tiered rate limits across auth (signup, login, google, refresh), upload, retry, and a global fallback (200 req / 15 min).
7. **OpenTelemetry & SigNoz Observability**: Built-in OpenTelemetry instrumentation exports traces, GenAI model token usage metrics (`gen_ai.usage.input_tokens`, `output_tokens`), JWT authentication metrics, and real-time BullMQ queue depth polling (`ampm.queue.depth`) to SigNoz.

---

## Known Limitations & Future Improvements

1. **Server-Mediated Uploads**: Currently, the API Gateway receives the full image file payload and writes it locally or to R2. For heavy production traffic, the system should transition to client-side direct-to-storage uploads using presigned S3/R2 URLs, bypassing the API Gateway.
2. **External API Rate Limits & Quotas**: Hugging Face and Google Cloud Vision rate limits can be triggered under heavy loads. Implementing fallback models or locally hosted AI inference engines (e.g., local BLIP/OCR containers) would improve reliability.
3. **WebSocket Status Updates**: The current frontend uses polling to fetch job status updates. Transitioning to WebSockets or Server-Sent Events (SSE) would reduce database queries and provide instant updates.
