import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requireRole } from "../../middlewares/role.middleware.js";
import { PermissionsController } from "./permissions.controller.js";

export const permissionsRoutes = Router();
const controller = new PermissionsController();

permissionsRoutes.use(authMiddleware, requireRole("ADMIN"));

permissionsRoutes.get("/catalog", (req, res) => controller.listCatalog(req, res));
permissionsRoutes.get("/roles/:role", (req, res) => controller.getRolePermissions(req, res));
permissionsRoutes.put("/roles/:role", (req, res) => controller.updateRolePermissions(req, res));
permissionsRoutes.get("/users/:id", (req, res) => controller.getUserPermissions(req, res));
permissionsRoutes.get("/users/:id/overrides", (req, res) => controller.listUserOverrides(req, res));
permissionsRoutes.post("/users/:id/overrides/allow", (req, res) =>
  controller.allowUserPermission(req, res),
);
permissionsRoutes.post("/users/:id/overrides/deny", (req, res) =>
  controller.denyUserPermission(req, res),
);
permissionsRoutes.delete("/users/:id/overrides/:permissionCode", (req, res) =>
  controller.removeUserOverride(req, res),
);
