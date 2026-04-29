import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { MilitaryOrganizationsController } from "./military-organizations.controller.js";

export const militaryOrganizationsRoutes = Router();
const controller = new MilitaryOrganizationsController();

militaryOrganizationsRoutes.use(authMiddleware);

militaryOrganizationsRoutes.get("/", (req, res) => controller.list(req, res));

militaryOrganizationsRoutes.get("/code/:code", (req, res) =>
  controller.findByCode(req, res)
);

militaryOrganizationsRoutes.patch(
  "/code/:code",
  requirePermission("military_organizations.manage"),
  (req, res) => controller.updateByCode(req, res)
);

militaryOrganizationsRoutes.delete(
  "/code/:code",
  requirePermission("military_organizations.manage"),
  (req, res) => controller.removeByCode(req, res)
);

militaryOrganizationsRoutes.get("/:id", (req, res) => controller.findById(req, res));

militaryOrganizationsRoutes.post(
  "/",
  requirePermission("military_organizations.manage"),
  (req, res) => controller.create(req, res)
);

militaryOrganizationsRoutes.patch(
  "/:id",
  requirePermission("military_organizations.manage"),
  (req, res) => controller.update(req, res)
);

militaryOrganizationsRoutes.delete(
  "/:id",
  requirePermission("military_organizations.manage"),
  (req, res) => controller.remove(req, res)
);
