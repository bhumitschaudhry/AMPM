import "./telemetry";
import dotenv from "dotenv";
dotenv.config();

// Fail closed: never start with guessable or missing signing keys.
for (const key of ["JWT_SECRET", "JWT_REFRESH_SECRET"] as const) {
  if (!process.env[key]) {
    console.error(`FATAL: Required environment variable ${key} is not set. Refusing to start.`);
    process.exit(1);
  }
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter } from "./routes/auth-routes";
import { jobRouter } from "./routes/job-routes";
import { notificationRouter } from "./routes/notification-routes";
import { swaggerRouter } from "./routes/swagger-routes";
import { errorHandler } from "./middleware/error-handler";
import { sanitizeInput } from "./middleware/sanitize";
import { globalRateLimiter } from "./middleware/rate-limiter";
import { stopQueueDepthMetrics } from "./queue-metrics";

const app = express();
const PORT = process.env.PORT || 3001;

// Strip path so CORS origin comparison never fails due to misconfigured CLIENT_URL with a path.
const originUrl = process.env.CLIENT_URL || "http://localhost:5173";
let corsOrigin: string;
try { corsOrigin = new URL(originUrl).origin; }
catch { corsOrigin = originUrl; }

app.use(cors({
  origin: corsOrigin,
  credentials: true,
}));

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Parse JSON with explicit size limit
app.use(express.json({ limit: "1mb" }));

// Sanitize all incoming data against XSS
app.use(sanitizeInput);

// Allow the Google OAuth popup to post messages back to this page.
// The default COOP same-origin policy blocks cross-origin window.postMessage.
app.use((_req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  next();
});

// Health check — must come before global rate limiter so monitoring tools are never blocked.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global fallback rate limiter — broad per-IP safety net for all routes.
// Route-specific limiters (upload, retry, login, etc.) fire first inside each router.
app.use(globalRateLimiter);

// Routes
app.use("/api/auth", authRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api-docs", swaggerRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`AMPM Server running on port ${PORT}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`[server] Received ${signal}, shutting down gracefully`);
    stopQueueDepthMetrics();
    process.exit(0);
  });
}

export default app;
