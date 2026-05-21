import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { AuditController } from "./audit.controller.js";

export const auditRoutes = Router();
const controller = new AuditController();

auditRoutes.use(authMiddleware, requireRole("ADMIN", "GESTOR"));

auditRoutes.get("/", (req, res) => controller.list(req, res));
