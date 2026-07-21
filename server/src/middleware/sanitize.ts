import { Request, Response, NextFunction } from "express";
import xss from "xss";

/**
 * Recursively sanitize all string values in an object.
 */
function sanitizeObject(obj: unknown): unknown {
  if (typeof obj === "string") {
    return xss(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  if (obj && typeof obj === "object" && obj.constructor === Object) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Middleware to sanitize request body, query, and params against XSS attacks.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query && typeof req.query === "object") {
    req.query = sanitizeObject(req.query) as typeof req.query;
  }
  
  if (req.params && typeof req.params === "object") {
    req.params = sanitizeObject(req.params) as typeof req.params;
  }
  
  next();
}
