import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth-routes";
import { jobRouter } from "./routes/job-routes";
import { notificationRouter } from "./routes/notification-routes";
import { swaggerRouter } from "./routes/swagger-routes";
import { errorHandler } from "./middleware/error-handler";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
}));

app.use(express.json());

// Routes
app.use("/api/auth", authRouter);
app.use("/api/jobs", jobRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api-docs", swaggerRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`AMPM Server running on port ${PORT}`);
});

export default app;
