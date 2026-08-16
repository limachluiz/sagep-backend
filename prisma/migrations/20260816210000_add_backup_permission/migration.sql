INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES (
  'perm:backups.manage',
  'backups.manage',
  'Permite criar, baixar, importar, excluir e restaurar backups do banco',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "role", "permissionId", "createdAt")
SELECT
  'role:ADMIN:backups.manage',
  'ADMIN'::"UserRole",
  permission."id",
  CURRENT_TIMESTAMP
FROM "Permission" permission
WHERE permission."code" = 'backups.manage'
ON CONFLICT ("role", "permissionId") DO NOTHING;
