import { prisma } from "../../config/prisma.js";
import {
  allPermissions,
  criticalPermissions,
  getPermissionCatalog,
  getPermissionCatalogItem,
  permissionDescriptions,
  rolePermissions,
  type Permission,
  type UserRole,
} from "./permissions.catalog.js";
import { AppError } from "../../shared/app-error.js";
import { auditService } from "../audit/audit.service.js";

type UserLike = {
  id?: string;
  name?: string | null;
  email?: string | null;
  role: string;
  permissions?: string[];
};

type PermissionOverrideEffect = "ALLOW" | "DENY";

type PermissionActor = Required<Pick<UserLike, "id" | "name" | "email" | "role">> & {
  permissions?: string[];
};

const roleLevels: Record<UserRole, number> = {
  CONSULTA: 1,
  PROJETISTA: 2,
  GESTOR: 3,
  ADMIN: 4,
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
    if (role in rolePermissions) {
      return rolePermissions[role as UserRole];
    }

    return [];
  }

  private isKnownRole(role: string): role is UserRole {
    return role in roleLevels;
  }

  private getRoleLevel(role: string) {
    if (!this.isKnownRole(role)) {
      return 0;
    }

    return roleLevels[role];
  }

  private isCriticalPermission(permission: Permission) {
    return criticalPermissions.includes(permission);
  }

  private assertAdminForCriticalPermission(actor: PermissionActor, permission: Permission) {
    if (this.isCriticalPermission(permission) && actor.role !== "ADMIN") {
      throw new AppError(
        "Apenas ADMIN pode conceder ou remover permissoes criticas",
        403,
      );
    }
  }

  private assertCanAdministrateRole(actor: PermissionActor, targetRole: UserRole) {
    if (actor.role === targetRole) {
      throw new AppError(
        "Voce nao pode alterar permissoes base da propria role",
        403,
      );
    }

    if (actor.role !== "ADMIN" && this.getRoleLevel(targetRole) >= this.getRoleLevel(actor.role)) {
      throw new AppError(
        "Voce nao pode administrar permissoes de uma role do mesmo nivel ou superior",
        403,
      );
    }
  }

  private assertCanAdministrateUser(actor: PermissionActor, targetUser: { id: string; role: string }) {
    if (actor.id === targetUser.id) {
      throw new AppError("Voce nao pode alterar as proprias permissoes", 403);
    }

    if (
      actor.role !== "ADMIN" &&
      this.getRoleLevel(targetUser.role) >= this.getRoleLevel(actor.role)
    ) {
      throw new AppError(
        "Voce nao pode administrar permissoes de usuarios do mesmo nivel ou superior",
        403,
      );
    }
  }

  private assertPermissionCapability(actor: PermissionActor, permission: Permission) {
    if (!this.hasPermission(actor, permission)) {
      throw new AppError("Voce nao tem permissao para administrar este recurso", 403);
    }
  }

  private applyOverrides(
    basePermissions: Permission[],
    overrides: Array<{ permission: Permission; effect: "ALLOW" | "DENY" }>,
  ) {
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

  getPermissionCatalog() {
    return getPermissionCatalog();
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
            createdAt: true,
            updatedAt: true,
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
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      }));
  }

  async getEffectivePermissionsForUser(userId: string, role: string) {
    const basePermissions = await this.getPersistedRolePermissionsForRole(role);
    const overrides = await this.getPersistedPermissionOverridesForUser(userId);

    return this.applyOverrides(basePermissions, overrides);
  }

  async getRolePermissionsAdministration(role: UserRole) {
    await this.refreshRolePermissionsCache();

    const basePermissions = this.getPermissionsForRole(role);
    const source = this.hasPersistedRoleMatrix ? "database" : "fallback";
    const assignedPermissions = new Set(basePermissions);

    return {
      role,
      source,
      basePermissions,
      items: this.getPermissionCatalog().map((item) => ({
        ...item,
        assigned: assignedPermissions.has(item.code),
      })),
    };
  }

  async updateRolePermissions(actor: PermissionActor, role: UserRole, nextPermissions: Permission[]) {
    this.assertPermissionCapability(actor, "permissions.manage_role_permissions");
    this.assertCanAdministrateRole(actor, role);

    const uniqueCodes = uniquePermissions(nextPermissions) as Permission[];
    const currentPermissions = await this.getPersistedRolePermissionsForRole(role);
    const persistedPermissions = await prisma.permission.findMany({
      where: {
        code: {
          in: uniqueCodes,
        },
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (persistedPermissions.length !== uniqueCodes.length) {
      const foundCodes = new Set(persistedPermissions.map((permission) => permission.code));
      const missingCode = uniqueCodes.find((code) => !foundCodes.has(code));

      throw new AppError(`Permissão inválida: ${missingCode ?? "desconhecida"}`, 400);
    }

    for (const permission of uniqueCodes) {
      this.assertAdminForCriticalPermission(actor, permission);
    }

    for (const permission of currentPermissions) {
      if (!uniqueCodes.includes(permission)) {
        this.assertAdminForCriticalPermission(actor, permission);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({
        where: {
          role,
        },
      });

      if (!persistedPermissions.length) {
        return;
      }

      await tx.rolePermission.createMany({
        data: persistedPermissions.map((permission) => ({
          role,
          permissionId: permission.id,
        })),
      });
    });

    const nextSnapshot = await this.getRolePermissionsAdministration(role);
    const addedPermissions = uniqueCodes.filter((permission) => !currentPermissions.includes(permission));
    const removedPermissions = currentPermissions.filter(
      (permission) => !uniqueCodes.includes(permission),
    );

    await auditService.log({
      entityType: "AUTH",
      entityId: `role:${role}`,
      action: "UPDATE",
      actor: {
        id: actor.id,
        name: actor.name,
      },
      summary: `${actor.email} atualizou as permissoes base da role ${role}`,
      before: {
        source: "role",
        role,
        permissions: currentPermissions,
      },
      after: {
        source: "role",
        role,
        permissions: nextSnapshot.basePermissions,
      },
      metadata: {
        source: "role",
        role,
        addedPermissions,
        removedPermissions,
        containsCriticalPermissions:
          addedPermissions.some((permission) => this.isCriticalPermission(permission)) ||
          removedPermissions.some((permission) => this.isCriticalPermission(permission)),
        actorRole: actor.role,
        targetRole: role,
      },
    });

    return {
      message: "Permissões base da role atualizadas com sucesso",
      ...nextSnapshot,
    };
  }

  private async getManagedUserOrThrow(userId: string) {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        userCode: true,
        name: true,
        email: true,
        role: true,
        rank: true,
        cpf: true,
        active: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    return user;
  }

  async getUserPermissionsAdministration(userId: string) {
    const user = await this.getManagedUserOrThrow(userId);
    const roleBasePermissions = await this.getPersistedRolePermissionsForRole(user.role);
    const overrides = await this.getPersistedPermissionOverridesForUser(user.id);
    const effectivePermissions = this.applyOverrides(roleBasePermissions, overrides);
    const roleBaseSet = new Set(roleBasePermissions);
    const overrideMap = new Map(overrides.map((override) => [override.permission, override.effect]));
    const effectiveSet = new Set(effectivePermissions);

    return {
      user,
      rolePermissionSource: this.hasPersistedRoleMatrix ? "database" : "fallback",
      roleBasePermissions,
      overrides,
      effectivePermissions,
      items: this.getPermissionCatalog().map((item) => ({
        ...item,
        grantedByRole: roleBaseSet.has(item.code),
        overrideEffect: overrideMap.get(item.code) ?? null,
        effective: effectiveSet.has(item.code),
      })),
    };
  }

  async listUserPermissionOverrides(userId: string) {
    const snapshot = await this.getUserPermissionsAdministration(userId);
    const overrideMap = new Map(snapshot.overrides.map((override) => [override.permission, override.effect]));

    return {
      user: snapshot.user,
      overrides: snapshot.items
        .filter((item) => overrideMap.has(item.code))
        .map((item) => ({
          code: item.code,
          module: item.module,
          group: item.group,
          action: item.action,
          description: item.description,
          effect: overrideMap.get(item.code)!,
          effective: item.effective,
          grantedByRole: item.grantedByRole,
          createdAt:
            snapshot.overrides.find((override) => override.permission === item.code)?.createdAt ?? null,
          updatedAt:
            snapshot.overrides.find((override) => override.permission === item.code)?.updatedAt ?? null,
        })),
    };
  }

  async upsertUserPermissionOverride(
    actor: PermissionActor,
    userId: string,
    permissionCode: Permission,
    effect: PermissionOverrideEffect,
  ) {
    this.assertPermissionCapability(actor, "permissions.manage_user_overrides");
    const user = await this.getManagedUserOrThrow(userId);
    this.assertCanAdministrateUser(actor, user);
    this.assertAdminForCriticalPermission(actor, permissionCode);
    const permission = await prisma.permission.findUnique({
      where: {
        code: permissionCode,
      },
      select: {
        id: true,
      },
    });

    if (!permission) {
      throw new AppError("Permissão não encontrada", 404);
    }

    const previousOverride = await prisma.userPermissionOverride.findUnique({
      where: {
        userId_permissionId: {
          userId: user.id,
          permissionId: permission.id,
        },
      },
      select: {
        effect: true,
      },
    });

    const beforeSummary = await this.getUserPermissionsAdministration(user.id);

    await prisma.userPermissionOverride.upsert({
      where: {
        userId_permissionId: {
          userId: user.id,
          permissionId: permission.id,
        },
      },
      update: {
        effect,
      },
      create: {
        userId: user.id,
        permissionId: permission.id,
        effect,
      },
    });

    const catalogItem = getPermissionCatalogItem(permissionCode);
    const summary = await this.getUserPermissionsAdministration(user.id);

    await auditService.log({
      entityType: "USER",
      entityId: user.id,
      action: "UPDATE",
      actor: {
        id: actor.id,
        name: actor.name,
      },
      summary: `${actor.email} aplicou override ${effect} para ${permissionCode} no usuario ${user.email}`,
      before: {
        source: "override",
        userId: user.id,
        userRole: user.role,
        permission: permissionCode,
        effect: previousOverride?.effect ?? null,
        effectivePermissions: beforeSummary.effectivePermissions,
      },
      after: {
        source: "override",
        userId: user.id,
        userRole: user.role,
        permission: permissionCode,
        effect,
        effectivePermissions: summary.effectivePermissions,
      },
      metadata: {
        source: "override",
        targetUserId: user.id,
        targetUserRole: user.role,
        targetUserEmail: user.email,
        permission: permissionCode,
        beforeEffect: previousOverride?.effect ?? null,
        afterEffect: effect,
        actorRole: actor.role,
        isCriticalPermission: this.isCriticalPermission(permissionCode),
      },
    });

    return {
      message: `Override ${effect} aplicado com sucesso`,
      user,
      override: {
        code: permissionCode,
        module: catalogItem.module,
        group: catalogItem.group,
        action: catalogItem.action,
        description: catalogItem.description,
        effect,
      },
      summary,
    };
  }

  async removeUserPermissionOverride(actor: PermissionActor, userId: string, permissionCode: Permission) {
    this.assertPermissionCapability(actor, "permissions.manage_user_overrides");
    const user = await this.getManagedUserOrThrow(userId);
    this.assertCanAdministrateUser(actor, user);
    this.assertAdminForCriticalPermission(actor, permissionCode);
    const permission = await prisma.permission.findUnique({
      where: {
        code: permissionCode,
      },
      select: {
        id: true,
      },
    });

    if (!permission) {
      throw new AppError("Permissão não encontrada", 404);
    }

    const beforeSummary = await this.getUserPermissionsAdministration(user.id);

    const override = await prisma.userPermissionOverride.findUnique({
      where: {
        userId_permissionId: {
          userId: user.id,
          permissionId: permission.id,
        },
      },
      select: {
        effect: true,
      },
    });

    if (!override) {
      throw new AppError("Override de permissão não encontrado", 404);
    }

    await prisma.userPermissionOverride.delete({
      where: {
        userId_permissionId: {
          userId: user.id,
          permissionId: permission.id,
        },
      },
    });

    const summary = await this.getUserPermissionsAdministration(user.id);

    await auditService.log({
      entityType: "USER",
      entityId: user.id,
      action: "UPDATE",
      actor: {
        id: actor.id,
        name: actor.name,
      },
      summary: `${actor.email} removeu override ${override.effect} de ${permissionCode} do usuario ${user.email}`,
      before: {
        source: "override",
        userId: user.id,
        userRole: user.role,
        permission: permissionCode,
        effect: override.effect,
        effectivePermissions: beforeSummary.effectivePermissions,
      },
      after: {
        source: "override",
        userId: user.id,
        userRole: user.role,
        permission: permissionCode,
        effect: null,
        effectivePermissions: summary.effectivePermissions,
      },
      metadata: {
        source: "override",
        targetUserId: user.id,
        targetUserRole: user.role,
        targetUserEmail: user.email,
        permission: permissionCode,
        beforeEffect: override.effect,
        afterEffect: null,
        actorRole: actor.role,
        isCriticalPermission: this.isCriticalPermission(permissionCode),
      },
    });

    return {
      message: "Override removido com sucesso",
      user,
      removedOverride: {
        code: permissionCode,
        effect: override.effect,
      },
      summary,
    };
  }

  hasPermission(user: UserLike, permission: Permission) {
    return this.resolveUserPermissions(user).includes(permission);
  }

  hasAnyPermission(user: UserLike, permissions: Permission[]) {
    return permissions.some((permission) => this.hasPermission(user, permission));
  }
}

export const permissionsService = new PermissionsService();
