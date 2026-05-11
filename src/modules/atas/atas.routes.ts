import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { AtaItemsController } from "../ata-items/ata-items.controller.js";
import { AtasController } from "./atas.controller.js";

export const atasRoutes = Router();
const controller = new AtasController();
const ataItemsController = new AtaItemsController();

atasRoutes.use(authMiddleware);

atasRoutes.post("/", requirePermission("atas.manage"), (req, res) =>
  controller.create(req, res)
);
atasRoutes.get("/", (req, res) => controller.list(req, res));
atasRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));

atasRoutes.post(
  "/:id/coverage-groups",
  requireRole("ADMIN"),
  requirePermission("atas.manage"),
  (req, res) => controller.createCoverageGroup(req, res)
);
atasRoutes.patch(
  "/:id/coverage-groups/:groupId",
  requireRole("ADMIN"),
  requirePermission("atas.manage"),
  (req, res) => controller.updateCoverageGroup(req, res)
);
atasRoutes.delete(
  "/:id/coverage-groups/:groupId",
  requireRole("ADMIN"),
  requirePermission("atas.manage"),
  (req, res) => controller.removeCoverageGroup(req, res)
);

atasRoutes.post("/:id/items", requirePermission("atas.manage"), (req, res) =>
  ataItemsController.create(req, res)
);
atasRoutes.get("/:id/items", (req, res) => ataItemsController.listByAta(req, res));

atasRoutes.get("/:id", (req, res) => controller.findById(req, res));
atasRoutes.patch("/:id", requirePermission("atas.manage"), (req, res) =>
  controller.update(req, res)
);
atasRoutes.delete("/:id", requirePermission("atas.manage"), (req, res) =>
  controller.remove(req, res)
);
