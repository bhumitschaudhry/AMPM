import type { Job } from 'bullmq';
import sharp from 'sharp';
import prisma from './db';
import { categorizeError } from './pipeline/categorize-error';
import { checkContentSafety } from './pipeline/check-content-safety';
import { detectLabels } from './pipeline/detect-labels';
import { generateCaption } from './pipeline/generate-caption';
import { downloadFromR2 } from './storage/r2-client';

interface ImageJobData {
  imageId: string;
  jobId: string;
  storedPath: string;
}

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// ponytail: MAX_FILE_SIZE_MB is the real source of truth (docker-compose sets it); the
// previously-hardcoded 5MB constant ignored the env var. Server derives the same way.
const MAX_FILE_SIZE_MB = Number.parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const NON_RETRYABLE_FAILURE_REASONS = new Set([
  'INVALID_FILE',
  'UNSUPPORTED_FORMAT',
  'FILE_TOO_LARGE',
]);

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
    throw new Error(
      'Malformed image-processing job payload: imageId, jobId, and storedPath are required.',
    );
  }

  let contentHash = '';
  let userId = '';

  try {
    const updated = await markImageStatus(imageId, 'PROCESSING');
    contentHash = updated?.contentHash || '';
    userId = updated?.job?.userId || '';

    const image = await loadImageForProcessing(imageId);
    validateImageRecord(image);

    const imageBuffer = await readAndValidateImage(image.storedPath);
    const safetyResult = await checkContentSafety(imageBuffer);

    // Stop immediately on unsafe content: skip label detection and captioning to save AI compute.
    if (!safetyResult.isSafe) {
      await saveSuccessResult(imageId, contentHash, userId, null, [], safetyResult);
      await flagImage(imageId, jobId, contentHash, userId, safetyResult.flaggedCategory!);
      return;
    }

    const labels = await detectLabels(imageBuffer);
    const caption = await generateCaption(imageBuffer);

    await saveSuccessResult(imageId, contentHash, userId, caption, labels, safetyResult);
  } catch (error) {
    const { code, message } = categorizeError(error);

    // Fallback: resolve contentHash and userId if they couldn't be loaded
    if (!contentHash || !userId) {
      try {
        const img = await prisma.image.findUnique({
          where: { id: imageId },
          select: { contentHash: true, job: { select: { userId: true } } },
        });
        if (img) {
          contentHash = img.contentHash;
          userId = img.job.userId;
        }
      } catch {
        // ignore
      }
    }

    if (NON_RETRYABLE_FAILURE_REASONS.has(code)) {
      // ponytail: non-retryable (e.g. FILE_TOO_LARGE) can never succeed — discard the
      // job so BullMQ won't burn AI quota re-running it. DB status is the source of truth.
      await markImageFailedWithReason(imageId, contentHash, userId, code, message);
      await job.discard();
    } else if (hasRetryAttemptsRemaining(job)) {
      await markImagePendingForRetry(imageId, contentHash, userId, code, message);
    } else {
      await markImageFailed(imageId, contentHash, userId, code, message);
    }
    throw error;
  }
}

/** Return whether BullMQ will run this image again after the current failure. */
function hasRetryAttemptsRemaining(job: Job<ImageJobData>): boolean {
  const configuredAttempts =
    typeof job.opts?.attempts === 'number'
      ? job.opts.attempts
      : Number.parseInt(process.env.MAX_RETRIES || '3', 10);

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
    throw new ImageValidationError(
      'INVALID_FILE',
      'Image record could not be found for processing.',
    );
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
      'Image exceeds the 5MB size limit and cannot be processed.',
    );
  }
}

/** Download image from R2 and normalize through sharp to validate it's a real image. */
async function readAndValidateImage(r2Key: string): Promise<Buffer> {
  const rawBuffer = await downloadFromR2(r2Key);
  try {
    return await sharp(rawBuffer).toBuffer();
  } catch (sharpError: unknown) {
    const message =
      sharpError instanceof Error ? sharpError.message : 'corrupt or invalid image format';
    throw new ImageValidationError('INVALID_FILE', `Could not decode image file: ${message}`);
  }
}

/** Set image status in the database for the image and its pending duplicates of the same user. */
async function markImageStatus(imageId: string, status: 'PROCESSING' | 'COMPLETED') {
  const updated = await prisma.image.update({
    where: { id: imageId },
    data: { status },
    select: { contentHash: true, job: { select: { userId: true } } },
  });

  if (status === 'PROCESSING' && updated?.contentHash && updated?.job?.userId) {
    await prisma.image.updateMany({
      where: {
        contentHash: updated.contentHash,
        job: { userId: updated.job.userId },
        status: 'PENDING',
        id: { not: imageId },
      },
      data: { status },
    });
  }

  return updated;
}

