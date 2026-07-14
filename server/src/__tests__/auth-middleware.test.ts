import { describe, it, expect, vi, beforeEach } from "vitest";
import { authenticateToken } from "../middleware/auth-middleware";
import jwt from "jsonwebtoken";

function mockReq(authHeader?: string) {
  return { headers: { authorization: authHeader } } as any;
}
function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("authenticateToken", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.JWT_SECRET;
  });

  it("returns 401 when no Authorization header is present", () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/token/i);
  });

  it("returns 401 when token is not Bearer format", () => {
    const req = mockReq("Basic some_token");
    const res = mockRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it("returns 500 when JWT_SECRET is not configured", () => {
    process.env.JWT_SECRET = "";
    const req = mockReq("Bearer some.jwt.token");
    const res = mockRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(500);
    expect(err.message).toMatch(/JWT_SECRET/i);
  });

  it("returns 401 when token is invalid", () => {
    process.env.JWT_SECRET = "test_secret";
    vi.spyOn(jwt, "verify").mockImplementation(() => {
      throw new Error("jwt malformed");
    });

    const req = mockReq("Bearer invalid.jwt.token");
    const res = mockRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toMatch(/invalid|expired/i);
  });

  it("sets req.userId and calls next() when token is valid", () => {
    process.env.JWT_SECRET = "test_secret";
    vi.spyOn(jwt, "verify").mockReturnValue({ userId: "user-123", email: "a@b.com" });

    const req = mockReq("Bearer valid.jwt.token");
    const res = mockRes();
    const next = vi.fn();

    authenticateToken(req, res, next);

    expect(req.userId).toBe("user-123");
    expect(next).toHaveBeenCalledWith();
  });
});
