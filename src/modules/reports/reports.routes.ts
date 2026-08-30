import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { ReportsController } from "./reports.controller.js";

export const reportsRoutes = Router();
const controller = new ReportsController();

reportsRoutes.use(authMiddleware);

reportsRoutes.get(
  "/projects/executive-summary",
  requirePermission("reports.export"),
  requirePermission("dashboard.view_executive"),
  (req, res) => controller.executiveProjectsReport(req, res),
);
reportsRoutes.post("/projects/:id/delivery.pdf", requirePermission("reports.export"), (req, res) => controller.deliveryReportPdf(req, res));
reportsRoutes.get(
  "/projects/executive-summary.pdf",
  requirePermission("reports.export"),
  requirePermission("dashboard.view_executive"),
  (req, res) => controller.executiveProjectsReportPdf(req, res),
);
reportsRoutes.get(
  "/projects/consolidated-summary.pdf",
  requirePermission("reports.export"),
  (req, res) => controller.consolidatedProjectsReportPdf(req, res),
);
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
