import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { ReportsController } from "./reports.controller.js";

export const reportsRoutes = Router();
const controller = new ReportsController();

reportsRoutes.use(authMiddleware);

reportsRoutes.get(
  "/projects/:id/dossier",
  requirePermission("reports.export"),
  (req, res) => controller.projectDossier(req, res),
);
reportsRoutes.get(
  "/projects/:id/dossier.pdf",
  requirePermission("reports.export"),
  (req, res) => controller.projectDossierPdf(req, res),
);
