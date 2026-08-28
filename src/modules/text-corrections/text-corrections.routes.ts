import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { TextCorrectionsController } from "./text-corrections.controller.js";

export const textCorrectionsRoutes = Router();
const controller = new TextCorrectionsController();

textCorrectionsRoutes.use(authMiddleware);
textCorrectionsRoutes.get("/", requirePermission("settings.view"), (req, res) => controller.list(req, res));
textCorrectionsRoutes.post("/test", requirePermission("settings.view"), (req, res) => controller.test(req, res));
textCorrectionsRoutes.post("/apply", requirePermission("settings.manage"), (req, res) => controller.apply(req, res));
textCorrectionsRoutes.post("/", requirePermission("settings.manage"), (req, res) => controller.create(req, res));
textCorrectionsRoutes.put("/:id", requirePermission("settings.manage"), (req, res) => controller.update(req, res));
textCorrectionsRoutes.delete("/:id", requirePermission("settings.manage"), (req, res) => controller.remove(req, res));
