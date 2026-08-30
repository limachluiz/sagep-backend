ALTER TYPE "AuditEntityType" ADD VALUE 'SYSTEM_SETTINGS';
ALTER TYPE "AuditActionType" ADD VALUE 'CONNECTION_TEST';

CREATE TYPE "IntegrationProvider" AS ENUM ('DATABASE', 'PORTAL_TRANSPARENCIA', 'COMPRAS_GOV');
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('OPERATIONAL', 'DEGRADED', 'UNAVAILABLE', 'NOT_CONFIGURED');

CREATE TABLE "SystemConfiguration" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "organizationName" TEXT NOT NULL DEFAULT '4º Centro de Telemática de Área',
  "organizationAcronym" TEXT NOT NULL DEFAULT '4º CTA',
  "uasg" TEXT NOT NULL DEFAULT '160016',
  "management" TEXT NOT NULL DEFAULT '00001',
  "timeZone" TEXT NOT NULL DEFAULT 'America/Manaus',
  "commandName" TEXT NOT NULL DEFAULT 'COMANDO MILITAR DA AMAZÔNIA',
  "portalTransparenciaBaseUrl" TEXT NOT NULL DEFAULT 'https://api.portaldatransparencia.gov.br/api-de-dados',
  "portalSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
  "portalSyncOnStartup" BOOLEAN NOT NULL DEFAULT true,
  "comprasGovBaseUrl" TEXT NOT NULL DEFAULT 'https://dadosabertos.compras.gov.br',
  "defaultBiddingNumber" TEXT,
  "defaultBiddingYear" INTEGER,
  "defaultImmediateCommitment" BOOLEAN NOT NULL DEFAULT true,
  "defaultEstimateGroup" TEXT NOT NULL DEFAULT '3',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationConnectionCheck" (
  "id" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" "IntegrationConnectionStatus" NOT NULL,
  "latencyMs" INTEGER,
  "httpStatus" INTEGER,
  "message" TEXT NOT NULL,
  "details" JSONB,
  "checkedById" TEXT,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationConnectionCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationConnectionCheck_provider_checkedAt_idx" ON "IntegrationConnectionCheck"("provider", "checkedAt");
CREATE INDEX "IntegrationConnectionCheck_checkedById_checkedAt_idx" ON "IntegrationConnectionCheck"("checkedById", "checkedAt");
ALTER TABLE "SystemConfiguration" ADD CONSTRAINT "SystemConfiguration_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnectionCheck" ADD CONSTRAINT "IntegrationConnectionCheck_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SystemConfiguration" (
  "id", "organizationName", "organizationAcronym", "uasg", "management", "timeZone", "commandName",
  "portalTransparenciaBaseUrl", "portalSyncIntervalMinutes", "portalSyncOnStartup",
  "comprasGovBaseUrl", "defaultImmediateCommitment", "defaultEstimateGroup", "createdAt", "updatedAt"
) VALUES (
  'default', '4º Centro de Telemática de Área', '4º CTA', '160016', '00001', 'America/Manaus', 'COMANDO MILITAR DA AMAZÔNIA',
  'https://api.portaldatransparencia.gov.br/api-de-dados', 1440, true,
  'https://dadosabertos.compras.gov.br', true, '3', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES
  ('perm:settings.view', 'settings.view', 'Permite consultar parametros institucionais e integracoes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm:settings.manage', 'settings.manage', 'Permite alterar parametros e testar integracoes externas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "role", "permissionId", "createdAt")
SELECT 'role:' || role_name || ':' || permission_code, role_name::"UserRole", permission."id", CURRENT_TIMESTAMP
FROM (VALUES
  ('ADMIN', 'settings.view'), ('ADMIN', 'settings.manage'), ('GESTOR', 'settings.view'),
  ('PROJETISTA', 'settings.view'), ('CONSULTA', 'settings.view')
) AS grants(role_name, permission_code)
JOIN "Permission" permission ON permission."code" = permission_code
ON CONFLICT ("role", "permissionId") DO NOTHING;
