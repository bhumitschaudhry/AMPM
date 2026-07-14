import { describe, it, expect, vi } from "vitest";

// Mock queue BEFORE importing jobRouter to prevent Redis connection.
// Factory must avoid referencing `vi` since vi.mock is hoisted above imports.
vi.mock("../queue", () => {
  const mockQueue = { add: () => Promise.resolve(undefined) };
  return {
    IMAGE_QUEUE_NAME: "image-processing",
    imageQueue: mockQueue,
  };
});

import { jobRouter } from "../routes/job-routes";

describe("jobRouter", () => {
  it("is an Express Router", () => {
    expect(jobRouter).toBeDefined();
    expect(typeof jobRouter).toBe("function");
  });

  it("has POST / route (create job)", () => {
    const stack = (jobRouter as any).stack;
    const route = stack.find((l: any) => l.route?.path === "/");
    expect(route).toBeDefined();
    expect(route.route.methods).toEqual({ post: true });
  });

  it("has GET / route (list jobs)", () => {
    const stack = (jobRouter as any).stack;
    const route = stack.find((l: any) => l.route?.path === "/" && l.route.methods.get);
    expect(route).toBeDefined();
  });

  it("has GET /:jobId route (job detail)", () => {
    const stack = (jobRouter as any).stack;
    const route = stack.find((l: any) => l.route?.path === "/:jobId" && l.route.methods.get);
    expect(route).toBeDefined();
  });

  it("has GET /:jobId/images/:imageId/file route", () => {
    const stack = (jobRouter as any).stack;
    const route = stack.find((l: any) => l.route?.path === "/:jobId/images/:imageId/file");
    expect(route).toBeDefined();
    expect(route.route.methods).toEqual({ get: true });
  });

  it("has POST /:jobId/images/:imageId/retry route", () => {
    const stack = (jobRouter as any).stack;
    const route = stack.find((l: any) => l.route?.path === "/:jobId/images/:imageId/retry");
    expect(route).toBeDefined();
    expect(route.route.methods).toEqual({ post: true });
  });
});
