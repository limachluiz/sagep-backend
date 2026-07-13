import { NextFunction, Request, Response } from "express";
import {
  type Permission,
  permissionsService,
} from "../modules/permissions/permissions.service.js";
import { AppError } from "../shared/app-error.js";

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError("Usuário não autenticado", 401, "AUTH_REQUIRED"));
    }

    if (!permissionsService.hasAnyPermission(req.user, permissions)) {
      return next(
        new AppError(
          "Você não tem permissão para acessar este recurso",
          403,
          "PERMISSION_DENIED",
          { requiredPermissions: permissions },
        ),
      );
    }

    return next();
  };
}
