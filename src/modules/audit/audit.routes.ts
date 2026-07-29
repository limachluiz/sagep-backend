import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { AuditController } from "./audit.controller.js";

export const auditRoutes = Router();
const controller = new AuditController();

auditRoutes.use(authMiddleware, requirePermission("audit.view"));

auditRoutes.get("/", (req, res) => controller.list(req, res));
