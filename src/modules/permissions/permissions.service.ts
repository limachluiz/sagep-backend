import { prisma } from "../../config/prisma.js";
import {
  allPermissions,
  permissionDescriptions,
  rolePermissions,
  type Permission,
} from "./permissions.catalog.js";

type UserLike = {
  role: string;
  permissions?: string[];
};

export type { Permission } from "./permissions.catalog.js";

function uniquePermissions(permissions: string[]) {
  return Array.from(new Set(permissions)).sort();
}

export class PermissionsService {
  private rolePermissionsCache = new Map<string, Permission[]>();

  private hasPersistedRoleMatrix = false;

  private async refreshRolePermissionsCache() {
    const assignments = await prisma.rolePermission.findMany({
      select: {
        role: true,
        permission: {
          select: {
            code: true,
          },
        },
      },
    });

    const nextCache = new Map<string, Permission[]>();

    for (const assignment of assignments) {
      const currentPermissions = nextCache.get(assignment.role) ?? [];
      currentPermissions.push(assignment.permission.code as Permission);
      nextCache.set(assignment.role, currentPermissions);
    }

    for (const [role, permissions] of nextCache.entries()) {
      nextCache.set(role, uniquePermissions(permissions) as Permission[]);
    }

    this.rolePermissionsCache = nextCache;
    this.hasPersistedRoleMatrix = assignments.length > 0;
  }

  private getFallbackRolePermissions(role: string): Permission[] {
    return rolePermissions[role] ?? [];
  }

  getPermissionsForRole(role: string): Permission[] {
    if (!this.hasPersistedRoleMatrix) {
      return this.getFallbackRolePermissions(role);
    }

    return this.rolePermissionsCache.get(role) ?? [];
  }

  getAllPermissions() {
    return allPermissions;
  }

  getPermissionDescriptions() {
    return permissionDescriptions;
  }

  private resolveUserPermissions(user: UserLike) {
    if (Array.isArray(user.permissions)) {
      return uniquePermissions(user.permissions) as Permission[];
    }

    return this.getPermissionsForRole(user.role);
  }

  async getPersistedRolePermissionsForRole(role: string) {
    await this.refreshRolePermissionsCache();

    return this.getPermissionsForRole(role);
  }

  async getPersistedPermissionOverridesForUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        permissionOverrides: {
          select: {
            effect: true,
            permission: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    return (user?.permissionOverrides ?? [])
      .filter((assignment) =>
        this.getAllPermissions().includes(assignment.permission.code as Permission),
      )
      .map((assignment) => ({
        effect: assignment.effect,
        permission: assignment.permission.code as Permission,
      }));
  }

  async getEffectivePermissionsForUser(userId: string, role: string) {
    const basePermissions = await this.getPersistedRolePermissionsForRole(role);
    const overrides = await this.getPersistedPermissionOverridesForUser(userId);
    const effectivePermissions = new Set(basePermissions);

    for (const override of overrides) {
      if (override.effect === "ALLOW") {
        effectivePermissions.add(override.permission);
        continue;
      }

      effectivePermissions.delete(override.permission);
    }

    return uniquePermissions(Array.from(effectivePermissions)) as Permission[];
  }

  hasPermission(user: UserLike, permission: Permission) {
    return this.resolveUserPermissions(user).includes(permission);
  }

  hasAnyPermission(user: UserLike, permissions: Permission[]) {
    return permissions.some((permission) => this.hasPermission(user, permission));
  }
}

export const permissionsService = new PermissionsService();
