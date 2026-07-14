import { ImageStatus } from "@prisma/client";

/** Allowed MIME types for uploaded images. */
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Maximum upload size, sourced from MAX_FILE_SIZE_MB (defaults to 5MB). */
export const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || "5", 10);

/** Maximum file size in bytes. */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Derive a job's overall status from its images' statuses.
 * Precedence (chosen because an in-flight image can still change the outcome):
 *   - pending:              all images pending
 *   - processing:           any image still PENDING/PROCESSING (a FAILED image does
 *                           NOT downgrade it — the job is still working)
 *   - completed:            all images completed
 *   - failed:               no in-flight images, and at least one failed, none completed
 *   - partially_completed:  no in-flight images, mix of completed and failed
 * The spec is contradictory for mixed sets; this precedence is the intentional choice.
 */
export function deriveJobStatus(imageStatuses: ImageStatus[]): string {
  if (imageStatuses.length === 0) return "pending";

  const allPending = imageStatuses.every((s) => s === "PENDING");
  if (allPending) return "pending";

  const allCompleted = imageStatuses.every((s) => s === "COMPLETED");
  if (allCompleted) return "completed";

  // Any image still in flight means the job is not finished, even if another failed.
  const hasInProgress = imageStatuses.some(
    (s) => s === "PENDING" || s === "PROCESSING"
  );

  if (hasInProgress) return "processing";

  // All done (no pending/processing) — check for mix
  const hasCompleted = imageStatuses.some((s) => s === "COMPLETED");
  const hasFailed = imageStatuses.some((s) => s === "FAILED");

  if (hasCompleted && hasFailed) return "partially_completed";
  if (hasFailed) return "failed";

  // Only reachable if there are neither in-flight, completed, nor failed images.
  return "completed";
}
