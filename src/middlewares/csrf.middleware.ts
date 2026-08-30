import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../shared/app-error.js";

const allowedOrigins = new Set(env.CORS_ALLOWED_ORIGINS);

export function requireTrustedBrowserOrigin(req: Request, _res: Response, next: NextFunction) {
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site")?.toLowerCase();

  if (fetchSite === "cross-site" || (origin && !allowedOrigins.has(origin))) {
    return next(
      new AppError(
        "Origem da operação não autorizada",
        403,
        "CSRF_ORIGIN_DENIED",
        { origin: origin ?? null, fetchSite: fetchSite ?? null },
      ),
    );
  }

  return next();
}
