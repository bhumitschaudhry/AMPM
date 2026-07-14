# AMPM: AI-Powered Media Processing Microservice

AMPM is an asynchronous media processing service built with the PERN (PostgreSQL, Express, React, Node) stack. It utilizes a distributed worker architecture powered by BullMQ and Redis to process uploaded images asynchronously through an AI pipeline, integrating Hugging Face and Google Cloud Vision API endpoints.

---

## Architecture

                    +-----------------------------+
                    |        React Client         |
                    | (SPA dark theme/responsive) |
                    +--------------+--------------+
                                   |
                                   | HTTP API Requests
                                   v
                    +--------------+--------------+
                    |    Express API Gateway      | <---> PostgreSQL (Users, Jobs, Images, Notifications)
                    +--------------+--------------+
                                   |
                                   | Enqueues tasks
                                   v
                    +--------------+--------------+
                    |     BullMQ Redis Queue      |
                    +--------------+--------------+
                                   |
                                   | Consumed by 3 concurrent workers
                                   v
                    +--------------+--------------+
                    |    Worker Pipeline Node     | <---> Local Media Storage (Volumed)
                    +-------+--------------+------+
                            |              |
           Hugging Face API |              | Google Cloud Vision API
           (Image Caption)  v              v (Label Detection & SafeSearch)
                      +-----+--+        +--+-----+
                      | BLIP   |        | Cloud  |
                      | Model  |        | Vision |
                      +--------+        +--------+

### Flow Breakdown
1. **Upload & Enqueue**: Users upload one or more images under a single Job transaction. The API server stores files in volumed local storage, writes records to PostgreSQL (in a `pending` state), enqueues image processing tasks to Redis, and returns the Job and Image IDs instantly.
2. **Asynchronous Execution**: A dedicated BullMQ Worker processes images concurrently, with a default limit of three concurrent jobs.
3. **AI Pipeline**:
   - **Step 1**: Converts the image to binary and calls Hugging Face's Salesforce BLIP Captioning model.
   - **Step 2**: Encodes the image to base64 and invokes Google Vision Label Detection.
   - **Step 3**: Invokes Google Vision SafeSearch Content Safety Check.
4. **Safety Flagging**: If any SafeSearch category returns `LIKELY` or `VERY_LIKELY`, the image is marked as flagged (`isFlagged: true`) and an in-app notification is sent to the user.
5. **UI Updates**: The client dashboard and detail views dynamically poll (every 3-5 seconds) to reflect status changes (`pending` -> `processing` -> `completed` / `failed`).
6. **Retry Mechanism**: Failed image processing tasks can be retried individually directly from the detail view.

---

## Tech Stack and Key Decisions

- **Database**: PostgreSQL (relational structure captures Job -> Images and User -> Notifications mappings).
- **ORM**: Prisma (provides type-safe schema, migrations, and relationships).
- **Job Queue**: BullMQ + Redis (provides concurrency limits, automated retries, rate limiting, and failure tracking).
- **Authentication**: JWT (Access + Refresh tokens). Refresh tokens are **rotated on every use** and are **revocable**: each user carries a `token_version` (in the DB); a refresh token embeds the version it was issued under, and `/refresh` rejects any token whose version no longer matches (e.g. after `/logout`). Secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`) are required at startup — the server refuses to boot without them.
- **Frontend Styling**: Vanilla CSS with a customized premium dark theme system (utilizing variables, transitions, and responsive grid layouts).
- **API Spec**: Served dynamically via Swagger UI at `/api-docs`.
- **CI/CD**: GitHub Actions runs each service's tests and production build on pushes and pull requests. Deployment is intentionally left to the target environment because no cloud credentials or target platform are included in this repository.

---

## How to Run Locally

### Prerequisites
- Docker and Docker Compose installed.
- **or** Node.js v20+, Redis, and PostgreSQL running locally.

### Environment Setup
Copy `.env.example` to `.env` in the root:
```bash
cp .env.example .env
```

#### Obtaining API Keys:
1. **Hugging Face API Token**:
   - Register at [Hugging Face](https://huggingface.co/).
   - Go to **Settings -> Access Tokens** and create a read token.
   - Set as `HUGGINGFACE_API_TOKEN`.
2. **Google Cloud Vision API Key**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/).
   - Create a project and enable the **Cloud Vision API**.
   - Create an API key in **APIs & Services -> Credentials**.
   - Set as `GOOGLE_CLOUD_VISION_API_KEY`.

### Running with Docker Compose (Recommended)
From the root directory:
```bash
docker-compose up --build
```
This spins up the database, Redis queue, API gateway, background worker, and React client.
- Frontend App: [http://localhost:5173](http://localhost:5173)
- API Gateway and Swagger Specs: [http://localhost:3001/api-docs](http://localhost:3001/api-docs)

---

## API Endpoints

Fully detailed in `/api-docs` Swagger UI:

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/signup` | No | Creates a user account and returns JWTs |
| `POST` | `/api/auth/login` | No | Logs in and returns tokens |
| `POST` | `/api/auth/refresh` | No | Rotates the refresh token and returns a new access + refresh token pair |
| `POST` | `/api/auth/logout` | Yes | Revokes the user's refresh tokens (server-side) |
| `GET`  | `/api/auth/me` | Yes | Retrieves current user |
| `POST` | `/api/jobs` | Yes | Uploads one or more images (multipart) |
| `GET`  | `/api/jobs` | Yes | Lists user's jobs with derived overall status |
| `GET`  | `/api/jobs/:jobId` | Yes | Retrieves job detail with all child images and AI data |
| `POST` | `/api/jobs/:jobId/images/:imageId/retry` | Yes | Retries processing a failed image |
| `GET`  | `/api/notifications` | Yes | Lists user alerts (including flagged image warnings) |
| `PATCH`| `/api/notifications/:id/read` | Yes | Marks an alert as read |

---

## Assumptions and Open-Ended Decisions

1. **Batch Job Model**: Grounded in the PDF, but extended with the MD's 1-to-N batch logic. Since a batch job has multiple images, a job's overall status is derived dynamically:
   - `pending`: all images pending
   - `processing`: at least one image is pending or processing, none failed yet
   - `completed`: all images completed successfully
   - `failed`: at least one image failed and no images are still pending/processing
   - `partially_completed`: processing has finished for all images, but some completed and some failed.
2. **Notifications**: Implemented as in-app notifications stored in the database. When an image safety check triggers a warning, a notification is inserted and instantly made visible in the UI header.
3. **Local Storage**: Images are stored in an `/uploads` folder mounted as a Docker volume. In production, this can be swapped with AWS S3 or GCP Cloud Storage.

---

## Production Scaling Suggestions

If traffic increases by 10x:
- **Worker Scaling**: Spin up multiple instances of the worker service. BullMQ handles horizontal scaling seamlessly; tasks are distributed automatically among available worker pods.
- **Redis Clustering**: Move Redis to a managed memory store (AWS ElastiCache / Redis Enterprise) to handle high-volume queue transactions.
- **S3 / CDN Integration**: Swap the local disk storage module with AWS S3, and serve images via CloudFront to reduce network strain on the API server.

## Known Limitations

- A deployed URL is not included because this repository has no cloud account, deployment target, or credentials. The included Compose configuration is the supported local deployment path.
- Uploaded images are stored on a Docker volume. Use object storage before running multiple API hosts or deploying to ephemeral infrastructure.
