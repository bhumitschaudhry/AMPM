import { Job } from 'bullmq';
import sharp from 'sharp';
import prisma from './db';
import { downloadFromR2 } from './storage/r2-client';
import { generateCaption } from './pipeline/generate-caption';
import { detectLabels } from './pipeline/detect-labels';
import { checkContentSafety } from './pipeline/check-content-safety';
import { categorizeError } from './pipeline/categorize-error';

interface ImageJobData {
  imageId: string;
  jobId: string;
  storedPath: string;
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// ponytail: MAX_FILE_SIZE_MB is the real source of truth (docker-compose sets it); the
// previously-hardcoded 5MB constant ignored the env var. Server derives the same way.
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const NON_RETRYABLE_FAILURE_REASONS = new Set(['INVALID_FILE', 'UNSUPPORTED_FORMAT', 'FILE_TOO_LARGE']);

class ImageValidationError extends Error {
  constructor(
    public readonly failureReason: 'INVALID_FILE' | 'UNSUPPORTED_FORMAT' | 'FILE_TOO_LARGE',
    message: string,
  ) {
    super(message);
  }
}

/** BullMQ job handler — runs the full AI pipeline on a single image. */
export async function processImage(job: Job<ImageJobData>): Promise<void> {
  // Guard the queue contract: a missing/renamed field must fail loudly, not become undefined.
  const { imageId, jobId, storedPath } = job.data;
  if (!imageId || !jobId || !storedPath) {
    throw new Error('Malformed image-processing job payload: imageId, jobId, and storedPath are required.');
  }

  try {
    await markImageStatus(imageId, 'PROCESSING');

    const image = await loadImageForProcessing(imageId);
    validateImageRecord(image);

    const imageBuffer = await readAndValidateImage(image.storedPath);
    const safetyResult = await checkContentSafety(imageBuffer);
    const labels = await detectLabels(imageBuffer);
    const caption = safetyResult.isSafe ? await generateCaption(imageBuffer) : null;

    await saveSuccessResult(imageId, caption, labels, safetyResult);

    if (!safetyResult.isSafe) {
      await flagImage(imageId, job.data.jobId, safetyResult.flaggedCategory!);
    }
  } catch (error) {
    const { code, message } = categorizeError(error);
    if (NON_RETRYABLE_FAILURE_REASONS.has(code)) {
      // ponytail: non-retryable (e.g. FILE_TOO_LARGE) can never succeed — discard the
      // job so BullMQ won't burn AI quota re-running it. DB status is the source of truth.
      await markImageFailedWithReason(imageId, code, message);
      await job.discard();
    } else if (hasRetryAttemptsRemaining(job)) {
      await markImagePendingForRetry(imageId, code, message);
    } else {
      await markImageFailed(imageId, code, message);
    }
    throw error;
  }
}

/** Return whether BullMQ will run this image again after the current failure. */
function hasRetryAttemptsRemaining(job: Job<ImageJobData>): boolean {
  const configuredAttempts = typeof job.opts?.attempts === 'number'
    ? job.opts.attempts
    : parseInt(process.env.MAX_RETRIES || '3', 10);

  return job.attemptsMade + 1 < configuredAttempts;
}

/** Fetch current image metadata from the database before processing. */
async function loadImageForProcessing(imageId: string) {
  const image = await prisma.image.findUnique({
    where: { id: imageId },
    select: {
      mimeType: true,
      fileSize: true,
      storedPath: true,
    },
  });

  if (!image) {
    throw new ImageValidationError('INVALID_FILE', 'Image record could not be found for processing.');
  }

  return image;
}

/** Re-check upload constraints in the worker for defense in depth. */
function validateImageRecord(image: { mimeType: string; fileSize: number }) {
  if (!ALLOWED_MIME_TYPES.has(image.mimeType)) {
    throw new ImageValidationError(
      'UNSUPPORTED_FORMAT',
      `Image format "${image.mimeType}" is not supported. Only JPG, PNG, and WEBP images can be processed.`,
    );
  }

  if (image.fileSize > MAX_FILE_SIZE_BYTES) {
    throw new ImageValidationError(
      'FILE_TOO_LARGE',
      `Image exceeds the 5MB size limit and cannot be processed.`,
    );
  }
}

/** Download image from R2 and normalize through sharp to validate it's a real image. */
async function readAndValidateImage(r2Key: string): Promise<Buffer> {
  const rawBuffer = await downloadFromR2(r2Key);
  try {
    return await sharp(rawBuffer).toBuffer();
  } catch (sharpError: any) {
    throw new ImageValidationError(
      'INVALID_FILE',
      `Could not decode image file: ${sharpError.message || 'corrupt or invalid image format'}`
    );
  }
}

/** Set image status in the database. */
async function markImageStatus(imageId: string, status: 'PROCESSING' | 'COMPLETED') {
  await prisma.image.update({
    where: { id: imageId },
    data: { status },
  });
}

/** Persist all AI pipeline results and mark image as completed. */
async function saveSuccessResult(
  imageId: string,
  caption: string | null,
  labels: Array<{ name: string; score: number }>,
  safetyResult: { isSafe: boolean; categories: Record<string, string>; flaggedCategory: string | null },
) {
  await prisma.image.update({
    where: { id: imageId },
    data: {
      caption,
      labels: structuredClone(labels),
      safetyResult: structuredClone(safetyResult),
      status: 'COMPLETED',
      failureReason: null,
      failureMessage: null,
    },
  });
}

/** Flag an unsafe image and create a notification for the job owner. */
async function flagImage(imageId: string, jobId: string, flaggedCategory: string) {
  await prisma.image.update({
    where: { id: imageId },
    data: { isFlagged: true, flaggedCategory },
  });

  // Look up the job to find the user who owns it for the notification
  const parentJob = await prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } });
  if (!parentJob) return;

  await prisma.notification.create({
    data: {
      userId: parentJob.userId,
      title: 'Image Flagged',
      message: `An image was flagged for "${flaggedCategory}" content and requires review.`,
      imageId,
      jobId,
    },
  });
}

/** Record a non-terminal failure while BullMQ waits to retry the image. */
async function markImagePendingForRetry(imageId: string, failureReason: string, failureMessage: string) {
  await prisma.image.update({
    where: { id: imageId },
    data: {
      status: 'PENDING',
      retryCount: { increment: 1 },
      failureReason,
      failureMessage,
    },
  });
}

/** Record a terminal non-retryable failure with its root failure reason. */
async function markImageFailedWithReason(imageId: string, failureReason: string, failureMessage: string) {
  await prisma.image.update({
    where: { id: imageId },
    data: {
      status: 'FAILED',
      retryCount: { increment: 1 },
      failureReason,
      failureMessage,
    },
  });
}

/** Record the final failure after BullMQ exhausts its configured attempts. */
async function markImageFailed(imageId: string, failureReason: string, failureMessage: string) {
  await prisma.image.update({
    where: { id: imageId },
    data: {
      status: 'FAILED',
      retryCount: { increment: 1 },
      failureReason: 'MAX_RETRIES_EXCEEDED',
      failureMessage: `Processing failed after all retry attempts. Last error (${failureReason}): ${failureMessage}`,
    },
  });
}
