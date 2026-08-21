import type { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/app-error.js";
import { verifyAccessToken, verifyStepUpToken } from "../shared/auth-tokens.js";
import { env } from "../config/env.js";

export function requireStepUp(req: Request, _res: Response, next: NextFunction) {
  const rawHeader = req.get("x-sagep-reauth");

  if (!rawHeader) {
    const accessToken = req.get("authorization")?.split(" ")[1];
    if (accessToken) {
      try {
        const payload = verifyAccessToken(accessToken);
        const authenticatedAt = (payload.iat ?? 0) * 1000;
        const stillRecent =
          payload.authenticationMethod === "PASSWORD" &&
          authenticatedAt >= Date.now() - env.STEP_UP_EXPIRES_IN_SECONDS * 1000;
        if (stillRecent && payload.sub === req.user?.id) return next();
      } catch {
        // O middleware de autenticação já validou o access token. Aqui apenas
        // recusamos tratá-lo como autenticação recente.
      }
    }

    return next(
      new AppError(
        "Confirme sua senha para realizar esta operação",
        428,
        "AUTH_STEP_UP_REQUIRED",
      ),
    );
  }

  try {
    const payload = verifyStepUpToken(rawHeader);
    if (payload.purpose !== "STEP_UP" || payload.sub !== req.user?.id) {
      throw new Error("Autorização reforçada incompatível");
    }
    return next();
  } catch {
    return next(
      new AppError(
        "A confirmação de senha expirou ou é inválida",
        428,
        "AUTH_STEP_UP_INVALID_OR_EXPIRED",
      ),
    );
  }
}
