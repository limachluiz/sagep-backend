import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { EstimatesController } from "./estimates.controller.js";

export const estimatesRoutes = Router();
const controller = new EstimatesController();

estimatesRoutes.use(authMiddleware);

estimatesRoutes.post("/", requirePermission("estimates.create"), (req, res) =>
  controller.create(req, res),
);
estimatesRoutes.get("/", (req, res) => controller.list(req, res));
estimatesRoutes.get("/code/:code", (req, res) => controller.findByCode(req, res));

estimatesRoutes.get("/:id/document/html", (req, res) => controller.documentHtml(req, res));
estimatesRoutes.get("/:id/document/pdf", (req, res) => controller.documentPdf(req, res));

estimatesRoutes.get("/:id", (req, res) => controller.findById(req, res));
estimatesRoutes.patch(
  "/:id/status",
  requirePermission("estimates.edit", "estimates.finalize"),
  (req, res) => controller.updateStatus(req, res),
);
estimatesRoutes.patch(
  "/:id",
  requirePermission("estimates.edit", "estimates.finalize"),
  (req, res) => controller.update(req, res),
);
estimatesRoutes.delete("/:id", requirePermission("estimates.archive"), (req, res) =>
  controller.remove(req, res),
);