/** Persist all AI pipeline results and mark image and its duplicate processing records as completed. */
async function saveSuccessResult(
  imageId: string,
  contentHash: string,
  userId: string,
  caption: string | null,
  labels: Array<{ name: string; score: number }>,
  safetyResult: {
    isSafe: boolean;
    categories: Record<string, string>;
    flaggedCategory: string | null;
  },
) {
  // Always update the main image first
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

  // Then update pending/processing duplicates of the same user if hash info is available
  if (contentHash && userId) {
    await prisma.image.updateMany({
      where: {
        contentHash,
        job: { userId },
        status: { in: ['PENDING', 'PROCESSING'] },
        id: { not: imageId },
      },
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
}

/** Flag unsafe images and create notifications for their job owners. */
async function flagImage(
  imageId: string,
  jobId: string,
  contentHash: string,
  userId: string,
  flaggedCategory: string,
) {
  // Always update the main image first
  await prisma.image.update({
    where: { id: imageId },
    data: { isFlagged: true, flaggedCategory },
  });

  // Create notification for the main job
  const parentJob = await prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } });
  const ownerId = parentJob?.userId || userId;
  if (ownerId) {
    await prisma.notification.create({
      data: {
        userId: ownerId,
        title: 'Image Flagged',
        message: `An image was flagged for "${flaggedCategory}" content and requires review.`,
        imageId,
        jobId,
      },
    });
  }

  // Handle duplicates if info is available
  if (contentHash && userId) {
    const duplicateImagesToFlag = await prisma.image.findMany({
      where: {
        contentHash,
        job: { userId },
        isFlagged: false,
        id: { not: imageId },
      },
      select: { id: true, jobId: true },
    });

    if (duplicateImagesToFlag.length > 0) {
      await prisma.image.updateMany({
        where: {
          id: { in: duplicateImagesToFlag.map((img: { id: string }) => img.id) },
        },
        data: { isFlagged: true, flaggedCategory },
      });

      // Create notifications for duplicate jobs
      const uniqueJobIds = Array.from(
        new Set(duplicateImagesToFlag.map((img: { jobId: string }) => img.jobId)),
      );
      await Promise.all(
        uniqueJobIds.map((dupJobId) =>
          prisma.notification.create({
            data: {
              userId,
              title: 'Image Flagged',
              message: `An image was flagged for "${flaggedCategory}" content and requires review.`,
              jobId: dupJobId,
              imageId: duplicateImagesToFlag.find(
                (img: { id: string; jobId: string }) => img.jobId === dupJobId,
              )?.id,
            },
          }),
        ),
      );
    }
  }
}

/** Record a non-terminal failure while BullMQ waits to retry the image. */
async function markImagePendingForRetry(
  imageId: string,
  contentHash: string,
  userId: string,
  failureReason: string,
  failureMessage: string,
) {
  // Always update the main image first
  await prisma.image.update({
    where: { id: imageId },
    data: {
      status: 'PENDING',
      retryCount: { increment: 1 },
      failureReason,
      failureMessage,
    },
  });

  // Update PENDING duplicate images if info is available (don't touch PROCESSING — another worker owns them)
  if (contentHash && userId) {
    await prisma.image.updateMany({
      where: {
        contentHash,
        job: { userId },
        status: 'PENDING',
        id: { not: imageId },
      },
      data: {
        status: 'PENDING',
        retryCount: { increment: 1 },
        failureReason,
        failureMessage,
      },
    });
  }
}

/** Record a terminal non-retryable failure with its root failure reason. */
async function markImageFailedWithReason(
  imageId: string,
  contentHash: string,
  userId: string,
  failureReason: string,
  failureMessage: string,
) {
  // Always update the main image first
  await prisma.image.update({
    where: { id: imageId },
    data: {
      status: 'FAILED',
      retryCount: { increment: 1 },
      failureReason,
      failureMessage,
    },
  });

  // Update PENDING duplicate images if info is available (don't touch PROCESSING — another worker owns them)
  if (contentHash && userId) {
    await prisma.image.updateMany({
      where: {
        contentHash,
        job: { userId },
        status: 'PENDING',
        id: { not: imageId },
      },
      data: {
        status: 'FAILED',
        retryCount: { increment: 1 },
        failureReason,
        failureMessage,
      },
    });
  }
}

/** Record the final failure after BullMQ exhausts its configured attempts. */
async function markImageFailed(
  imageId: string,
  contentHash: string,
  userId: string,
  failureReason: string,
  failureMessage: string,
) {
  // Always update the main image first
  await prisma.image.update({
    where: { id: imageId },
    data: {
      status: 'FAILED',
      retryCount: { increment: 1 },
      failureReason: 'MAX_RETRIES_EXCEEDED',
      failureMessage: `Processing failed after all retry attempts. Last error (${failureReason}): ${failureMessage}`,
    },
  });

  // Update PENDING duplicate images if info is available (don't touch PROCESSING — another worker owns them)
  if (contentHash && userId) {
    await prisma.image.updateMany({
      where: {
        contentHash,
        job: { userId },
        status: 'PENDING',
        id: { not: imageId },
      },
      data: {
        status: 'FAILED',
        retryCount: { increment: 1 },
        failureReason: 'MAX_RETRIES_EXCEEDED',
        failureMessage: `Processing failed after all retry attempts. Last error (${failureReason}): ${failureMessage}`,
      },
    });
  }
}
