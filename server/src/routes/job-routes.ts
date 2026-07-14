import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import prisma from "../db";
import { imageQueue } from "../queue";
import { deriveJobStatus } from "../constants";
import { authenticateToken } from "../middleware/auth-middleware";
import { upload } from "../middleware/upload-middleware";
import { createHttpError } from "../helpers/create-error";

export const jobRouter = Router();
jobRouter.use(authenticateToken);

/** POST / — create a job and enqueue uploaded images for processing. */
jobRouter.post("/", (req: Request, res: Response, next: NextFunction) => {
  upload.array("images", 10)(req, res, async (multerError) => {
    try {
      if (multerError) {
        throw handleMulterError(multerError);
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        throw createHttpError(400, "At least one image file is required.");
      }

      const job = await prisma.job.create({ data: { userId: req.userId! } });
      const images = await createImageRecords(job.id, files);
      await Promise.all(
        images.map((img) =>
          imageQueue.add("process-image", { imageId: img.id, jobId: img.jobId, storedPath: img.storedPath })
        )
      );

      res.status(201).json({
        job: {
          id: job.id,
          createdAt: job.createdAt,
          status: "pending",
          images: images.map((img) => ({
            id: img.id,
            originalName: img.originalName,
            status: img.status,
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

/** GET /:jobId/images/:imageId/file — return an owned image for authenticated preview. */
jobRouter.get("/:jobId/images/:imageId/file", async (req: Request, res: Response, next: NextFunction) => {
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

    res.type(image.mimeType).sendFile(path.resolve(image.storedPath));
  } catch (error) {
    next(error);
  }
});

/** GET /:jobId — full job detail with all image fields. */
jobRouter.get("/:jobId", async (req: Request, res: Response, next: NextFunction) => {
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
});

/** POST /:jobId/images/:imageId/retry — re-enqueue a failed image. */
jobRouter.post("/:jobId/images/:imageId/retry", async (req: Request, res: Response, next: NextFunction) => {
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
      data: { status: "PENDING", failureReason: null, failureMessage: null, retryCount: { increment: 1 } },
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
});

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

/** Create Image records in the DB for each uploaded file. */
async function createImageRecords(jobId: string, files: Express.Multer.File[]) {
  return Promise.all(
    files.map((file) =>
      prisma.image.create({
        data: {
          jobId,
          originalName: file.originalname,
          storedPath: file.path,
          mimeType: file.mimetype,
          fileSize: file.size,
        },
      })
    )
  );
}


