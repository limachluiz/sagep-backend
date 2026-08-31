import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { getRefreshTokenExpirationDate } from "./auth-tokens.js";

const cookieOptions = () => ({
  httpOnly: true,
  secure: env.AUTH_COOKIE_SECURE,
  sameSite: "strict" as const,
  path: "/api/auth",
});

export function getRefreshTokenCookie(req: Request) {
  const rawCookie = req.get("cookie");
  if (!rawCookie) return undefined;

  for (const pair of rawCookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if (name !== env.AUTH_REFRESH_COOKIE_NAME) continue;

    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function setRefreshTokenCookie(
  res: Response,
  refreshToken: string,
  persistent = env.AUTH_REFRESH_COOKIE_PERSISTENT,
) {
  res.cookie(env.AUTH_REFRESH_COOKIE_NAME, refreshToken, {
    ...cookieOptions(),
    ...(persistent
      ? { expires: getRefreshTokenExpirationDate() }
      : {}),
  });
}

export function clearRefreshTokenCookie(res: Response) {
  res.clearCookie(env.AUTH_REFRESH_COOKIE_NAME, cookieOptions());
}
