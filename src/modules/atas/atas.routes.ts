import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { AtasController } from "./atas.controller.js";

export const atasRoutes = Router();
const controller = new AtasController();

atasRoutes.use(authMiddleware);

atasRoutes.post("/", requireRole("ADMIN", "GESTOR"), (req, res) => controller.create(req, res));
atasRoutes.get("/", (req, res) => controller.list(req, res));
atasRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));
atasRoutes.get("/:id", (req, res) => controller.findById(req, res));
atasRoutes.patch("/:id", requireRole("ADMIN", "GESTOR"), (req, res) => controller.update(req, res));
atasRoutes.delete("/:id", requireRole("ADMIN", "GESTOR"), (req, res) => controller.remove(req, res));