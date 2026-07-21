import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const userIdOrIpKey = (req: { userId?: string; ip?: string }) =>
  req.userId ?? ipKeyGenerator(req.ip ?? "unknown");

export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userIdOrIpKey,
  message: {
    error: "Too many upload requests. Please try again later.",
  },
});

export const retryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userIdOrIpKey,
  message: {
    error: "Too many retry requests. Please try again later.",
  },
});

const ipKeyGen = (req: { ip?: string }) => ipKeyGenerator(req.ip ?? "unknown");

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGen,
  message: {
    error: "Too many login attempts. Please try again later.",
  },
});

export const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGen,
  message: {
    error: "Too many signup attempts. Please try again later.",
  },
});

export const googleAuthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGen,
  message: {
    error: "Too many Google sign-in attempts. Please try again later.",
  },
});

export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGen,
  message: {
    error: "Too many refresh requests. Please try again later.",
  },
});

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: ipKeyGen,
  message: {
    error: "Too many requests. Please slow down.",
  },
});
