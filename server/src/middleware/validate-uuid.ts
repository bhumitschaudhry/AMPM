import { Request, Response, NextFunction } from "express";
import { createHttpError } from "../helpers/create-error";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Middleware to validate UUID format for path parameters.
 * Usage: router.get("/:jobId", validateUuid("jobId"), handler)
 */
export function validateUuid(...params: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const param of params) {
      const value = req.params[param];
      if (!value || typeof value !== "string" || !UUID_REGEX.test(value)) {
        return next(createHttpError(400, `Invalid ${param} format`));
      }
    }
    next();
  };
}
