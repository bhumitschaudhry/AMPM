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

/** Generate access + refresh token pair for a user. */
function generateTokens(userId: string, email: string) {
  const accessOptions: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as SignOptions["expiresIn"] };
  const refreshOptions: SignOptions = { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || "7d") as SignOptions["expiresIn"] };

  const accessToken = jwt.sign({ userId, email }, process.env.JWT_SECRET!, accessOptions);
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, refreshOptions);
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

    const tokens = generateTokens(user.id, user.email);
    res.status(201).json({ ...tokens, user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

/** POST /login — authenticate and return tokens. */
authRouter.post("/login", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createHttpError(400, "Email and password are required.");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw createHttpError(401, "Invalid email or password.");
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw createHttpError(401, "Invalid email or password.");
    }

    const tokens = generateTokens(user.id, user.email);
    res.json({ ...tokens, user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

/** POST /refresh — exchange a valid refresh token for a new access token. */
authRouter.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw createHttpError(400, "Refresh token is required.");
    }

    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw createHttpError(500, "JWT_REFRESH_SECRET is not configured on the server.");
    }

    const decoded = jwt.verify(refreshToken, secret) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      throw createHttpError(401, "User no longer exists. Please sign up again.");
    }

    const accessOptions: SignOptions = { expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as SignOptions["expiresIn"] };
    const accessToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET!, accessOptions);

    res.json({ accessToken });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(createHttpError(401, "Refresh token is invalid or expired."));
    }
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
