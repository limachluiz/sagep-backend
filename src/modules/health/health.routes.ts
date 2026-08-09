import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { healthController } from "./health.controller.js";

export const healthRoutes = Router();

healthRoutes.get("/", healthController.liveness);
healthRoutes.get("/status", healthController.status);
healthRoutes.get(
  "/details",
  authMiddleware,
  requirePermission("system_health.view_details"),
  healthController.details,
);
