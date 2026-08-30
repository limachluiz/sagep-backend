import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { UsersController } from "./users.controller.js";
import { requireStepUp } from "../../middlewares/step-up.middleware.js";

export const usersRoutes = Router();
const controller = new UsersController();

usersRoutes.use(authMiddleware);

usersRoutes.get(
  "/options",
  requirePermission("projects.edit_all", "projects.edit_own", "tasks.assign"),
  (req, res) => controller.listOptions(req, res),
);

usersRoutes.use(requireRole("ADMIN"), requirePermission("users.manage"));

usersRoutes.post("/", requireStepUp, (req, res) => controller.create(req, res));
usersRoutes.get("/", (req, res) => controller.list(req, res));
usersRoutes.get("/:id", (req, res) => controller.findById(req, res));
usersRoutes.patch("/:id", requireStepUp, (req, res) => controller.update(req, res));
usersRoutes.patch("/:id/status", requireStepUp, (req, res) => controller.updateStatus(req, res));
usersRoutes.patch("/:id/role", requireStepUp, (req, res) => controller.updateRole(req, res));
