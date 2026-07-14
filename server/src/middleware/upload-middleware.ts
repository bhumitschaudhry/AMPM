import multer from "multer";
import path from "path";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "../constants";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

/** Only allow JPEG, PNG, and WebP images. */
function imageFileFilter(
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
): void {
  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const extension = path.extname(file.originalname).toLowerCase();
  const isAllowedMimeType = ALLOWED_MIME_TYPES.includes(file.mimetype as typeof ALLOWED_MIME_TYPES[number]);

  if (isAllowedMimeType && allowedExtensions.includes(extension)) {
    cb(null, true);
  } else {
    cb(new Error(`File "${file.originalname}" is not a JPG, PNG, or WEBP image. Please choose a supported image file.`));
  }
}

/** Configured multer instance for image uploads. */
export const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});
