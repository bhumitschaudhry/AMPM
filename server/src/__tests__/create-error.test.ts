import { describe, it, expect } from "vitest";
import { createHttpError } from "../helpers/create-error";

describe("createHttpError", () => {
  it("creates an error with the given status code and message", () => {
    const err = createHttpError(404, "Not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("Not found");
  });

  it("works with 500 status code", () => {
    const err = createHttpError(500, "Server error");
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe("Server error");
  });
});
