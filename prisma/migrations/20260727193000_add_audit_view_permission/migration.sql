INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES (
  'perm:audit.view',
  'audit.view',
  'Permite visualizar detalhes tecnicos dos registros de auditoria',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "role", "permissionId", "createdAt")
SELECT
  'role:' || role_name || ':audit.view',
  role_name::"UserRole",
  permission."id",
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('ADMIN'),
    ('GESTOR')
) AS grants(role_name)
JOIN "Permission" permission ON permission."code" = 'audit.view'
ON CONFLICT ("role", "permissionId") DO NOTHING;
