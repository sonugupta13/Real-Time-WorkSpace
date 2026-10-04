import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/token";
import prisma from "../config/db";

// Extend Express Request type to include authenticated user
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Authorization token missing or malformed",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User account associated with this token no longer exists",
      });
      return;
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        error: "TokenExpired",
        message: "Access token has expired. Please refresh your token.",
      });
      return;
    }

    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid access token",
    });
  }
}
