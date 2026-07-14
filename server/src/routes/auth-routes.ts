import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import prisma from "../db";
import { authenticateToken } from "../middleware/auth-middleware";
import { createHttpError } from "../helpers/create-error";

export const authRouter = Router();

const BCRYPT_ROUNDS = 12;

const signupSchema = z.object({
  email: z.string().email("A valid email address is required."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

// Login validates the same shape (email format + password present) as signup.
export const loginSchema = signupSchema;

/** Generate access + refresh token pair for a user, binding it to their token version. */
function generateTokens(userId: string, email: string, tokenVersion: number) {
  const jwtSecret = process.env.JWT_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!jwtSecret || !refreshSecret) {
    throw createHttpError(500, "JWT secrets are not configured on the server.");
  }

  const accessOptions: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as SignOptions["expiresIn"] };
  const refreshOptions: SignOptions = { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as SignOptions["expiresIn"] };

  const accessToken = jwt.sign({ userId, email, tokenVersion }, jwtSecret, accessOptions);
  const refreshToken = jwt.sign({ userId, tokenVersion }, refreshSecret, refreshOptions);
  return { accessToken, refreshToken };
}

/** POST /signup — register a new user and return tokens. */
authRouter.post("/signup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, parsed.error.errors[0].message);
    }

    const { email, password } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw createHttpError(409, "An account with this email already exists.");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({ data: { email, passwordHash } });

    const tokens = generateTokens(user.id, user.email, user.tokenVersion);
    res.status(201).json({ ...tokens, user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

/** POST /login — authenticate and return tokens. */
authRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createHttpError(400, parsed.error.errors[0].message);
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw createHttpError(401, "Invalid email or password.");
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw createHttpError(401, "Invalid email or password.");
    }

    const tokens = generateTokens(user.id, user.email, user.tokenVersion);
    res.json({ ...tokens, user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /refresh — rotate the refresh token and issue a new access token.
 * The presented refresh token's embedded tokenVersion must match the user's current
 * version; otherwise it has been revoked (e.g. by logout) and is rejected.
 */
authRouter.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw createHttpError(400, "Refresh token is required.");
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    const accessSecret = process.env.JWT_SECRET;
    if (!refreshSecret || !accessSecret) {
      throw createHttpError(500, "JWT secrets are not configured on the server.");
    }

    let decoded: { userId: string; tokenVersion: number };
    try {
      decoded = jwt.verify(refreshToken, refreshSecret) as { userId: string; tokenVersion: number };
    } catch {
      throw createHttpError(401, "Refresh token is invalid or expired.");
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      throw createHttpError(401, "User no longer exists. Please sign up again.");
    }
    if (user.tokenVersion !== decoded.tokenVersion) {
      throw createHttpError(401, "Refresh token has been revoked. Please sign in again.");
    }

    // Rotate: bump the version so the old refresh token can no longer be used.
    const rotated = await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });

    const accessOptions: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as SignOptions["expiresIn"] };
    const refreshOptions: SignOptions = { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as SignOptions["expiresIn"] };

    const newAccessToken = jwt.sign(
      { userId: rotated.id, email: rotated.email, tokenVersion: rotated.tokenVersion },
      accessSecret,
      accessOptions,
    );
    const newRefreshToken = jwt.sign(
      { userId: rotated.id, tokenVersion: rotated.tokenVersion },
      refreshSecret,
      refreshOptions,
    );

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(createHttpError(401, "Refresh token is invalid or expired."));
    }
    next(error);
  }
});

/** POST /logout — revoke the user's refresh tokens by bumping their token version. */
authRouter.post("/logout", authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: { tokenVersion: { increment: 1 } },
    });
    res.json({ message: "Logged out successfully." });
  } catch (error) {
    next(error);
  }
});

/** GET /me — return the authenticated user's profile. */
authRouter.get("/me", authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      throw createHttpError(404, "User not found.");
    }
    res.json({ id: user.id, email: user.email });
  } catch (error) {
    next(error);
  }
});
