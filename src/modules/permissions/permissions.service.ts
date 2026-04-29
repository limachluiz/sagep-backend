export type Permission =
  | "projects.view_all"
  | "projects.edit_own"
  | "projects.edit_all"
  | "projects.restore"
  | "projects.complete"
  | "projects.reopen"
  | "tasks.view_all"
  | "tasks.create"
  | "tasks.edit_all"
  | "tasks.edit_own"
  | "tasks.assign"
  | "tasks.complete"
  | "tasks.archive"
  | "tasks.restore"
  | "estimates.view_all"
  | "estimates.create"
  | "estimates.edit"
  | "estimates.finalize"
  | "estimates.archive"
  | "estimates.restore"
  | "diex.issue"
  | "diex.cancel"
  | "diex.restore"
  | "service_orders.issue"
  | "service_orders.cancel"
  | "service_orders.restore"
  | "atas.manage"
  | "military_organizations.manage"
  | "sessions.manage_own"
  | "sessions.manage_all"
  | "dashboard.view_operational"
  | "dashboard.view_executive"
  | "dashboard.financial_view"
  | "reports.export"
  | "users.manage";

type UserLike = {
  role: string;
};

const taskPermissions: Permission[] = [
  "tasks.view_all",
  "tasks.create",
  "tasks.edit_all",
  "tasks.edit_own",
  "tasks.assign",
  "tasks.complete",
  "tasks.archive",
  "tasks.restore",
];

const estimatePermissions: Permission[] = [
  "estimates.view_all",
  "estimates.create",
  "estimates.edit",
  "estimates.finalize",
  "estimates.archive",
  "estimates.restore",
];

const rolePermissions: Record<string, Permission[]> = {
  ADMIN: [
    "projects.view_all",
    "projects.edit_own",
    "projects.edit_all",
    "projects.restore",
    "projects.complete",
    "projects.reopen",
    ...taskPermissions,
    ...estimatePermissions,
    "diex.issue",
    "diex.cancel",
    "diex.restore",
    "service_orders.issue",
    "service_orders.cancel",
    "service_orders.restore",
    "atas.manage",
    "military_organizations.manage",
    "sessions.manage_own",
    "sessions.manage_all",
    "dashboard.view_operational",
    "dashboard.view_executive",
    "dashboard.financial_view",
    "reports.export",
    "users.manage",
  ],
  GESTOR: [
    "projects.view_all",
    "projects.edit_own",
    "projects.edit_all",
    "projects.restore",
    "projects.complete",
    "projects.reopen",
    ...taskPermissions,
    ...estimatePermissions,
    "diex.issue",
    "diex.cancel",
    "diex.restore",
    "service_orders.issue",
    "service_orders.cancel",
    "service_orders.restore",
    "sessions.manage_own",
    "dashboard.view_operational",
    "dashboard.view_executive",
    "dashboard.financial_view",
    "reports.export",
  ],
  PROJETISTA: [
    "projects.edit_own",
    "projects.complete",
    "tasks.create",
    "tasks.edit_own",
    "tasks.complete",
    "estimates.create",
    "estimates.edit",
    "estimates.finalize",
    "diex.issue",
    "service_orders.issue",
    "sessions.manage_own",
    "dashboard.view_operational",
    "reports.export",
  ],
  CONSULTA: [
    "tasks.view_all",
    "estimates.view_all",
    "sessions.manage_own",
    "dashboard.view_operational",
  ],
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
