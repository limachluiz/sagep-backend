INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES
  ('perm:system_health.view', 'system_health.view', 'Permite consultar o estado geral de saude do SAGEP', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm:system_health.view_details', 'system_health.view_details', 'Permite consultar diagnosticos tecnicos do ambiente', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "role", "permissionId", "createdAt")
SELECT
  'role:' || role_name || ':' || permission_code,
  role_name::"UserRole",
  permission."id",
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('ADMIN', 'system_health.view'),
    ('ADMIN', 'system_health.view_details'),
    ('GESTOR', 'system_health.view'),
    ('PROJETISTA', 'system_health.view'),
    ('CONSULTA', 'system_health.view')
) AS grants(role_name, permission_code)
JOIN "Permission" permission ON permission."code" = permission_code
ON CONFLICT ("role", "permissionId") DO NOTHING;
