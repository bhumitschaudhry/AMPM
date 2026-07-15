import multer from "multer";
import path from "path";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "../constants";

// Use memory storage so we can stream the buffer directly to R2 without
// touching the local filesystem. No uploads volume needed.
const storage = multer.memoryStorage();

/** Only allow JPEG, PNG, and WebP images. */
function imageFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const extension = path.extname(file.originalname).toLowerCase();
  const isAllowedMimeType = ALLOWED_MIME_TYPES.includes(
    file.mimetype as (typeof ALLOWED_MIME_TYPES)[number]
  );

  if (isAllowedMimeType && allowedExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File "${file.originalname}" is not a JPG, PNG, or WEBP image. Please choose a supported image file.`
      )
    );
  }
}

/** Configured multer instance — buffers files in memory for R2 upload. */
export const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});
