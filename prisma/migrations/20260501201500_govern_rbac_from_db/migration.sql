CREATE TYPE "PermissionOverrideEffect" AS ENUM ('ALLOW', 'DENY');

CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserPermissionOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "effect" "PermissionOverrideEffect" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPermissionOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RolePermission_role_permissionId_key" ON "RolePermission"("role", "permissionId");
CREATE UNIQUE INDEX "UserPermissionOverride_userId_permissionId_key" ON "UserPermissionOverride"("userId", "permissionId");

ALTER TABLE "RolePermission"
ADD CONSTRAINT "RolePermission_permissionId_fkey"
FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermissionOverride"
ADD CONSTRAINT "UserPermissionOverride_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserPermissionOverride"
ADD CONSTRAINT "UserPermissionOverride_permissionId_fkey"
FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES
    ('perm:projects.view_all', 'projects.view_all', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:projects.edit_own', 'projects.edit_own', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:projects.edit_all', 'projects.edit_all', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:projects.restore', 'projects.restore', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:projects.complete', 'projects.complete', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:projects.reopen', 'projects.reopen', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:tasks.view_all', 'tasks.view_all', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:tasks.create', 'tasks.create', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:tasks.edit_all', 'tasks.edit_all', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:tasks.edit_own', 'tasks.edit_own', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:tasks.assign', 'tasks.assign', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:tasks.complete', 'tasks.complete', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:tasks.archive', 'tasks.archive', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:tasks.restore', 'tasks.restore', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:estimates.view_all', 'estimates.view_all', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:estimates.create', 'estimates.create', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:estimates.edit', 'estimates.edit', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:estimates.finalize', 'estimates.finalize', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:estimates.archive', 'estimates.archive', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:estimates.restore', 'estimates.restore', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:diex.issue', 'diex.issue', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:diex.cancel', 'diex.cancel', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:diex.restore', 'diex.restore', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:service_orders.issue', 'service_orders.issue', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:service_orders.cancel', 'service_orders.cancel', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:service_orders.restore', 'service_orders.restore', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:atas.manage', 'atas.manage', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:military_organizations.manage', 'military_organizations.manage', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:sessions.manage_own', 'sessions.manage_own', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:sessions.manage_all', 'sessions.manage_all', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:dashboard.view_operational', 'dashboard.view_operational', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:dashboard.view_executive', 'dashboard.view_executive', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:dashboard.financial_view', 'dashboard.financial_view', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:reports.export', 'reports.export', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('perm:users.manage', 'users.manage', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "role", "permissionId", "createdAt")
SELECT
    'role:' || rp."role" || ':' || rp."code",
    rp."role"::"UserRole",
    p."id",
    CURRENT_TIMESTAMP
FROM (
    VALUES
        ('ADMIN', 'projects.view_all'),
        ('ADMIN', 'projects.edit_own'),
        ('ADMIN', 'projects.edit_all'),
        ('ADMIN', 'projects.restore'),
        ('ADMIN', 'projects.complete'),
        ('ADMIN', 'projects.reopen'),
        ('ADMIN', 'tasks.view_all'),
        ('ADMIN', 'tasks.create'),
        ('ADMIN', 'tasks.edit_all'),
        ('ADMIN', 'tasks.edit_own'),
        ('ADMIN', 'tasks.assign'),
        ('ADMIN', 'tasks.complete'),
        ('ADMIN', 'tasks.archive'),
        ('ADMIN', 'tasks.restore'),
        ('ADMIN', 'estimates.view_all'),
        ('ADMIN', 'estimates.create'),
        ('ADMIN', 'estimates.edit'),
        ('ADMIN', 'estimates.finalize'),
        ('ADMIN', 'estimates.archive'),
        ('ADMIN', 'estimates.restore'),
        ('ADMIN', 'diex.issue'),
        ('ADMIN', 'diex.cancel'),
        ('ADMIN', 'diex.restore'),
        ('ADMIN', 'service_orders.issue'),
        ('ADMIN', 'service_orders.cancel'),
        ('ADMIN', 'service_orders.restore'),
        ('ADMIN', 'atas.manage'),
        ('ADMIN', 'military_organizations.manage'),
        ('ADMIN', 'sessions.manage_own'),
        ('ADMIN', 'sessions.manage_all'),
        ('ADMIN', 'dashboard.view_operational'),
        ('ADMIN', 'dashboard.view_executive'),
        ('ADMIN', 'dashboard.financial_view'),
        ('ADMIN', 'reports.export'),
        ('ADMIN', 'users.manage'),
        ('GESTOR', 'projects.view_all'),
        ('GESTOR', 'projects.edit_own'),
        ('GESTOR', 'projects.edit_all'),
        ('GESTOR', 'projects.restore'),
        ('GESTOR', 'projects.complete'),
        ('GESTOR', 'projects.reopen'),
        ('GESTOR', 'tasks.view_all'),
        ('GESTOR', 'tasks.create'),
        ('GESTOR', 'tasks.edit_all'),
        ('GESTOR', 'tasks.edit_own'),
        ('GESTOR', 'tasks.assign'),
        ('GESTOR', 'tasks.complete'),
        ('GESTOR', 'tasks.archive'),
        ('GESTOR', 'tasks.restore'),
        ('GESTOR', 'estimates.view_all'),
        ('GESTOR', 'estimates.create'),
        ('GESTOR', 'estimates.edit'),
        ('GESTOR', 'estimates.finalize'),
        ('GESTOR', 'estimates.archive'),
        ('GESTOR', 'estimates.restore'),
        ('GESTOR', 'diex.issue'),
        ('GESTOR', 'diex.cancel'),
        ('GESTOR', 'diex.restore'),
        ('GESTOR', 'service_orders.issue'),
        ('GESTOR', 'service_orders.cancel'),
        ('GESTOR', 'service_orders.restore'),
        ('GESTOR', 'sessions.manage_own'),
        ('GESTOR', 'dashboard.view_operational'),
        ('GESTOR', 'dashboard.view_executive'),
        ('GESTOR', 'dashboard.financial_view'),
        ('GESTOR', 'reports.export'),
        ('PROJETISTA', 'projects.edit_own'),
        ('PROJETISTA', 'projects.complete'),
        ('PROJETISTA', 'tasks.create'),
        ('PROJETISTA', 'tasks.edit_own'),
        ('PROJETISTA', 'tasks.complete'),
        ('PROJETISTA', 'estimates.create'),
        ('PROJETISTA', 'estimates.edit'),
        ('PROJETISTA', 'estimates.finalize'),
        ('PROJETISTA', 'diex.issue'),
        ('PROJETISTA', 'service_orders.issue'),
        ('PROJETISTA', 'sessions.manage_own'),
        ('PROJETISTA', 'dashboard.view_operational'),
        ('PROJETISTA', 'reports.export'),
        ('CONSULTA', 'tasks.view_all'),
        ('CONSULTA', 'estimates.view_all'),
        ('CONSULTA', 'sessions.manage_own'),
        ('CONSULTA', 'dashboard.view_operational')
) AS rp("role", "code")
JOIN "Permission" p ON p."code" = rp."code"
ON CONFLICT ("role", "permissionId") DO NOTHING;

INSERT INTO "UserPermissionOverride" ("id", "userId", "permissionId", "effect", "createdAt", "updatedAt")
SELECT
    'override:' || up."userId" || ':' || up."permissionId",
    up."userId",
    up."permissionId",
    'ALLOW'::"PermissionOverrideEffect",
    up."createdAt",
    CURRENT_TIMESTAMP
FROM "UserPermission" up
ON CONFLICT ("userId", "permissionId") DO NOTHING;

DROP TABLE "UserPermission";
