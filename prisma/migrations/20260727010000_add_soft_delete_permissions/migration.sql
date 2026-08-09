INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES
  ('perm:projects.delete', 'projects.delete', 'Permite excluir logicamente projetos arquivados', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm:tasks.delete', 'tasks.delete', 'Permite excluir logicamente tarefas arquivadas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm:estimates.delete', 'estimates.delete', 'Permite excluir logicamente estimativas arquivadas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm:diex.delete', 'diex.delete', 'Permite excluir logicamente DIEx arquivados', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm:service_orders.delete', 'service_orders.delete', 'Permite excluir logicamente ordens de servico arquivadas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
    ('ADMIN', 'projects.delete'),
    ('ADMIN', 'tasks.delete'),
    ('ADMIN', 'estimates.delete'),
    ('ADMIN', 'diex.delete'),
    ('ADMIN', 'service_orders.delete'),
    ('GESTOR', 'projects.delete'),
    ('GESTOR', 'tasks.delete'),
    ('GESTOR', 'estimates.delete'),
    ('GESTOR', 'diex.delete'),
    ('GESTOR', 'service_orders.delete'),
    ('PROJETISTA', 'projects.delete'),
    ('PROJETISTA', 'tasks.delete'),
    ('PROJETISTA', 'estimates.delete'),
    ('PROJETISTA', 'diex.delete'),
    ('PROJETISTA', 'service_orders.delete')
) AS grants(role_name, permission_code)
JOIN "Permission" permission ON permission."code" = permission_code
ON CONFLICT ("role", "permissionId") DO NOTHING;
