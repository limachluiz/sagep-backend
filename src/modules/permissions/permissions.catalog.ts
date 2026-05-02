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

export const roleValues = ["ADMIN", "GESTOR", "PROJETISTA", "CONSULTA"] as const;

export type UserRole = (typeof roleValues)[number];

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

export const rolePermissions: Record<UserRole, Permission[]> = {
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

export const permissionDescriptions: Record<Permission, string> = {
  "projects.view_all": "Permite visualizar projetos de qualquer responsavel",
  "projects.edit_own": "Permite editar projetos proprios",
  "projects.edit_all": "Permite editar qualquer projeto",
  "projects.restore": "Permite restaurar projetos arquivados",
  "projects.complete": "Permite concluir projetos",
  "projects.reopen": "Permite reabrir projetos concluidos",
  "tasks.view_all": "Permite visualizar tarefas de todos os projetos",
  "tasks.create": "Permite criar tarefas",
  "tasks.edit_all": "Permite editar qualquer tarefa",
  "tasks.edit_own": "Permite editar tarefas vinculadas ao proprio contexto",
  "tasks.assign": "Permite atribuir tarefas a usuarios",
  "tasks.complete": "Permite concluir tarefas",
  "tasks.archive": "Permite arquivar tarefas",
  "tasks.restore": "Permite restaurar tarefas arquivadas",
  "estimates.view_all": "Permite visualizar estimativas de qualquer projeto",
  "estimates.create": "Permite criar estimativas",
  "estimates.edit": "Permite editar estimativas",
  "estimates.finalize": "Permite finalizar estimativas",
  "estimates.archive": "Permite arquivar estimativas",
  "estimates.restore": "Permite restaurar estimativas arquivadas",
  "diex.issue": "Permite emitir DIEx",
  "diex.cancel": "Permite arquivar ou cancelar DIEx",
  "diex.restore": "Permite restaurar DIEx arquivados",
  "service_orders.issue": "Permite emitir ordens de servico",
  "service_orders.cancel": "Permite arquivar ou cancelar ordens de servico",
  "service_orders.restore": "Permite restaurar ordens de servico arquivadas",
  "atas.manage": "Permite administrar atas e itens de ata",
  "military_organizations.manage": "Permite administrar organizacoes militares",
  "sessions.manage_own": "Permite gerenciar as proprias sessoes",
  "sessions.manage_all": "Permite administrar sessoes de qualquer usuario",
  "dashboard.view_operational": "Permite visualizar dashboards operacionais",
  "dashboard.view_executive": "Permite visualizar dashboards executivos",
  "dashboard.financial_view": "Permite visualizar dashboards financeiros",
  "reports.export": "Permite exportar relatorios e artefatos",
  "users.manage": "Permite administrar usuarios",
};

export const allPermissions = Object.keys(permissionDescriptions) as Permission[];

const permissionGroupLabels: Record<string, string> = {
  projects: "Projetos",
  tasks: "Tarefas",
  estimates: "Estimativas",
  diex: "DIEx",
  service_orders: "Ordens de Servico",
  atas: "Atas",
  military_organizations: "Organizacoes Militares",
  sessions: "Sessoes",
  dashboard: "Dashboards",
  reports: "Relatorios",
  users: "Usuarios",
};

export type PermissionCatalogItem = {
  code: Permission;
  module: string;
  group: string;
  action: string;
  description: string;
  defaultRoles: UserRole[];
};

export const allRoles = [...roleValues];

function getDefaultRolesForPermission(code: Permission): UserRole[] {
  return allRoles.filter((role) => rolePermissions[role].includes(code));
}

export function getPermissionCatalogItem(code: Permission): PermissionCatalogItem {
  const [module, action] = code.split(".");

  return {
    code,
    module,
    group: permissionGroupLabels[module] ?? module,
    action,
    description: permissionDescriptions[code],
    defaultRoles: getDefaultRolesForPermission(code),
  };
}

export function getPermissionCatalog() {
  return allPermissions.map((code) => getPermissionCatalogItem(code));
}
