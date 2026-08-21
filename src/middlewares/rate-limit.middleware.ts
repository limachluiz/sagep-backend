import type { Request, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

function handler(_req: Request, res: Response) {
  return res.status(429).json({
    code: "TOO_MANY_REQUESTS",
    message: "Muitas tentativas. Aguarde antes de tentar novamente.",
    requestId: String(res.locals.requestId ?? "unavailable"),
  });
}

const sharedOptions = {
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  standardHeaders: "draft-8" as const,
  legacyHeaders: false,
  handler,
  skip: () => env.NODE_ENV === "test",
};

export const apiRateLimiter = rateLimit({
  ...sharedOptions,
  limit: env.RATE_LIMIT_MAX,
});

export const loginRateLimiter = rateLimit({
  ...sharedOptions,
  limit: env.AUTH_RATE_LIMIT_MAX,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return `${ipKeyGenerator(req.ip ?? "unknown")}:${email}`;
  },
});

export const authSessionRateLimiter = rateLimit({
  ...sharedOptions,
  limit: Math.max(env.AUTH_RATE_LIMIT_MAX * 3, 20),
});

export const sensitiveRateLimiter = rateLimit({
  ...sharedOptions,
  limit: env.SENSITIVE_RATE_LIMIT_MAX,
});
