import { Request, Response, NextFunction } from "express";

/** Central error handler — catches all unhandled errors from routes. */
export function errorHandler(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500
    ? "Internal server error. Please try again later."
    : err.message;

  console.error(`[ERROR] ${err.message}`, err.stack);

  res.status(statusCode).json({ error: message });
}
