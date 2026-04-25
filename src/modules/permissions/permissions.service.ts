export type Permission =
  | "projects.view_all"
  | "projects.edit_own"
  | "projects.edit_all"
  | "projects.complete"
  | "projects.reopen"
  | "diex.issue"
  | "diex.cancel"
  | "service_orders.issue"
  | "service_orders.cancel"
  | "dashboard.financial_view"
  | "reports.export"
  | "users.manage";

type UserLike = {
  role: string;
};

const rolePermissions: Record<string, Permission[]> = {
  ADMIN: [
    "projects.view_all",
    "projects.edit_own",
    "projects.edit_all",
    "projects.complete",
    "projects.reopen",
    "diex.issue",
    "diex.cancel",
    "service_orders.issue",
    "service_orders.cancel",
    "dashboard.financial_view",
    "reports.export",
    "users.manage",
  ],
  GESTOR: [
    "projects.view_all",
    "projects.edit_own",
    "projects.edit_all",
    "projects.complete",
    "projects.reopen",
    "diex.issue",
    "diex.cancel",
    "service_orders.issue",
    "service_orders.cancel",
    "dashboard.financial_view",
    "reports.export",
  ],
  PROJETISTA: [
    "projects.edit_own",
    "projects.complete",
    "diex.issue",
    "service_orders.issue",
    "reports.export",
  ],
  CONSULTA: ["projects.edit_own"],
};

export class PermissionsService {
  getPermissionsForRole(role: string): Permission[] {
    return rolePermissions[role] ?? [];
  }

  hasPermission(user: UserLike, permission: Permission) {
    return this.getPermissionsForRole(user.role).includes(permission);
  }

  hasAnyPermission(user: UserLike, permissions: Permission[]) {
    return permissions.some((permission) => this.hasPermission(user, permission));
  }
}

export const permissionsService = new PermissionsService();
