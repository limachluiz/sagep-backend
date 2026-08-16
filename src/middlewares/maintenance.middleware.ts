import { NextFunction, Request, Response } from "express";
import { backupsService } from "../modules/backups/backups.service.js";
import { AppError } from "../shared/app-error.js";

export function maintenanceMiddleware(_req: Request, _res: Response, next: NextFunction) {
  if (!backupsService.isRestoring()) {
    return next();
  }

  return next(new AppError(
    "O SAGEP está temporariamente em modo de manutenção para restauração do banco",
    503,
    "DATABASE_RESTORE_IN_PROGRESS",
  ));
}
