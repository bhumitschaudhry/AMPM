import crypto from 'node:crypto';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { type NextFunction, type Request, type Response, Router } from 'express';
import multer from 'multer';
import { deriveJobStatus } from '../constants';
import prisma from '../db';
import { createHttpError } from '../helpers/create-error';
import { sanitizeFilename } from '../helpers/sanitize-filename';
import { authenticateToken } from '../middleware/auth-middleware';
import { retryRateLimiter, uploadRateLimiter } from '../middleware/rate-limiter';
import { upload } from '../middleware/upload-middleware';
import { validateUuid } from '../middleware/validate-uuid';
import { imageQueue } from '../queue';
import { deleteFromR2, downloadFromR2, uploadToR2 } from '../storage/r2-client';

export const jobRouter = Router();
jobRouter.use(authenticateToken);

/** POST / — create a job and enqueue uploaded images for processing. */
jobRouter.post('/', uploadRateLimiter, (req: Request, res: Response, next: NextFunction) => {
  upload.array('images', 10)(req, res, async (multerError) => {
    try {
      if (multerError) {
        throw handleMulterError(multerError);
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw createHttpError(400, 'At least one image file is required.');
      }

      // Generate content hashes for duplicate detection
      const contentHashes = files.map((file) =>
        crypto.createHash('sha256').update(file.buffer).digest('hex'),
      );

      // Sanitize filenames to prevent XSS and path traversal
      const sanitizedNames = files.map((file) => sanitizeFilename(file.originalname));

      // Check for existing images with the same hash for this user
      const existingImages = await prisma.image.findMany({
        where: {
          contentHash: { in: contentHashes },
          job: { userId: req.userId },
        },
        include: { job: true },
      });

      // Create a map of hash to existing image for quick lookup, prioritizing COMPLETED images
      const existingHashMap = new Map<string, (typeof existingImages)[0]>();
      for (const img of existingImages) {
        const current = existingHashMap.get(img.contentHash);
        if (!current || (current.status !== 'COMPLETED' && img.status === 'COMPLETED')) {
          existingHashMap.set(img.contentHash, img);
        }
      }

      // Track the first appearance index of each hash in this request
      const firstAppearanceIndex = new Map<string, number>();
      files.forEach((_file, index) => {
        const hash = contentHashes[index];
        if (!firstAppearanceIndex.has(hash)) {
          firstAppearanceIndex.set(hash, index);
        }
      });

      // Separate new unique files from duplicates (database duplicates and intra-request duplicates)
      const newUniqueFiles: { file: Express.Multer.File; hash: string; index: number }[] = [];
      const seenHashesInRequest = new Set<string>();

      files.forEach((file, index) => {
        const hash = contentHashes[index];
        const existing = existingHashMap.get(hash);
        if (!existing && !seenHashesInRequest.has(hash)) {
          newUniqueFiles.push({ file, hash, index });
          seenHashesInRequest.add(hash);
        }
      });

      // Map to keep track of stored path for each hash in this request
      const hashToStoredPath = new Map<string, string>();
      for (const [hash, img] of existingHashMap.entries()) {
        hashToStoredPath.set(hash, img.storedPath);
      }

      // Upload only new files to R2
      const r2Keys = new Map<string, string>();
      if (newUniqueFiles.length > 0) {
        const uploadResults = await Promise.all(
          newUniqueFiles.map(({ file }) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const key = `uploads/${crypto.randomUUID()}${ext}`;
            return uploadToR2(key, file.buffer, file.mimetype);
          }),
        );
        newUniqueFiles.forEach(({ hash }, i) => {
          r2Keys.set(hash, uploadResults[i]);
          hashToStoredPath.set(hash, uploadResults[i]);
        });
      }

      // Create the Job + Image rows atomically
      const { job, images } = await prisma.$transaction(async (tx) => {
        // Re-check for existing images inside the transaction to prevent race conditions
        // where two concurrent requests both see no existing image and both upload
        const freshExisting = await tx.image.findMany({
          where: {
            contentHash: { in: contentHashes },
            job: { userId: req.userId! },
          },
          include: { job: true },
        });

        // Update existingHashMap if any new duplicates were created by concurrent requests
        for (const img of freshExisting) {
          if (!existingHashMap.has(img.contentHash)) {
            existingHashMap.set(img.contentHash, img);
          }
        }

        const created = await tx.job.create({ data: { userId: req.userId! } });

        const createdImages = await Promise.all(
          files.map((file, i) => {
            const hash = contentHashes[i];
            const existing = existingHashMap.get(hash);
            const storedPath = hashToStoredPath.get(hash)!;

            // If duplicate exists in database, reuse its storedPath and results
            if (existing) {
              return tx.image.create({
                data: {
                  jobId: created.id,
                  originalName: sanitizedNames[i],
                  storedPath: existing.storedPath,
                  mimeType: file.mimetype,
                  fileSize: file.size,
                  contentHash: hash,
                  // Copy AI results from existing image if available
                  caption: existing.caption,
                  labels: existing.labels as Prisma.InputJsonValue,
                  safetyResult: existing.safetyResult as Prisma.InputJsonValue,
                  isFlagged: existing.isFlagged,
                  flaggedCategory: existing.flaggedCategory,
                  status: existing.status === 'COMPLETED' ? 'COMPLETED' : existing.status,
                },
              });
            }

            // Check if there is an earlier image in the same request with the same hash
            const firstAppearanceIdx = firstAppearanceIndex.get(hash)!;
            if (firstAppearanceIdx < i) {
              return tx.image.create({
                data: {
                  jobId: created.id,
                  originalName: sanitizedNames[i],
                  storedPath,
                  mimeType: file.mimetype,
                  fileSize: file.size,
                  contentHash: hash,
                  status: 'PENDING',
                },
              });
            }

            // New unique image in this request
            return tx.image.create({
              data: {
                jobId: created.id,
                originalName: sanitizedNames[i],
                storedPath,
                mimeType: file.mimetype,
                fileSize: file.size,
                contentHash: hash,
                status: 'PENDING',
              },
            });
          }),
        );

        return { job: created, images: createdImages };
      });

      // Clean up orphaned R2 uploads from race condition
      // If the transaction found an existing image for a hash we just uploaded, delete our duplicate upload
      const orphanedKeys: string[] = [];
      for (const [hash, uploadedKey] of r2Keys.entries()) {
        const existing = existingHashMap.get(hash);
        if (existing && existing.storedPath !== uploadedKey) {
          orphanedKeys.push(uploadedKey);
        }
      }
      if (orphanedKeys.length > 0) {
        // Delete orphaned uploads in background (don't block response)
        Promise.all(orphanedKeys.map((key) => deleteFromR2(key))).catch((err) => {
          console.error('Failed to delete orphaned R2 uploads:', err);
        });
      }

      // Enqueue only new images for processing (skip duplicates that are completed or active)
      const imagesToProcess = images.filter((img) => {
        const index = images.indexOf(img);
        const hash = contentHashes[index];
        const existing = existingHashMap.get(hash);

        // If there's an existing image, only process if the previous run FAILED
        if (existing) {
          return existing.status === 'FAILED';
        }

        // If no existing image in DB, only enqueue the first occurrence in this request
        const firstAppearanceIdx = firstAppearanceIndex.get(hash)!;
        return firstAppearanceIdx === index;
      });

      if (imagesToProcess.length > 0) {
        try {
          await Promise.all(
            imagesToProcess.map((img) =>
              imageQueue.add('process-image', {
                imageId: img.id,
                jobId: img.jobId,
                storedPath: img.storedPath,
              }),
            ),
          );
        } catch (enqueueError) {
          // Roll back the DB writes so no orphaned PENDING images are left behind.
          await prisma.job.delete({ where: { id: job.id } }).catch(() => undefined);
          throw enqueueError;
        }
      }

      res.status(201).json({
        job: {
          id: job.id,
          createdAt: job.createdAt,
          status: 'pending',
          images: images.map((img, i) => {
            const hash = contentHashes[i];
            const isDuplicate = existingHashMap.has(hash) || firstAppearanceIndex.get(hash)! < i;
            return {
              id: img.id,
              originalName: img.originalName,
              status: img.status,
              isDuplicate,
            };
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  });
});

/** GET / — list all jobs for the authenticated user. */
jobRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { userId: req.userId },
      include: { images: true },
      orderBy: { createdAt: 'desc' },
    });

    const jobSummaries = jobs.map((job) => {
      const imageStatuses = job.images.map((img) => img.status);
      return {
        id: job.id,
        createdAt: job.createdAt,
        status: deriveJobStatus(imageStatuses),
        imageCount: job.images.length,
        images: job.images.map((img) => ({
          id: img.id,
          originalName: img.originalName,
          status: img.status,
          isFlagged: img.isFlagged,
          flaggedCategory: img.flaggedCategory,
        })),
      };
    });

    res.json(jobSummaries);
  } catch (error) {
    next(error);
  }
});

