import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { PregoesController } from "./pregoes.controller.js";

export const pregoesRoutes = Router();
const controller = new PregoesController();

pregoesRoutes.use(authMiddleware);
pregoesRoutes.get("/", (req, res) => controller.list(req, res));
pregoesRoutes.get("/:id", (req, res) => controller.findById(req, res));
pregoesRoutes.post("/:id/sync", requirePermission("atas.manage"), (req, res) => controller.sync(req, res));
pregoesRoutes.patch("/:id", requirePermission("atas.manage"), (req, res) => controller.update(req, res));
