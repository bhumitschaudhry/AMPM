import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { authRouter } from "../routes/auth-routes";
import { errorHandler } from "../middleware/error-handler";

// In-memory user store that mimics the bits of Prisma we exercise.
const userStore: { users: any[] } = { users: [] };
vi.mock("../db", () => ({
  default: {
    user: {
      findUnique: vi.fn(({ where }: any) =>
        Promise.resolve(
          userStore.users.find(
            (user) =>
              user.email === where.email ||
              user.id === where.id ||
              user.clerkUserId === where.clerkUserId,
          ) || null,
        ),
      ),
      create: vi.fn(({ data }: any) => {
        const user = {
          id: "u-" + Math.random(),
          email: data.email,
          clerkUserId: data.clerkUserId ?? null,
          passwordHash: data.passwordHash,
          tokenVersion: 0,
        };
        userStore.users.push(user);
        return Promise.resolve(user);
      }),
      update: vi.fn(({ where, data }: any) => {
        const user = userStore.users.find((item) => item.id === where.id)!;
        if (data.tokenVersion?.increment) {
          user.tokenVersion += data.tokenVersion.increment;
        }
        return Promise.resolve(user);
      }),
    },
  },
}));

const { verifyTokenMock, getUserMock } = vi.hoisted(() => ({
  verifyTokenMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  verifyToken: verifyTokenMock,
  createClerkClient: vi.fn(() => ({
    users: {
      getUser: getUserMock,
    },
  })),
}));

type TestUser = {
  id: string;
  email: string;
  passwordHash: string | null;
  tokenVersion: number;
  clerkUserId?: string | null;
};

function addUser(user: TestUser) {
  userStore.users.push({
    clerkUserId: null,
    ...user,
  });
}

function mockVerifiedClerkIdentity(identity: { userId: string; email?: string }) {
  verifyTokenMock.mockResolvedValue({
    sub: identity.userId,
    email: identity.email,
  });
}

function addPasswordUser() {
  addUser({
    id: "password-user",
    email: "user@example.com",
    passwordHash: "hashed-password",
    tokenVersion: 0,
  });
}

function addOAuthOnlyUser() {
  addUser({
    id: "oauth-only-user",
    email: "oauth@example.com",
    clerkUserId: "clerk_oauth_user",
    passwordHash: null,
    tokenVersion: 0,
  });
}

let server: Server;
let baseUrl: string;

beforeEach(() => {
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
  process.env.CLERK_SECRET_KEY = "test_clerk_secret";
  userStore.users = [];
  verifyTokenMock.mockReset();
  getUserMock.mockReset();
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  app.use(errorHandler);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}/api/auth`;
});

afterAll(() => server?.close());

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResponse extends TokenPair {
  user: { id: string; email: string };
}

async function signup(): Promise<TokenPair> {
  const res = await fetch(`${baseUrl}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "secret123" }),
  });
  return (await res.json()) as TokenPair;
}

describe("POST /clerk", () => {
  it("rejects a missing Clerk bearer token with 401", async () => {
    const response = await fetch(`${baseUrl}/clerk`, {
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  it("rejects an invalid Clerk token with 401", async () => {
    verifyTokenMock.mockRejectedValue(new Error("invalid token"));

    const response = await fetch(`${baseUrl}/clerk`, {
      method: "POST",
      headers: {
        Authorization: "Bearer bad-token",
      },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.any(String),
    });
  });

  it("creates an OAuth-only user from a verified Clerk identity", async () => {
    mockVerifiedClerkIdentity({
      userId: "clerk_user_123",
      email: "oauth@example.com",
    });

    const response = await fetch(`${baseUrl}/clerk`, {
      method: "POST",
      headers: {
        Authorization: "Bearer clerk-session-token",
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as AuthResponse;
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.user).toMatchObject({
      email: "oauth@example.com",
    });
    expect(body.user.id).toEqual(expect.any(String));
  });

  it("returns the existing user for a known Clerk identity", async () => {
    addUser({
      id: "existing-clerk-user",
      email: "existing@example.com",
      clerkUserId: "clerk_known_user",
      passwordHash: null,
      tokenVersion: 2,
    });
    mockVerifiedClerkIdentity({
      userId: "clerk_known_user",
      email: "ignored@example.com",
    });

    const response = await fetch(`${baseUrl}/clerk`, {
      method: "POST",
      headers: {
        Authorization: "Bearer known-session-token",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: {
        id: "existing-clerk-user",
        email: "existing@example.com",
      },
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
  });

  it("rejects a verified email that belongs to a password account with 409", async () => {
    addPasswordUser();
    mockVerifiedClerkIdentity({
      userId: "clerk_conflict_user",
      email: "user@example.com",
    });

    const response = await fetch(`${baseUrl}/clerk`, {
      method: "POST",
      headers: {
        Authorization: "Bearer conflict-token",
      },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "An AMPM account already exists for this email. Sign in with email and password.",
    });
  });
});

describe("login", () => {
  it("rejects local login for an OAuth-only user", async () => {
    addOAuthOnlyUser();

    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "oauth@example.com", password: "secret123" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid email or password.",
    });
  });
});

describe("refresh token rotation + revocation", () => {
  it("rotates the refresh token on /refresh and rejects the old one", async () => {
    const { refreshToken } = await signup();

    const first = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as TokenPair;
    expect(firstBody.accessToken).toBeTypeOf("string");
    expect(firstBody.refreshToken).toBeTypeOf("string");

    const newVersion = (jwt.verify(firstBody.refreshToken, "test_refresh_secret") as any).tokenVersion;
    expect(newVersion).toBe(1);

    // The original (now-revoked) refresh token must be rejected.
    const replay = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(replay.status).toBe(401);
  });

  it("revokes refresh tokens via /logout", async () => {
    const { refreshToken } = await signup();

    const refresh = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const { refreshToken: rotated } = (await refresh.json()) as TokenPair;

    const logout = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt.sign({ userId: userStore.users[0].id, email: "user@example.com", tokenVersion: 1 }, "test_jwt_secret", { expiresIn: "15m" })}`,
      },
    });
    expect(logout.status).toBe(200);

    // The rotated token is now revoked too.
    const afterLogout = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rotated }),
    });
    expect(afterLogout.status).toBe(401);
  });
});
