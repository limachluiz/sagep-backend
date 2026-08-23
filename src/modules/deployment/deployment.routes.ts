import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { sensitiveRateLimiter } from "../../middlewares/rate-limit.middleware.js";
import { requireStepUp } from "../../middlewares/step-up.middleware.js";
import { DeploymentController } from "./deployment.controller.js";

export const deploymentRoutes = Router();
const controller = new DeploymentController();
const adminOnly = [requirePermission("settings.manage"), requireRole("ADMIN")];

deploymentRoutes.use(authMiddleware);
deploymentRoutes.get("/", requirePermission("settings.view"), (req, res) => controller.get(req, res));
deploymentRoutes.get("/diagnostics", requirePermission("system_health.view_details"), (req, res) => controller.diagnostics(req, res));
deploymentRoutes.get("/preflight", requirePermission("system_health.view_details"), (req, res) => controller.preflight(req, res));
deploymentRoutes.put("/", sensitiveRateLimiter, ...adminOnly, requireStepUp, (req, res) => controller.update(req, res));
deploymentRoutes.post("/certificate/internal", sensitiveRateLimiter, ...adminOnly, requireStepUp, (req, res) => controller.initializeCertificate(req, res));
deploymentRoutes.post("/certificate/renew", sensitiveRateLimiter, ...adminOnly, requireStepUp, (req, res) => controller.renewCertificate(req, res));
deploymentRoutes.get("/trust-kit/:platform", sensitiveRateLimiter, ...adminOnly, requireStepUp, (req, res) => controller.trustKit(req, res));
