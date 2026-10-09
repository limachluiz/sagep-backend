import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { NotificationsController } from "./notifications.controller.js";
import { z } from "zod";
import { notificationsService } from "./notifications.service.js";

export const notificationsRoutes = Router();
const controller = new NotificationsController();
notificationsRoutes.use(authMiddleware);
notificationsRoutes.get("/", (req, res) => controller.list(req, res));
notificationsRoutes.get("/mention-candidates", async (req, res) => { const query = z.object({ projectId: z.string().min(1), search: z.string().trim().max(100).default("") }).parse(req.query); res.json(await notificationsService.mentionCandidates(query.projectId, query.search, req.user!.id)); });
notificationsRoutes.post("/read-all", (req, res) => controller.markAllRead(req, res));
notificationsRoutes.patch("/:id/read", (req, res) => controller.markRead(req, res));
notificationsRoutes.delete("/:id", (req, res) => controller.dismiss(req, res));

