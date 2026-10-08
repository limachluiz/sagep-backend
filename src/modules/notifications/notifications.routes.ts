import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { NotificationsController } from "./notifications.controller.js";

export const notificationsRoutes = Router();
const controller = new NotificationsController();
notificationsRoutes.use(authMiddleware);
notificationsRoutes.get("/", (req, res) => controller.list(req, res));
notificationsRoutes.post("/read-all", (req, res) => controller.markAllRead(req, res));
notificationsRoutes.patch("/:id/read", (req, res) => controller.markRead(req, res));
notificationsRoutes.delete("/:id", (req, res) => controller.dismiss(req, res));

