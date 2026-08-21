import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";
import { PermissionsController } from "./permissions.controller.js";
import { requireStepUp } from "../../middlewares/step-up.middleware.js";

export const permissionsRoutes = Router();
const controller = new PermissionsController();

permissionsRoutes.use(authMiddleware);

permissionsRoutes.get("/catalog", requirePermission("permissions.view"), (req, res) =>
  controller.listCatalog(req, res),
);
permissionsRoutes.get("/roles/:role", requirePermission("permissions.view"), (req, res) =>
  controller.getRolePermissions(req, res),
);
permissionsRoutes.put(
  "/roles/:role",
  requirePermission("permissions.manage_role_permissions"),
  requireStepUp,
  (req, res) => controller.updateRolePermissions(req, res),
);
permissionsRoutes.get("/users", requirePermission("permissions.view"), (req, res) =>
  controller.listUsers(req, res),
);
permissionsRoutes.get("/users/:id", requirePermission("permissions.view"), (req, res) =>
  controller.getUserPermissions(req, res),
);
permissionsRoutes.get(
  "/users/:id/overrides",
  requirePermission("permissions.view"),
  (req, res) => controller.listUserOverrides(req, res),
);
permissionsRoutes.post(
  "/users/:id/overrides/allow",
  requirePermission("permissions.manage_user_overrides"),
  requireStepUp,
  (req, res) => controller.allowUserPermission(req, res),
);
permissionsRoutes.post(
  "/users/:id/overrides/deny",
  requirePermission("permissions.manage_user_overrides"),
  requireStepUp,
  (req, res) => controller.denyUserPermission(req, res),
);
permissionsRoutes.delete(
  "/users/:id/overrides/:permissionCode",
  requirePermission("permissions.manage_user_overrides"),
  requireStepUp,
  (req, res) => controller.removeUserOverride(req, res),
);
