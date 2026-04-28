import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { DashboardController } from "./dashboard.controller.js";

export const dashboardRoutes = Router();
const controller = new DashboardController();

dashboardRoutes.use(authMiddleware);

dashboardRoutes.get(
  "/operational",
  requirePermission("dashboard.view_operational"),
  (req, res) => controller.operational(req, res),
);
dashboardRoutes.get(
  "/executive",
  requirePermission("dashboard.view_executive"),
  (req, res) => controller.executive(req, res),
);
dashboardRoutes.get("/", requirePermission("dashboard.financial_view"), (req, res) =>
  controller.overview(req, res),
);
