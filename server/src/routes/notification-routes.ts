import { Router, Request, Response, NextFunction } from "express";
import prisma from "../db";
import { authenticateToken } from "../middleware/auth-middleware";
import { createHttpError } from "../helpers/create-error";

export const notificationRouter = Router();
notificationRouter.use(authenticateToken);

const NOTIFICATION_LIMIT = 50;

/** GET / — list the user's most recent notifications. */
notificationRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_LIMIT,
    });
    res.json(notifications);
  } catch (error) {
    next(error);
  }
});

/** PATCH /:notificationId/read — mark a single notification as read. */
notificationRouter.patch("/:notificationId/read", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notificationId = req.params.notificationId as string;
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: req.userId },
    });

    if (!notification) {
      throw createHttpError(404, "Notification not found.");
    }

    const updated = await prisma.notification.update({
      where: { id: notification.id },
      data: { isRead: true },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/** GET /unread-count — count of unread notifications for the user. */
notificationRouter.get("/unread-count", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.userId, isRead: false },
    });
    res.json({ unreadCount: count });
  } catch (error) {
    next(error);
  }
});
