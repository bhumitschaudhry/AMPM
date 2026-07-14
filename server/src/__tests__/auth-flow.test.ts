import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { authRouter } from "../routes/auth-routes";

// In-memory user store that mimics the bits of Prisma we exercise.
const userStore: { users: any[] } = { users: [] };
vi.mock("../db", () => ({
  default: {
    user: {
      findUnique: vi.fn(({ where }: any) =>
        Promise.resolve(
          userStore.users.find((u) => u.email === where.email || u.id === where.id) || null,
        ),
      ),
      create: vi.fn(({ data }: any) => {
        const u = { id: "u-" + Math.random(), email: data.email, passwordHash: data.passwordHash, tokenVersion: 0 };
        userStore.users.push(u);
        return Promise.resolve(u);
      }),
      update: vi.fn(({ where, data }: any) => {
        const u = userStore.users.find((x) => x.id === where.id)!;
        if (data.tokenVersion?.increment) u.tokenVersion += data.tokenVersion.increment;
        return Promise.resolve(u);
      }),
    },
  },
}));

let server: Server;
let baseUrl: string;

beforeEach(() => {
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.JWT_REFRESH_SECRET = "test_refresh_secret";
  userStore.users = [];
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as any).port}/api/auth`;
});

afterAll(() => server?.close());

async function signup() {
  const res = await fetch(`${baseUrl}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "secret123" }),
  });
  return res.json();
}

describe("refresh token rotation + revocation", () => {
  it("rotates the refresh token on /refresh and rejects the old one", async () => {
    const { refreshToken } = await signup();

    const first = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
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
    const { refreshToken: rotated } = await refresh.json();

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
