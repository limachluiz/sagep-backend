import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { TasksController } from "./tasks.controller.js";

export const tasksRoutes = Router();
const controller = new TasksController();

tasksRoutes.use(authMiddleware);

tasksRoutes.post("/", (req, res) => controller.create(req, res));
tasksRoutes.get("/", (req, res) => controller.list(req, res));
tasksRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));
tasksRoutes.get("/:id", (req, res) => controller.findById(req, res));
tasksRoutes.patch("/:id/status", (req, res) => controller.updateStatus(req, res));
tasksRoutes.patch("/:id", (req, res) => controller.update(req, res));
tasksRoutes.delete("/:id", (req, res) => controller.remove(req, res));