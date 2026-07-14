import { Job } from 'bullmq';
import sharp from 'sharp';
import { readFile } from 'fs/promises';
import prisma from './db';
import { generateCaption } from './pipeline/generate-caption';
import { detectLabels } from './pipeline/detect-labels';
import { checkContentSafety } from './pipeline/check-content-safety';
import { categorizeError } from './pipeline/categorize-error';

interface ImageJobData {
  imageId: string;
  jobId: string;
  storedPath: string;
}

/** BullMQ job handler — runs the full AI pipeline on a single image. */
export async function processImage(job: Job<ImageJobData>): Promise<void> {
  const { imageId, storedPath } = job.data;

  try {
    await markImageStatus(imageId, 'PROCESSING');

    const imageBuffer = await readAndValidateImage(storedPath);
    const caption = await generateCaption(imageBuffer);
    const labels = await detectLabels(imageBuffer);
    const safetyResult = await checkContentSafety(imageBuffer);

    await saveSuccessResult(imageId, caption, labels, safetyResult);

    if (!safetyResult.isSafe) {
      await flagImage(imageId, job.data.jobId, safetyResult.flaggedCategory!);
    }
  } catch (error) {
    const { code, message } = categorizeError(error);
    await markImageFailed(imageId, code, message);
    throw error;
  }
}

/** Read file from disk and normalize through sharp to validate it's a real image. */
async function readAndValidateImage(storedPath: string): Promise<Buffer> {
  const rawBuffer = await readFile(storedPath);
  return sharp(rawBuffer).toBuffer();
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
  caption: string,
  labels: Array<{ name: string; score: number }>,
  safetyResult: { isSafe: boolean; categories: Record<string, string>; flaggedCategory: string | null },
) {
  await prisma.image.update({
    where: { id: imageId },
    data: {
      caption,
      labels: JSON.parse(JSON.stringify(labels)),
      safetyResult: JSON.parse(JSON.stringify(safetyResult)),
      status: 'COMPLETED',
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

/** Record failure details so the user can see what went wrong. */
async function markImageFailed(imageId: string, failureReason: string, failureMessage: string) {
  await prisma.image.update({
    where: { id: imageId },
    data: { status: 'FAILED', failureReason, failureMessage },
  });
}
