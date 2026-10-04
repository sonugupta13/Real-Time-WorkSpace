import { Request, Response } from "express";
import crypto from "crypto";
import prisma from "../config/db";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/token";
import { jwtConfig } from "../config/jwt";

// Helper to calculate refresh token expiration date
function getRefreshExpiryDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() + jwtConfig.refreshDurationDays);
  return date;
}

export async function signup(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, name } = req.body;

    // Basic Input Validations
    if (!email || !password || !name) {
      res.status(400).json({
        error: "BadRequest",
        message: "Email, password, and name are required fields",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        error: "BadRequest",
        message: "Invalid email format provided",
      });
      return;
    }

    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({
        error: "BadRequest",
        message: "Password must be at least 8 characters long",
      });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      res.status(409).json({
        error: "Conflict",
        message: "An account with this email address already exists",
      });
      return;
    }

    // Securely hash password
    const passwordHash = await hashPassword(password);

    // Create user in database
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        name: name.trim(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    // Create Refresh Token session in database
    const tokenIdentifier = crypto.randomUUID();
    const expiresAt = getRefreshExpiryDate();

    const dbRefreshToken = await prisma.refreshToken.create({
      data: {
        token: tokenIdentifier,
        userId: user.id,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        expiresAt,
      },
    });

    // Issue JWT tokens
    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, tokenId: dbRefreshToken.id });

    res.status(201).json({
      message: "User registered successfully",
      user,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: jwtConfig.accessExpiresIn,
      },
    });
  } catch (error: any) {
    console.error("[Auth] Signup error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "An error occurred during account creation",
    });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: "BadRequest",
        message: "Email and password are required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid email or password",
      });
      return;
    }

    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid email or password",
      });
      return;
    }

    // Create Refresh Token record
    const tokenIdentifier = crypto.randomUUID();
    const expiresAt = getRefreshExpiryDate();

    const dbRefreshToken = await prisma.refreshToken.create({
      data: {
        token: tokenIdentifier,
        userId: user.id,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        expiresAt,
      },
    });

    // Generate JWT access and refresh tokens
    const accessToken = generateAccessToken({ userId: user.id, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id, tokenId: dbRefreshToken.id });

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: jwtConfig.accessExpiresIn,
      },
    });
  } catch (error: any) {
    console.error("[Auth] Login error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "An error occurred during login",
    });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: "BadRequest",
        message: "Refresh token is required",
      });
      return;
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired refresh token signature",
      });
      return;
    }

    // Look up token in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { id: decoded.tokenId },
    });

    // Refresh Token Reuse Detection
    if (!storedToken || storedToken.isRevoked) {
      // Security measure: Revoke all tokens for this user if token reuse/theft is suspected
      if (storedToken) {
        await prisma.refreshToken.updateMany({
          where: { userId: storedToken.userId },
          data: { isRevoked: true },
        });
      }
      res.status(401).json({
        error: "Unauthorized",
        message: "Refresh token has been revoked or reused. Session invalidated.",
      });
      return;
    }

    // Check expiration against database record
    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { isRevoked: true },
      });
      res.status(401).json({
        error: "Unauthorized",
        message: "Refresh token has expired. Please login again.",
      });
      return;
    }

    // Verify user is still active
    const user = await prisma.user.findUnique({
      where: { id: storedToken.userId },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "User account no longer exists",
      });
      return;
    }

    // Refresh Token Rotation: Revoke previous token
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Create a new rotated refresh token
    const newIdentifier = crypto.randomUUID();
    const newExpiresAt = getRefreshExpiryDate();

    const newDbToken = await prisma.refreshToken.create({
      data: {
        token: newIdentifier,
        userId: user.id,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
        expiresAt: newExpiresAt,
      },
    });

    const newAccessToken = generateAccessToken({ userId: user.id, email: user.email });
    const rotatedRefreshToken = generateRefreshToken({
      userId: user.id,
      tokenId: newDbToken.id,
    });

    res.status(200).json({
      message: "Tokens rotated successfully",
      tokens: {
        accessToken: newAccessToken,
        refreshToken: rotatedRefreshToken,
        expiresIn: jwtConfig.accessExpiresIn,
      },
    });
  } catch (error: any) {
    console.error("[Auth] Refresh error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to refresh token",
    });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        await prisma.refreshToken.update({
          where: { id: decoded.tokenId },
          data: { isRevoked: true },
        });
      } catch {
        // Continue logout even if token verification fails
      }
    }

    // If request has an authenticated user, optionally revoke current active tokens
    if (req.user?.id && !refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { userId: req.user.id },
        data: { isRevoked: true },
      });
    }

    res.status(200).json({
      message: "Logged out successfully. Session revoked.",
    });
  } catch (error: any) {
    console.error("[Auth] Logout error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "An error occurred during logout",
    });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({
        error: "NotFound",
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      user,
    });
  } catch (error: any) {
    console.error("[Auth] getMe error:", error.message);
    res.status(500).json({
      error: "InternalServerError",
      message: "Failed to fetch user profile",
    });
  }
}