/** GET /:jobId/images/:imageId/file — stream an owned image from R2. */
jobRouter.get(
  '/:jobId/images/:imageId/file',
  validateUuid('jobId', 'imageId'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const image = await prisma.image.findFirst({
        where: {
          id: req.params.imageId as string,
          jobId: req.params.jobId as string,
          job: { userId: req.userId },
        },
      });

      if (!image) {
        throw createHttpError(404, 'Image not found.');
      }

      // storedPath is now an R2 object key (e.g. "uploads/<uuid>.jpg")
      const buffer = await downloadFromR2(image.storedPath);
      res.type(image.mimeType).send(buffer);
    } catch (error) {
      next(error);
    }
  },
);

/** GET /:jobId — full job detail with all image fields. */
jobRouter.get(
  '/:jobId',
  validateUuid('jobId'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId as string;
      const job = await prisma.job.findFirst({
        where: { id: jobId, userId: req.userId },
        include: { images: true },
      });

      if (!job) {
        throw createHttpError(404, 'Job not found.');
      }

      const imageStatuses = job.images.map((img) => img.status);
      res.json({
        id: job.id,
        createdAt: job.createdAt,
        status: deriveJobStatus(imageStatuses),
        images: job.images.map((img) => ({
          id: img.id,
          originalName: img.originalName,
          storedPath: img.storedPath,
          mimeType: img.mimeType,
          fileSize: img.fileSize,
          status: img.status,
          retryCount: img.retryCount,
          failureReason: img.failureReason,
          failureMessage: img.failureMessage,
          caption: img.caption,
          labels: img.labels,
          safetyResult: img.safetyResult,
          isFlagged: img.isFlagged,
          flaggedCategory: img.flaggedCategory,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

/** POST /:jobId/images/:imageId/retry — re-enqueue a failed image. */
jobRouter.post(
  '/:jobId/images/:imageId/retry',
  validateUuid('jobId', 'imageId'),
  retryRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const imageId = req.params.imageId as string;
      const jobId = req.params.jobId as string;
      const image = await prisma.image.findFirst({
        where: { id: imageId, jobId, job: { userId: req.userId } },
      });

      if (!image) {
        throw createHttpError(404, 'Image not found.');
      }
      if (image.status !== 'FAILED') {
        throw createHttpError(400, 'Only failed images can be retried.');
      }

      const updated = await prisma.image.update({
        where: { id: image.id },
        data: { status: 'PENDING', failureReason: null, failureMessage: null },
      });

      await imageQueue.add('process-image', {
        imageId: updated.id,
        jobId: updated.jobId,
        storedPath: updated.storedPath,
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  },
);

/** POST /:jobId/retry — re-enqueue all failed images in a job. */
jobRouter.post(
  '/:jobId/retry',
  validateUuid('jobId'),
  retryRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId as string;
      const job = await prisma.job.findFirst({
        where: { id: jobId, userId: req.userId },
        include: { images: true },
      });

      if (!job) {
        throw createHttpError(404, 'Job not found.');
      }

      const failedImages = job.images.filter((img) => img.status === 'FAILED');
      if (failedImages.length === 0) {
        throw createHttpError(400, 'No failed images to retry in this job.');
      }

      const updatedImages = await prisma.$transaction(
        failedImages.map((img) =>
          prisma.image.update({
            where: { id: img.id },
            data: { status: 'PENDING', failureReason: null, failureMessage: null },
          }),
        ),
      );

      await Promise.all(
        updatedImages.map((img) =>
          imageQueue.add('process-image', {
            imageId: img.id,
            jobId: img.jobId,
            storedPath: img.storedPath,
          }),
        ),
      );

      res.json({
        message: `Successfully enqueued ${updatedImages.length} failed images for retry.`,
        images: updatedImages,
      });
    } catch (error) {
      next(error);
    }
  },
);

/** Convert multer error into an HTTP error with a clear message. */
function handleMulterError(error: Error): Error & { statusCode: number } {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return createHttpError(413, 'File exceeds the 5MB size limit.');
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return createHttpError(400, 'Too many files. Maximum 10 images allowed per job.');
    }
    return createHttpError(400, `Upload error: ${error.message}`);
  }
  // File filter rejection or other error
  return createHttpError(400, error.message);
}
