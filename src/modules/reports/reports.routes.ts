import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { ReportsController } from "./reports.controller.js";

export const reportsRoutes = Router();
const controller = new ReportsController();

reportsRoutes.use(authMiddleware);

reportsRoutes.get("/projects/:id/dossier", (req, res) => controller.projectDossier(req, res));
reportsRoutes.get("/projects/:id/dossier.pdf", (req, res) =>
  controller.projectDossierPdf(req, res),
);
