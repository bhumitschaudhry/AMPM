# AMPM: AI-Powered Media Processing Microservice

AMPM is an asynchronous media processing service built on the PERN stack. It accepts user-uploaded media files, queues them in a distributed worker pipeline powered by BullMQ and Redis, and processes them concurrently through an AI pipeline.

---

## Key Features

- **Safety-First AI Pipeline**: Runs content safety audits (Google SafeSearch) and label detection (Google Vision) prior to image captioning (Hugging Face BLIP). Unsafe uploads bypass captioning to preserve quota.
- **Content Hash Deduplication**: Uses SHA-256 content indexing (`images.content_hash`) to instantly reuse metadata for duplicate image uploads per user, bypassing redundant queue and AI processing.
- **Resilient Processing**: Independent image queueing with automatic retries, exponential backoff, and dynamic DNS warm-up using BullMQ.
- **Security & Rate Limiting**: Hardened with Helmet HTTP headers, XSS payload sanitization, UUID route validation, 1MB JSON limits, and rate limiting on upload (10 req / 15 min) and retry endpoints (20 req / 15 min).
- **Secure Authentication**: Built-in email/password credentials and native Google OAuth (Google Sign-In) with access/refresh token rotation (RTR) and nullable password records.
- **Granular Control & Batch Retries**: View detailed processing reports per image, trigger individual failed-image retries, or re-enqueue all failed images in a job via batch retry directly from the UI.
- **SigNoz Monitoring & Token Analysis**: OpenTelemetry instrumentation exporting traces, metrics, and token analysis (AI model token usage, completion metrics, and JWT authentication token metrics) to SigNoz.

---

## Local Quick Start

To spin up the full stack locally (client, server, worker, database, queue, and OpenTelemetry collector) using Docker Compose, follow these steps:

### 1. Configure the Environment
Copy the example environment template to create your `.env` file:
```bash
cp .env.example .env
```
Open `.env` and fill in your external API keys:
- **Hugging Face Token** (from [Hugging Face Settings](https://huggingface.co/settings/tokens))
- **Google Cloud Vision API Key** & **Google Client ID** (from [Google Cloud Console](https://console.cloud.google.com/apis/credentials))

### 2. Run Database Migrations
Deploy the Prisma database schema inside the server container:
```bash
docker-compose run --rm server npx prisma migrate deploy
```

### 3. Start the Services
Build and start all services:
```bash
docker-compose up --build
```

Access the applications at:
- **React Client**: [http://localhost:5173](http://localhost:5173)
- **API Spec & Gateway**: [http://localhost:3001/api-docs](http://localhost:3001/api-docs)

---

## Project Documentation Index

For detailed guides, specifications, and reference manuals, please see:

- 📐 **[System Architecture](file:///E:/AMPM/architecture.md)**: Full architecture topology, deduplication workflow, worker pipeline order, and schema mappings.
- 📡 **[API Reference](file:///E:/AMPM/docs/api.md)**: Authentication protocols, rate limits, security middleware, endpoint mappings, and dynamic job status logic.
- 🚀 **[Deployment Guide](file:///E:/AMPM/deployment_guide.md)**: Deploying production resources (Neon, Upstash, Cloudflare R2, Cloudflare Pages, Fly.io, and SigNoz OTLP).
- 📝 **[Decisions & Limitations](file:///E:/AMPM/docs/limitations_and_assumptions.md)**: Key design decisions, core assumptions, and production scaling recommendations.
- 🪵 **[ADR 0001: Architecture Decisions](file:///E:/AMPM/docs/adr/0001-architecture-decisions.md)**: Architectural decisions and state drift prevention.
- 🛡️ **[ADR 0002: Error Handling & Safety](file:///E:/AMPM/docs/adr/0002-robust-error-handling-and-decoding-safety.md)**: Media pipeline error categorization and Sharp buffer validation.
- 🧪 **[Integration Testing](file:///E:/AMPM/docs/integration_testing.md)**: Testing patterns, mocking conventions, and OpenTelemetry instrumentation tests.

