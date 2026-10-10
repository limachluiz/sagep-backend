import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { authMiddleware } from "./auth.middleware.js";
import { requirePermission } from "./permission.middleware.js";

function tokenMatches(received: string | undefined) {
  const expected = env.HEALTH_METRICS_TOKEN;
  if (!expected || !received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Permite coleta automatizada por um token técnico dedicado. Sem ele, mantém
 * exatamente o fluxo normal de usuário autenticado e permissão administrativa.
 */
export function requireMetricsAccess(req: Request, res: Response, next: NextFunction) {
  const authorization = req.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (tokenMatches(bearer) || tokenMatches(req.get("x-sagep-metrics-token"))) return next();

  return authMiddleware(req, res, (error?: unknown) => {
    if (error) return next(error);
    return requirePermission("system_health.view_details")(req, res, next);
  });
}
