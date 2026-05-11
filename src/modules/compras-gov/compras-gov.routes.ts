import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { ComprasGovController } from "./compras-gov.controller.js";

export const comprasGovRoutes = Router();
const controller = new ComprasGovController();

comprasGovRoutes.use(authMiddleware, requireRole("ADMIN"), requirePermission("atas.manage"));

comprasGovRoutes.get("/atas/preview", (req, res) => controller.previewAta(req, res));
comprasGovRoutes.post("/atas/import", (req, res) => controller.importAta(req, res));
