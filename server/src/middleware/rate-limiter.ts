import rateLimit from "express-rate-limit";

/**
 * Rate limiter for image upload endpoints.
 * Limits each user to 10 upload requests per 15 minutes.
 * Uses the authenticated userId (from req.userId) when available,
 * falls back to IP address for unauthenticated requests.
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 upload requests per window
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? req.ip ?? "unknown",
  message: {
    error: "Too many upload requests. Please try again later.",
  },
});

/**
 * Rate limiter for retry endpoints.
 * Limits each user to 20 retry requests per 15 minutes.
 */
export const retryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? req.ip ?? "unknown",
  message: {
    error: "Too many retry requests. Please try again later.",
  },
});
