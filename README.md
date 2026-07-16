# AMPM: AI-Powered Media Processing Microservice

AMPM is an asynchronous media processing service built on the PERN stack. It accepts user-uploaded media files, queues them in a distributed worker pipeline powered by BullMQ and Redis, and processes them concurrently through an AI pipeline.

---

## Key Features

- **Asynchronous AI Pipeline**: Runs image captioning (Hugging Face BLIP), label detection (Google Vision), and content safety audits (Google SafeSearch) on every image.
- **Resilient Processing**: Independent image queueing with automatic retries and exponential backoff using BullMQ.
- **Secure Authentication**: Built-in email/password credentials and native Google OAuth (Google Sign-In) with access/refresh token rotation.
- **Safety Flags & Alerts**: Automatically flags unsafe uploads and sends in-app notifications to users.
- **Granular Control**: View detailed processing reports per image and trigger individual failed-image retries directly from the UI.

---

## Local Quick Start

To spin up the full stack locally (client, server, worker, database, and queue) using Docker Compose, follow these steps:

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

- 📐 **[System Architecture](file:///E:/AMPM/architecture.md)**: Full architecture topology, processing workflows, and database schema mappings.
- 📡 **[API Reference](file:///E:/AMPM/docs/api.md)**: Authentication protocols, endpoint mappings, and dynamic job status logic.
- 🚀 **[Deployment Guide](file:///E:/AMPM/deployment_guide.md)**: Deploying production resources (Neon, Upstash, Cloudflare R2, Cloudflare Pages, and Fly.io).
- 📝 **[Decisions & Limitations](file:///E:/AMPM/docs/limitations_and_assumptions.md)**: Key design decisions, core assumptions, and production scaling recommendations.
- 🪵 **[ADR 0001: Architecture Decisions](file:///E:/AMPM/docs/adr/0001-architecture-decisions.md)**: Logs of architectural decisions to prevent state drift.
