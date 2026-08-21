import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { SystemSettingsController } from "./system-settings.controller.js";
import { sensitiveRateLimiter } from "../../middlewares/rate-limit.middleware.js";
import { requireStepUp } from "../../middlewares/step-up.middleware.js";

export const systemSettingsRoutes = Router();
const controller = new SystemSettingsController();

systemSettingsRoutes.use(authMiddleware);
systemSettingsRoutes.get("/", requirePermission("settings.view"), (req, res) => controller.get(req, res));
systemSettingsRoutes.put("/", requirePermission("settings.manage"), requireStepUp, (req, res) => controller.update(req, res));
systemSettingsRoutes.post("/connections/test", sensitiveRateLimiter, requirePermission("settings.manage"), requireStepUp, (req, res) => controller.testAll(req, res));
systemSettingsRoutes.post("/connections/:provider/test", sensitiveRateLimiter, requirePermission("settings.manage"), requireStepUp, (req, res) => controller.testOne(req, res));
