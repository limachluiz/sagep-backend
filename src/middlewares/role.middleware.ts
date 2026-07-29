import { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/app-error.js";

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("Usuário não autenticado", 401, "AUTH_REQUIRED"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          "Você não tem permissão para acessar este recurso",
          403,
          "ROLE_NOT_ALLOWED",
          { allowedRoles },
        ),
      );
    }

    return next();
  };
}
