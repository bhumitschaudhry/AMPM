import { describe, it, expect } from "vitest";
import { FAILURE_REASONS, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "../constants";

describe("constants", () => {
  it("FAILURE_REASONS has all expected keys", () => {
    expect(Object.keys(FAILURE_REASONS)).toEqual([
      "INVALID_FILE",
      "UNSUPPORTED_FORMAT",
      "FILE_TOO_LARGE",
      "AI_PROVIDER_TIMEOUT",
      "AI_PROVIDER_ERROR",
      "AI_PROVIDER_RATE_LIMITED",
      "INTERNAL_ERROR",
      "MAX_RETRIES_EXCEEDED",
    ]);
  });

  it("FAILURE_REASONS values are non-empty strings", () => {
    for (const key of Object.keys(FAILURE_REASONS)) {
      expect(typeof FAILURE_REASONS[key as keyof typeof FAILURE_REASONS]).toBe("string");
      expect(FAILURE_REASONS[key as keyof typeof FAILURE_REASONS].length).toBeGreaterThan(0);
    }
  });

  it("ALLOWED_MIME_TYPES contains jpeg, png, and webp", () => {
    expect(ALLOWED_MIME_TYPES).toContain("image/jpeg");
    expect(ALLOWED_MIME_TYPES).toContain("image/png");
    expect(ALLOWED_MIME_TYPES).toContain("image/webp");
    expect(ALLOWED_MIME_TYPES).toHaveLength(3);
  });

  it("MAX_FILE_SIZE_BYTES is 5MB", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});
