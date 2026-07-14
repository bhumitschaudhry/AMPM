import { describe, it, expect, vi } from "vitest";
import { errorHandler } from "../middleware/error-handler";

function mockReq() {
  return {} as any;
}
function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("errorHandler", () => {
  it("returns 500 with generic message when error has no statusCode", () => {
    const err = new Error("Something went wrong");
    const res = mockRes();
    errorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "Internal server error. Please try again later." });
  });

  it("returns the error's statusCode and message when present", () => {
    const err = Object.assign(new Error("Not found"), { statusCode: 404 });
    const res = mockRes();
    errorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Not found" });
  });

  it("returns 400 with error message", () => {
    const err = Object.assign(new Error("Validation failed"), { statusCode: 400 });
    const res = mockRes();
    errorHandler(err, mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Validation failed" });
  });
});
