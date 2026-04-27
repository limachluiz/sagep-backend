import { NextFunction, Request, Response } from "express";
import {
  type Permission,
  permissionsService,
} from "../modules/permissions/permissions.service.js";

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Usuário não autenticado",
      });
    }

    if (!permissionsService.hasAnyPermission(req.user, permissions)) {
      return res.status(403).json({
        message: "Você não tem permissão para acessar este recurso",
        requiredPermissions: permissions,
      });
    }

    return next();
  };
}
