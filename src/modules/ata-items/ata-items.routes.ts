import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { AtaItemsController } from "./ata-items.controller.js";

export const ataItemsRoutes = Router();
const controller = new AtaItemsController();

ataItemsRoutes.use(authMiddleware);

ataItemsRoutes.get("/", (req, res) => controller.list(req, res));
ataItemsRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));
ataItemsRoutes.get("/:id", (req, res) => controller.findById(req, res));
ataItemsRoutes.patch("/:id", requireRole("ADMIN", "GESTOR"), (req, res) =>
  controller.update(req, res)
);
ataItemsRoutes.delete("/:id", requireRole("ADMIN", "GESTOR"), (req, res) =>
  controller.remove(req, res)
);