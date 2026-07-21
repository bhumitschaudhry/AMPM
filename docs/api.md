# AMPM API Reference

This document details the API endpoints, authentication requirements, security middleware, and runtime status models of the **AMPM** service.

---

## Authentication & Security

All protected endpoints require a JWT Access Token passed in the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

Authentication is managed via an Access/Refresh Token Rotation (RTR) model with immediate revocation via database `token_version`.

### Security & Rate Limiting Controls

- **Rate Limits** (enforced per user ID via `express-rate-limit`):
  - **Upload Endpoint** (`POST /api/jobs`): 10 requests per 15 minutes.
  - **Retry Endpoints** (`POST /api/jobs/.../retry`): 20 requests per 15 minutes.
- **Input Sanitization**: Global XSS middleware recursively strips script tags and malicious attributes from body, query, and params.
- **UUID Validation**: Path parameters (`:jobId`, `:imageId`, `:id`) must pass strict UUID format validation.
- **Payload & File Controls**: `express.json` limited to 1MB. File uploads restricted to 5MB per file (max 10 images per batch) with filename sanitization against path traversal.

---

## API Endpoints

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/signup` | No | - | Registers a new credentials account |
| `POST` | `/api/auth/login` | No | - | Authenticates credentials and returns JWTs |
| `POST` | `/api/auth/google` | No | - | Exchanges a Google ID token for AMPM JWTs |
| `POST` | `/api/auth/refresh` | No | - | Rotates access/refresh token pair |
| `POST` | `/api/auth/logout` | Yes | - | Revokes refresh tokens globally |
| `GET`  | `/api/auth/me` | Yes | - | Returns authenticated user profile |
| `POST` | `/api/jobs` | Yes | 10 / 15m | Uploads one or more images (multipart; automatic SHA-256 deduplication) |
| `GET`  | `/api/jobs` | Yes | - | Lists user's jobs with derived statuses |
| `GET`  | `/api/jobs/:jobId` | Yes | - | Returns job metadata and image processing results |
| `POST` | `/api/jobs/:jobId/images/:imageId/retry` | Yes | 20 / 15m | Re-enqueues a single failed image for processing |
| `POST` | `/api/jobs/:jobId/retry` | Yes | 20 / 15m | Re-enqueues all failed images in a job (batch retry) |
| `GET`  | `/api/notifications` | Yes | - | Lists user alerts and safety warnings |
| `PATCH`| `/api/notifications/:id/read` | Yes | - | Marks an alert as read |

---

## Job & Image Status Model

Each uploaded image is processed independently and transitions through the following lifecycle:

`pending` → `processing` → `completed` OR `failed`

### Derived Job Status

A job contains one or more images. The overall job status is derived dynamically at runtime based on the statuses of its constituent images:

- **`pending`**: All images in the job are in `pending` state.
- **`processing`**: At least one image is `pending` or `processing`, and no image is failed.
- **`completed`**: All images completed successfully.
- **`failed`**: All images failed.
- **`partially_completed`**: All images finished processing, but some succeeded and others failed.

---

## Image Failure Taxonomy

When an image processing task fails, a code and human-readable message are saved:

| Reason Code | Meaning |
|---|---|
| `INVALID_FILE` | File could not be read or decoded (corrupt or non-image buffer). |
| `UNSUPPORTED_FORMAT` | File format is not JPEG, PNG, or WEBP. |
| `FILE_TOO_LARGE` | File size exceeds the 5MB limit. |
| `AI_PROVIDER_TIMEOUT` | Google Vision or Hugging Face API call timed out. |
| `AI_PROVIDER_ERROR` | Non-timeout 5xx error returned by external AI APIs. |
| `AI_PROVIDER_RATE_LIMITED` | External API quota exceeded or rate limit (HTTP 429) hit. |
| `AI_PROVIDER_UNAUTHORIZED` | Invalid or missing API token / permissions (HTTP 401/403). |
| `GOOGLE_VISION_API_ERROR` | Google Cloud Vision API authentication, billing, or key error. |
| `NETWORK_ERROR` | DNS lookup drops (ENOTFOUND) or network connectivity failures. |
| `INTERNAL_ERROR` | Unhandled error in the worker process logic. |
| `MAX_RETRIES_EXCEEDED` | Image failed after exhausting all configured queue retries. |

