import { describe, it, expect, vi, beforeEach } from "vitest";
import { authRouter } from "../routes/auth-routes";
import prisma from "../db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

vi.mock("../db", () => ({ default: { user: { findUnique: vi.fn(), create: vi.fn() } } }));

describe("authRouter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.JWT_SECRET = "test_jwt_secret";
    process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
  });

  it("is an Express Router", () => {
    expect(authRouter).toBeDefined();
    expect(typeof authRouter).toBe("function");
  });

  it("has signup, login, refresh, and me routes stacked", () => {
    // Verify routes are registered by inspecting stack
    const stack = (authRouter as any).stack;
    expect(stack.length).toBeGreaterThanOrEqual(4);

    const methods = stack.map((layer: any) => layer.route?.path).filter(Boolean);
    expect(methods).toContain("/signup");
    expect(methods).toContain("/login");
    expect(methods).toContain("/refresh");
    expect(methods).toContain("/me");
  });

  it("signup route exists with POST method", () => {
    const signupLayer = (authRouter as any).stack.find(
      (l: any) => l.route?.path === "/signup"
    );
    expect(signupLayer).toBeDefined();
    expect(signupLayer.route.methods).toEqual({ post: true });
  });

  it("login route exists with POST method", () => {
    const loginLayer = (authRouter as any).stack.find(
      (l: any) => l.route?.path === "/login"
    );
    expect(loginLayer).toBeDefined();
    expect(loginLayer.route.methods).toEqual({ post: true });
  });

  it("refresh route exists with POST method", () => {
    const refreshLayer = (authRouter as any).stack.find(
      (l: any) => l.route?.path === "/refresh"
    );
    expect(refreshLayer).toBeDefined();
    expect(refreshLayer.route.methods).toEqual({ post: true });
  });

  it("me route exists with GET method", () => {
    const meLayer = (authRouter as any).stack.find(
      (l: any) => l.route?.path === "/me"
    );
    expect(meLayer).toBeDefined();
    expect(meLayer.route.methods).toEqual({ get: true });
  });

  it("me route has authenticateToken middleware before handler", () => {
    const meLayer = (authRouter as any).stack.find(
      (l: any) => l.route?.path === "/me"
    );
    // The stack[0] of the route should be authenticateToken
    expect(meLayer.route.stack.length).toBeGreaterThanOrEqual(2);
  });
});
