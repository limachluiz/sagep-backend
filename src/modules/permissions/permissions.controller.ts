import { Request, Response } from "express";
import { permissionsService } from "./permissions.service.js";
import {
  createUserPermissionOverrideSchema,
  permissionCodeParamSchema,
  permissionRoleParamSchema,
  permissionUserIdParamSchema,
  updateRolePermissionsSchema,
} from "./permissions.schemas.js";

export class PermissionsController {
  async listCatalog(_req: Request, res: Response) {
    return res.status(200).json({
      items: permissionsService.getPermissionCatalog(),
    });
  }

  async getRolePermissions(req: Request, res: Response) {
    const { role } = permissionRoleParamSchema.parse(req.params);
    const payload = await permissionsService.getRolePermissionsAdministration(role);

    return res.status(200).json(payload);
  }

  async updateRolePermissions(req: Request, res: Response) {
    const { role } = permissionRoleParamSchema.parse(req.params);
    const data = updateRolePermissionsSchema.parse(req.body);
    const payload = await permissionsService.updateRolePermissions(req.user!, role, data.permissions);

    return res.status(200).json(payload);
  }

  async getUserPermissions(req: Request, res: Response) {
    const { id } = permissionUserIdParamSchema.parse(req.params);
    const payload = await permissionsService.getUserPermissionsAdministration(id);

    return res.status(200).json(payload);
  }

  async listUserOverrides(req: Request, res: Response) {
    const { id } = permissionUserIdParamSchema.parse(req.params);
    const payload = await permissionsService.listUserPermissionOverrides(id);

    return res.status(200).json(payload);
  }

  async allowUserPermission(req: Request, res: Response) {
    const { id } = permissionUserIdParamSchema.parse(req.params);
    const { permissionCode } = createUserPermissionOverrideSchema.parse(req.body);
    const payload = await permissionsService.upsertUserPermissionOverride(
      req.user!,
      id,
      permissionCode,
      "ALLOW",
    );

    return res.status(200).json(payload);
  }

  async denyUserPermission(req: Request, res: Response) {
    const { id } = permissionUserIdParamSchema.parse(req.params);
    const { permissionCode } = createUserPermissionOverrideSchema.parse(req.body);
    const payload = await permissionsService.upsertUserPermissionOverride(
      req.user!,
      id,
      permissionCode,
      "DENY",
    );

    return res.status(200).json(payload);
  }

  async removeUserOverride(req: Request, res: Response) {
    const { id } = permissionUserIdParamSchema.parse(req.params);
    const { permissionCode } = permissionCodeParamSchema.parse(req.params);
    const payload = await permissionsService.removeUserPermissionOverride(
      req.user!,
      id,
      permissionCode,
    );

    return res.status(200).json(payload);
  }
}
