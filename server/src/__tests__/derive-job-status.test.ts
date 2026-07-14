import { describe, it, expect } from "vitest";
import { deriveJobStatus } from "../constants";

describe("deriveJobStatus", () => {
  it("returns 'pending' for an empty array", () => {
    expect(deriveJobStatus([])).toBe("pending");
  });

  it("returns 'pending' when all images are PENDING", () => {
    expect(deriveJobStatus(["PENDING", "PENDING", "PENDING"])).toBe("pending");
  });

  it("returns 'processing' when mix of PENDING and PROCESSING", () => {
    expect(deriveJobStatus(["PENDING", "PROCESSING"])).toBe("processing");
  });

  it("returns 'processing' when some COMPLETED but others still PENDING", () => {
    expect(deriveJobStatus(["COMPLETED", "PENDING"])).toBe("processing");
  });

  it("returns 'completed' when all images are COMPLETED", () => {
    expect(deriveJobStatus(["COMPLETED", "COMPLETED"])).toBe("completed");
  });

  it("returns 'failed' when all images are FAILED", () => {
    expect(deriveJobStatus(["FAILED", "FAILED"])).toBe("failed");
  });

  it("returns 'partially_completed' when mix of COMPLETED and FAILED (no pending/processing)", () => {
    expect(deriveJobStatus(["COMPLETED", "FAILED", "COMPLETED"])).toBe("partially_completed");
  });

  it("returns 'processing' when FAILED mixed with still-in-progress images", () => {
    expect(deriveJobStatus(["FAILED", "PROCESSING", "COMPLETED"])).toBe("processing");
  });
});
