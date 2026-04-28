import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { TasksController } from "./tasks.controller.js";

export const tasksRoutes = Router();
const controller = new TasksController();

tasksRoutes.use(authMiddleware);

tasksRoutes.post("/", requirePermission("tasks.create"), (req, res) => controller.create(req, res));
tasksRoutes.get("/", (req, res) => controller.list(req, res));
tasksRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));
tasksRoutes.get("/:id", (req, res) => controller.findById(req, res));
tasksRoutes.patch(
  "/:id/status",
  requirePermission("tasks.edit_all", "tasks.edit_own", "tasks.complete"),
  (req, res) => controller.updateStatus(req, res),
);
tasksRoutes.patch(
  "/:id",
  requirePermission("tasks.edit_all", "tasks.edit_own", "tasks.assign"),
  (req, res) => controller.update(req, res),
);
tasksRoutes.delete("/:id", requirePermission("tasks.archive"), (req, res) =>
  controller.remove(req, res),
);
