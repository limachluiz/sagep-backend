import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { EstimatesController } from "./estimates.controller.js";

export const estimatesRoutes = Router();
const controller = new EstimatesController();

estimatesRoutes.use(authMiddleware);

estimatesRoutes.post("/", (req, res) => controller.create(req, res));
estimatesRoutes.get("/", (req, res) => controller.list(req, res));
estimatesRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));
estimatesRoutes.get("/:id", (req, res) => controller.findById(req, res));
estimatesRoutes.patch("/:id/status", (req, res) => controller.updateStatus(req, res));
estimatesRoutes.patch("/:id", (req, res) => controller.update(req, res));
estimatesRoutes.delete("/:id", (req, res) => controller.remove(req, res));