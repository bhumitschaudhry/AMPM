import { describe, it, expect } from "vitest";
import { notificationRouter } from "../routes/notification-routes";

describe("notificationRouter", () => {
  it("is an Express Router", () => {
    expect(notificationRouter).toBeDefined();
    expect(typeof notificationRouter).toBe("function");
  });

  it("has GET / route", () => {
    const stack = (notificationRouter as any).stack;
    const route = stack.find((l: any) => l.route?.path === "/");
    expect(route).toBeDefined();
    expect(route.route.methods).toEqual({ get: true });
  });

  it("has PATCH /:notificationId/read route", () => {
    const stack = (notificationRouter as any).stack;
    const route = stack.find((l: any) => l.route?.path === "/:notificationId/read");
    expect(route).toBeDefined();
    expect(route.route.methods).toEqual({ patch: true });
  });

  it("has GET /unread-count route", () => {
    const stack = (notificationRouter as any).stack;
    const route = stack.find((l: any) => l.route?.path === "/unread-count");
    expect(route).toBeDefined();
    expect(route.route.methods).toEqual({ get: true });
  });
});
