import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { jwtConfig } from "../config/jwt";

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
}

// Password hashing
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Token generation
export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, jwtConfig.accessSecret, {
    expiresIn: jwtConfig.accessExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, jwtConfig.refreshSecret, {
    expiresIn: jwtConfig.refreshExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

// Token verification
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, jwtConfig.accessSecret) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, jwtConfig.refreshSecret) as RefreshTokenPayload;
}
