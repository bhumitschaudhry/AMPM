import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createHttpError } from "../helpers/create-error";
import { recordTokenAnalysis } from "../telemetry";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

interface JwtPayload {
  userId: string;
  email: string;
}

/** Verify JWT from Authorization header and attach userId to the request. */
export function authenticateToken(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    recordTokenAnalysis("jwt", false, 0);
    return next(createHttpError(401, "Authorization token is required. Send a Bearer token in the Authorization header."));
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    recordTokenAnalysis("jwt", false, 0);
    return next(createHttpError(500, "JWT_SECRET is not configured on the server."));
  }

  const startTime = Date.now();
  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.userId = decoded.userId;
    recordTokenAnalysis("jwt", true, Date.now() - startTime);
    next();
  } catch {
    recordTokenAnalysis("jwt", false, Date.now() - startTime);
    next(createHttpError(401, "Access token is invalid or expired. Please log in again."));
  }
}

