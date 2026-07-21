import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import prisma from "../db";
import { imageQueue } from "../queue";
import { deriveJobStatus } from "../constants";
import { authenticateToken } from "../middleware/auth-middleware";
import { upload } from "../middleware/upload-middleware";
import { uploadRateLimiter, retryRateLimiter } from "../middleware/rate-limiter";
import { validateUuid } from "../middleware/validate-uuid";
import { createHttpError } from "../helpers/create-error";
import { uploadToR2, downloadFromR2 } from "../storage/r2-client";
import { sanitizeFilename } from "../helpers/sanitize-filename";

export const jobRouter = Router();
jobRouter.use(authenticateToken);

/** POST / — create a job and enqueue uploaded images for processing. */
jobRouter.post("/", uploadRateLimiter, (req: Request, res: Response, next: NextFunction) => {
  upload.array("images", 10)(req, res, async (multerError) => {
    try {
      if (multerError) {
        throw handleMulterError(multerError);
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw createHttpError(400, "At least one image file is required.");
      }

      // Generate content hashes for duplicate detection
      const contentHashes = files.map((file) =>
        crypto.createHash("sha256").update(file.buffer).digest("hex")
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

      // Create a map of hash to existing image for quick lookup
      const existingHashMap = new Map<string, typeof existingImages[0]>();
      for (const img of existingImages) {
        if (!existingHashMap.has(img.contentHash)) {
          existingHashMap.set(img.contentHash, img);
        }
      }

      // Separate new files from duplicates
      const newFiles: { file: Express.Multer.File; hash: string; index: number }[] = [];
      const duplicateImages: { hash: string; existingImage: typeof existingImages[0]; index: number }[] = [];

      files.forEach((file, index) => {
        const hash = contentHashes[index];
        const existing = existingHashMap.get(hash);
        if (existing) {
          duplicateImages.push({ hash, existingImage: existing, index });
        } else {
          newFiles.push({ file, hash, index });
        }
      });

      // Upload only new files to R2
      const r2Keys = new Map<number, string>();
      if (newFiles.length > 0) {
        const uploadResults = await Promise.all(
          newFiles.map(({ file }) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const key = `uploads/${crypto.randomUUID()}${ext}`;
            return uploadToR2(key, file.buffer, file.mimetype);
          })
        );
        newFiles.forEach(({ index }, i) => {
          r2Keys.set(index, uploadResults[i]);
        });
      }

      // Create the Job + Image rows atomically
      const { job, images } = await prisma.$transaction(async (tx) => {
        const created = await tx.job.create({ data: { userId: req.userId! } });

        const createdImages = await Promise.all(
          files.map((file, i) => {
            const hash = contentHashes[i];
            const existing = existingHashMap.get(hash);

            // If duplicate exists, reuse its storedPath
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
                  labels: existing.labels as any,
                  safetyResult: existing.safetyResult as any,
                  isFlagged: existing.isFlagged,
                  flaggedCategory: existing.flaggedCategory,
                  status: existing.status === "COMPLETED" ? "COMPLETED" : existing.status,
                },
              });
            }

            // New image - use the uploaded R2 key
            return tx.image.create({
              data: {
                jobId: created.id,
                originalName: sanitizedNames[i],
                storedPath: r2Keys.get(i)!,
                mimeType: file.mimetype,
                fileSize: file.size,
                contentHash: hash,
              },
            });
          })
        );

        return { job: created, images: createdImages };
      });

      // Enqueue only new images for processing (skip duplicates that are already completed)
      const imagesToProcess = images.filter((img) => {
        const hash = contentHashes[images.indexOf(img)];
        const existing = existingHashMap.get(hash);
        return !existing || existing.status !== "COMPLETED";
      });

      if (imagesToProcess.length > 0) {
        try {
          await Promise.all(
            imagesToProcess.map((img) =>
              imageQueue.add("process-image", {
                imageId: img.id,
                jobId: img.jobId,
                storedPath: img.storedPath,
              })
            )
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
          status: "pending",
          images: images.map((img, i) => ({
            id: img.id,
            originalName: img.originalName,
            status: img.status,
            isDuplicate: existingHashMap.has(contentHashes[i]),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  });
});

/** GET / — list all jobs for the authenticated user. */
jobRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { userId: req.userId },
      include: { images: true },
      orderBy: { createdAt: "desc" },
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
  "/:jobId/images/:imageId/file",
  validateUuid("jobId", "imageId"),
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
        throw createHttpError(404, "Image not found.");
      }

      // storedPath is now an R2 object key (e.g. "uploads/<uuid>.jpg")
      const buffer = await downloadFromR2(image.storedPath);
      res.type(image.mimeType).send(buffer);
    } catch (error) {
      next(error);
    }
  }
);

/** GET /:jobId — full job detail with all image fields. */
jobRouter.get(
  "/:jobId",
  validateUuid("jobId"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId as string;
      const job = await prisma.job.findFirst({
        where: { id: jobId, userId: req.userId },
        include: { images: true },
      });

      if (!job) {
        throw createHttpError(404, "Job not found.");
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
  }
);

/** POST /:jobId/images/:imageId/retry — re-enqueue a failed image. */
jobRouter.post(
  "/:jobId/images/:imageId/retry",
  validateUuid("jobId", "imageId"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const imageId = req.params.imageId as string;
      const jobId = req.params.jobId as string;
      const image = await prisma.image.findFirst({
        where: { id: imageId, jobId, job: { userId: req.userId } },
      });

      if (!image) {
        throw createHttpError(404, "Image not found.");
      }
      if (image.status !== "FAILED") {
        throw createHttpError(400, "Only failed images can be retried.");
      }

      const updated = await prisma.image.update({
        where: { id: image.id },
        data: { status: "PENDING", failureReason: null, failureMessage: null },
      });

      await imageQueue.add("process-image", {
        imageId: updated.id,
        jobId: updated.jobId,
        storedPath: updated.storedPath,
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  }
);

/** POST /:jobId/retry — re-enqueue all failed images in a job. */
jobRouter.post(
  "/:jobId/retry",
  validateUuid("jobId"),
  retryRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = req.params.jobId as string;
      const job = await prisma.job.findFirst({
        where: { id: jobId, userId: req.userId },
        include: { images: true },
      });

      if (!job) {
        throw createHttpError(404, "Job not found.");
      }

      const failedImages = job.images.filter((img) => img.status === "FAILED");
      if (failedImages.length === 0) {
        throw createHttpError(400, "No failed images to retry in this job.");
      }

      const updatedImages = await prisma.$transaction(
        failedImages.map((img) =>
          prisma.image.update({
            where: { id: img.id },
            data: { status: "PENDING", failureReason: null, failureMessage: null },
          })
        )
      );

      await Promise.all(
        updatedImages.map((img) =>
          imageQueue.add("process-image", {
            imageId: img.id,
            jobId: img.jobId,
            storedPath: img.storedPath,
          })
        )
      );

      res.json({
        message: `Successfully enqueued ${updatedImages.length} failed images for retry.`,
        images: updatedImages,
      });
    } catch (error) {
      next(error);
    }
  }
);

/** Convert multer error into an HTTP error with a clear message. */
function handleMulterError(error: Error): Error & { statusCode: number } {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return createHttpError(413, "File exceeds the 5MB size limit.");
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return createHttpError(400, "Too many files. Maximum 10 images allowed per job.");
    }
    return createHttpError(400, `Upload error: ${error.message}`);
  }
  // File filter rejection or other error
  return createHttpError(400, error.message);
}
