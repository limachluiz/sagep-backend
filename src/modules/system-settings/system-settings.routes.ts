import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { SystemSettingsController } from "./system-settings.controller.js";

export const systemSettingsRoutes = Router();
const controller = new SystemSettingsController();

systemSettingsRoutes.use(authMiddleware);
systemSettingsRoutes.get("/", requirePermission("settings.view"), (req, res) => controller.get(req, res));
systemSettingsRoutes.put("/", requirePermission("settings.manage"), (req, res) => controller.update(req, res));
systemSettingsRoutes.post("/connections/test", requirePermission("settings.manage"), (req, res) => controller.testAll(req, res));
systemSettingsRoutes.post("/connections/:provider/test", requirePermission("settings.manage"), (req, res) => controller.testOne(req, res));
