import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { DashboardController } from "./dashboard.controller.js";

export const dashboardRoutes = Router();
const controller = new DashboardController();

dashboardRoutes.use(authMiddleware, requireRole("ADMIN", "GESTOR", "CONSULTA", "PROJETISTA"));

dashboardRoutes.get("/", (req, res) => controller.overview(req, res));