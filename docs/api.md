# AMPM API Reference

This document details the API endpoints, authentication requirements, and runtime status models of the **AMPM** service.

---

## Authentication

All protected endpoints require a JWT Access Token passed in the `Authorization` header:

```http
Authorization: Bearer <access_token>
```

Authentication is managed via an access/refresh token rotation (RTR) model.

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/signup` | No | Registers a new account |
| `POST` | `/api/auth/login` | No | Authenticates credentials and returns JWTs |
| `POST` | `/api/auth/google` | No | Exchanges a Google ID token for AMPM JWTs |
| `POST` | `/api/auth/refresh` | No | Rotates access/refresh token pair |
| `POST` | `/api/auth/logout` | Yes | Revokes refresh tokens globally |
| `GET`  | `/api/auth/me` | Yes | Returns authenticated user details |
| `POST` | `/api/jobs` | Yes | Uploads one or more images (multipart) |
| `GET`  | `/api/jobs` | Yes | Lists user's jobs with derived statuses |
| `GET`  | `/api/jobs/:jobId` | Yes | Returns job metadata and image processing results |
| `POST` | `/api/jobs/:jobId/images/:imageId/retry` | Yes | Re-enqueues a failed image for processing |
| `GET`  | `/api/notifications` | Yes | Lists user alerts and safety warnings |
| `PATCH`| `/api/notifications/:id/read` | Yes | Marks an alert as read |

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
| `INVALID_FILE` | File could not be read or decoded (corrupt). |
| `UNSUPPORTED_FORMAT` | File format is not JPEG, PNG, or WEBP. |
| `FILE_TOO_LARGE` | File size exceeds the 5MB limit. |
| `AI_PROVIDER_TIMEOUT` | Google Vision or Hugging Face API call timed out. |
| `AI_PROVIDER_ERROR` | Non-timeout error returned by the external APIs. |
| `AI_PROVIDER_RATE_LIMITED` | External API quota exceeded or rate limit hit. |
| `INTERNAL_ERROR` | Unhandled error in the worker process logic. |
| `MAX_RETRIES_EXCEEDED` | Image failed after exhausting all configured queue retries. |
