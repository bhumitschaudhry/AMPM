# SPEC: AI-Powered Media Processing Microservice

## Objective
Build and deploy a microservice that accepts user-uploaded media files, processes them
asynchronously through an AI pipeline, and returns enriched results. The system should reflect
how real media processing pipelines and websites work, where results are made available
without blocking the user. This is the backend infrastructure for a content platform where users
upload images and the platform extracts structured metadata from them automatically.

## Context & Assumptions
Users of this platform upload images (photographs, screenshots, scanned documents). Once
uploaded, each file needs to be:
1. Stored durably
2. Queued for AI processing
3. Processed by a worker that calls an external AI endpoint
4. Enriched with the results and made queryable

The processing pipeline runs three sequential AI tasks on every image:

| Step | Task | What it produces |
|---|---|---|
| 1 | Image Captioning | A natural language description of the image |
| 2 | Object/Label Detection | A list of objects, concepts or labels detected |
| 3 | Content Safety Check | A flag indicating whether the image is safe, and a category if not |

You can use Google Cloud Vision API for label detection and content safety (SafeSearch), and
Hugging Face Inference API (model: `Salesforce/blip-image-captioning-base`) for image
captioning. Both have free tiers sufficient for this task. The point is not which model you pick —
more about how you design the pipeline around it.

---

## Requirements

### Authentication
- Users must be able to sign up and log in.
- All endpoints below must be authenticated. Unauthenticated requests must be rejected.
- Any auth strategy (JWT, session-based, OAuth) is acceptable, but the choice must be
  documented and justified.

### File Upload & Jobs
- **A job is a batch of one or more images.** A single upload action creates one job containing
  1..N images (each image is processed independently within that job).
- Accept image uploads in JPG, PNG, and WEBP formats only. Reject anything else with a clear
  error, per-file.
- Maximum file size: 5MB **per image**. Enforce this at the API layer, not just the frontend.
- On upload:
  - Assign the batch a unique **job ID**.
  - Assign each image within the batch a unique **image ID**, scoped to that job.
  - Store each file.
  - Create a job record with status `pending`, and a per-image record with status `pending`.
  - Enqueue each image for processing (independently, so one slow/failed image does not block
    the others in the same job).
  - Return the job ID (and per-image IDs) to the user immediately. Do not make the user wait for
    processing.
- **Job-level status** is derived from the status of its images (see Job & Image Status Model
  below).

### Job & Image Status Model
Each image within a job moves through:

`pending` → `processing` → `completed` | `failed`

A job's overall status is derived from its images' statuses:
- `pending`: all images pending
- `processing`: at least one image is pending or processing, none failed yet
- `completed`: all images completed successfully
- `failed`: at least one image failed and no images are still pending/processing
- `partially_completed`: processing has finished for all images, but some completed and some
  failed

### Failure Reasons
When an image's status is `failed`, the system must record a specific, user-visible reason.
Baseline taxonomy (extend as needed, but do not leave failures unclassified):

| Reason Code | Meaning |
|---|---|
| `INVALID_FILE` | File could not be read/decoded (corrupt or not actually an image despite passing the extension check) |
| `UNSUPPORTED_FORMAT` | Format not in JPG/PNG/WEBP (should normally be caught at upload, but retained for defense-in-depth) |
| `FILE_TOO_LARGE` | Exceeds 5MB limit (defense-in-depth; primary check is at upload) |
| `AI_PROVIDER_TIMEOUT` | Google Vision or Hugging Face call did not respond in time |
| `AI_PROVIDER_ERROR` | Google Vision or Hugging Face returned a non-timeout error (5xx, malformed response, etc.) |
| `AI_PROVIDER_RATE_LIMITED` | Google Vision or Hugging Face returned a rate-limit/quota error |
| `INTERNAL_ERROR` | Unhandled error in worker pipeline logic |
| `MAX_RETRIES_EXCEEDED` | Job was retried past the configured retry limit and still failed |

- The failure reason (code + human-readable message) must be stored on the image record and
  returned via the API so it can be shown on the frontend.
- Retry attempt count and last failure reason must be tracked per image.

### Frontend
A minimal UI where a user can:
- Sign up / log in.
- Upload one or more images as a single job.
- See a list of their jobs, each showing overall job status (`pending`, `processing`, `completed`,
  `partially_completed`, `failed`) and creation time.
- Click into a job and see, for every image in that job:
  - The image itself (or a thumbnail/reference).
  - Its individual status.
  - If completed: the caption, labels, and safety classification (including `flagged` state and
    category, if applicable).
  - If failed: the failure reason code and message.
- **Retry a failed image directly from the UI**, on a per-image basis, without needing any
  external tool (e.g., no manual API calls, no admin panel, no CLI). Retrying only reprocesses
  the failed image(s), not the entire job's already-completed images.
- **All results (captions, labels, safety classification, flags, failure reasons) must be visible
  in the frontend.** The API/DB storing this data is not sufficient on its own — it must be
  rendered in the UI.
- Job status updates must be reflected in the UI — either via polling or WebSockets. The
  approach is the implementer's choice, but must be documented.

### Flagged Content
- If the content safety step returns any result other than `SAFE` (i.e., Google Vision's
  SafeSearch returns `LIKELY` or `VERY_LIKELY` for any category), mark that image's result as
  `flagged: true` and store the flagged category.
- Flagged images must be surfaced distinctly in the job list / job detail view in the UI.
- Notify the user (in-app notification or email — implementer's choice) that their upload was
  flagged.

---

## Tech Stack

| Layer | Requirement |
|---|---|
| Application | MERN or PERN |
| Queue | Open-ended |
| Containerisation | Docker (mandatory). Kubernetes (bonus) |
| AI Endpoints | Google Cloud Vision API + Hugging Face Inference API (as specified above) |
| File Storage | Open-ended — local volume, S3, GCS, Cloudflare R2 |
| Auth | Open-ended — document your choice |
| CI/CD | Open-ended — document your choice |
| Cloud Platform | Open-ended |

A `docker-compose.yml` must be provided that spins up the full system locally: API service,
worker service, queue, and database. The reviewer must be able to run `docker-compose up` and
have a working system.

---

## Deliverables
1. GitHub repository with the full source code.
2. Deployed application URL — the full system must be deployed and accessible, not just
   runnable locally.
3. API collection — Postman collection or OpenAPI/Swagger spec covering all endpoints,
   including batch job creation, per-image status/results, and per-image retry.
4. `README.md` covering:
   - Architecture diagram (hand-drawn, Excalidraw, or any tool).
   - How to run locally.
   - Environment variables and how to obtain API keys.
   - Assumptions and decisions made where the spec was open-ended.
   - Known limitations or things you would do differently with more time.

---

## Evaluation Criteria
The requirements above are the baseline. What separates submissions is the quality of thinking
behind the implementation.

- **Requirements coverage** — does the system do what is specified, including batch jobs,
  per-image failure reasons, and frontend-only retry?
- **Architecture & design decisions** — Is the separation between API and worker
  well-reasoned? How are failures handled? How is state managed across services (especially
  job status derived from multiple image statuses)?
- **Code quality** — Is the code readable, consistently linted, and reasonably tested? Unit tests
  on the worker pipeline logic, retry behaviour, and job-status derivation are expected at
  minimum.
- **Documentation** — Are your choices explained? Could another engineer pick this up and
  extend it?
- **Bonus: Scalability** — How would this system behave under 10x load? Would adding more
  workers help? Are there bottlenecks? You don't need to solve these — articulate them.

**Time Limit:** 48 hours