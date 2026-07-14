import { ImageStatus } from "@prisma/client";

/** Allowed MIME types for uploaded images. */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Maximum file size in bytes (5MB). */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Derive a job's overall status from its images' statuses.
 * Rules (from spec):
 *   - pending: all images pending
 *   - processing: at least one is pending/processing, none failed yet
 *   - completed: all completed
 *   - failed: at least one failed, none still pending/processing
 *   - partially_completed: all done, but mix of completed and failed
 */
export function deriveJobStatus(imageStatuses: ImageStatus[]): string {
  if (imageStatuses.length === 0) return "pending";

  const allPending = imageStatuses.every((s) => s === "PENDING");
  if (allPending) return "pending";

  const allCompleted = imageStatuses.every((s) => s === "COMPLETED");
  if (allCompleted) return "completed";

  const hasInProgress = imageStatuses.some(
    (s) => s === "PENDING" || s === "PROCESSING"
  );

  if (hasInProgress) return "processing";

  // All done (no pending/processing) — check for mix
  const hasCompleted = imageStatuses.some((s) => s === "COMPLETED");
  const hasFailed = imageStatuses.some((s) => s === "FAILED");

  if (hasCompleted && hasFailed) return "partially_completed";
  if (hasFailed) return "failed";

  return "completed";
}
