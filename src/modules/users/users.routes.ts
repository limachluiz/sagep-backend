import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { UsersController } from "./users.controller.js";

export const usersRoutes = Router();
const controller = new UsersController();

usersRoutes.use(authMiddleware, requireRole("ADMIN"), requirePermission("users.manage"));

usersRoutes.post("/", (req, res) => controller.create(req, res));
usersRoutes.get("/", (req, res) => controller.list(req, res));
usersRoutes.get("/:id", (req, res) => controller.findById(req, res));
usersRoutes.patch("/:id", (req, res) => controller.update(req, res));
usersRoutes.patch("/:id/status", (req, res) => controller.updateStatus(req, res));
usersRoutes.patch("/:id/role", (req, res) => controller.updateRole(req, res));
