import { describe, it, expect } from "vitest";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "../constants";

describe("constants", () => {
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
