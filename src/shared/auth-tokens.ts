import crypto from "node:crypto";
import jwt, { type Secret, type SignOptions, type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";

type JwtBasePayload = {
  email: string;
  role: string;
};

const accessSecret: Secret = env.JWT_ACCESS_SECRET;
const refreshSecret: Secret = env.JWT_REFRESH_SECRET;

const accessExpiresIn = env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"];
const refreshExpiresIn = env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"];

export function generateAccessToken(payload: JwtBasePayload, userId: string) {
  const options: SignOptions = {
    subject: userId,
    expiresIn: accessExpiresIn,
  };

  return jwt.sign(payload, accessSecret, options);
}

export function generateRefreshToken(payload: JwtBasePayload, userId: string) {
  const options: SignOptions = {
    subject: userId,
    expiresIn: refreshExpiresIn,
    jwtid: crypto.randomUUID(),
  };

  return jwt.sign(payload, refreshSecret, options);
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, accessSecret) as JwtPayload & JwtBasePayload;
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, refreshSecret) as JwtPayload & JwtBasePayload;
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getRefreshTokenExpirationDate() {
  const now = new Date();
  const raw = env.JWT_REFRESH_EXPIRES_IN.trim().toLowerCase();

  const match = raw.match(/^(\d+)([smhd])$/);

  if (!match) {
    throw new Error("JWT_REFRESH_EXPIRES_IN inválido. Use formatos como 15m, 7d.");
  }

  const value = Number(match[1]);
  const unit = match[2];

  if (unit === "s") now.setSeconds(now.getSeconds() + value);
  if (unit === "m") now.setMinutes(now.getMinutes() + value);
  if (unit === "h") now.setHours(now.getHours() + value);
  if (unit === "d") now.setDate(now.getDate() + value);

  return now;
}
