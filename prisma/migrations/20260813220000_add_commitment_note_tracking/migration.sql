ALTER TYPE "AuditEntityType" ADD VALUE 'COMMITMENT_NOTE';
ALTER TYPE "AuditEntityType" ADD VALUE 'INVOICE';
ALTER TYPE "AuditEntityType" ADD VALUE 'NOTIFICATION';
ALTER TYPE "AuditActionType" ADD VALUE 'SYNC';
ALTER TYPE "AuditActionType" ADD VALUE 'DISMISS';

CREATE TYPE "CommitmentNoteFinancialStatus" AS ENUM (
  'NAO_LIQUIDADA',
  'PARCIALMENTE_LIQUIDADA',
  'LIQUIDADA',
  'PARCIALMENTE_PAGA',
  'PAGA',
  'PARCIALMENTE_ANULADA',
  'ANULADA'
);

CREATE TYPE "ExternalSyncStatus" AS ENUM ('VALIDADO', 'DIVERGENTE', 'ERRO');
CREATE TYPE "FinancialDocumentPhase" AS ENUM ('EMPENHO', 'LIQUIDACAO', 'PAGAMENTO', 'ANULACAO', 'OUTRO');

CREATE TABLE "CommitmentNote" (
  "id" TEXT NOT NULL,
  "commitmentNoteCode" SERIAL NOT NULL,
  "projectId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "externalCode" TEXT NOT NULL,
  "managementUnit" TEXT NOT NULL DEFAULT '160016',
  "management" TEXT NOT NULL DEFAULT '00001',
  "source" TEXT NOT NULL DEFAULT 'PORTAL_TRANSPARENCIA',
  "supplierName" TEXT,
  "supplierCnpj" TEXT,
  "issuedAt" TIMESTAMP(3),
  "originalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "currentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "liquidatedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "cancelledAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "financialStatus" "CommitmentNoteFinancialStatus" NOT NULL DEFAULT 'NAO_LIQUIDADA',
  "syncStatus" "ExternalSyncStatus" NOT NULL DEFAULT 'VALIDADO',
  "divergenceReason" TEXT,
  "rawSnapshot" JSONB,
  "lastSyncAt" TIMESTAMP(3) NOT NULL,
  "lastSyncError" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommitmentNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialDocument" (
  "id" TEXT NOT NULL,
  "commitmentNoteId" TEXT NOT NULL,
  "externalCode" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "phase" "FinancialDocumentPhase" NOT NULL,
  "species" TEXT,
  "issuedAt" TIMESTAMP(3),
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "supplierName" TEXT,
  "supplierCnpj" TEXT,
  "rawSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
  "id" TEXT NOT NULL,
  "invoiceCode" SERIAL NOT NULL,
  "projectId" TEXT NOT NULL,
  "commitmentNoteId" TEXT,
  "number" TEXT NOT NULL,
  "series" TEXT,
  "accessKey" TEXT,
  "supplierCnpj" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "grossAmount" DECIMAL(14,2) NOT NULL,
  "attestedAmount" DECIMAL(14,2),
  "attestedAt" TIMESTAMP(3),
  "documentLink" TEXT,
  "notes" TEXT,
  "registeredById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDismissal" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "notificationKey" TEXT NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommitmentNote_commitmentNoteCode_key" ON "CommitmentNote"("commitmentNoteCode");
CREATE UNIQUE INDEX "CommitmentNote_externalCode_key" ON "CommitmentNote"("externalCode");
CREATE INDEX "CommitmentNote_projectId_active_idx" ON "CommitmentNote"("projectId", "active");
CREATE INDEX "CommitmentNote_financialStatus_idx" ON "CommitmentNote"("financialStatus");
CREATE INDEX "CommitmentNote_syncStatus_idx" ON "CommitmentNote"("syncStatus");
CREATE INDEX "CommitmentNote_lastSyncAt_idx" ON "CommitmentNote"("lastSyncAt");
CREATE UNIQUE INDEX "FinancialDocument_commitmentNoteId_externalCode_key" ON "FinancialDocument"("commitmentNoteId", "externalCode");
CREATE INDEX "FinancialDocument_phase_issuedAt_idx" ON "FinancialDocument"("phase", "issuedAt");
CREATE UNIQUE INDEX "Invoice_invoiceCode_key" ON "Invoice"("invoiceCode");
CREATE UNIQUE INDEX "Invoice_accessKey_key" ON "Invoice"("accessKey");
CREATE INDEX "Invoice_projectId_issuedAt_idx" ON "Invoice"("projectId", "issuedAt");
CREATE INDEX "Invoice_commitmentNoteId_idx" ON "Invoice"("commitmentNoteId");
CREATE UNIQUE INDEX "NotificationDismissal_userId_notificationKey_key" ON "NotificationDismissal"("userId", "notificationKey");
CREATE INDEX "NotificationDismissal_userId_dismissedAt_idx" ON "NotificationDismissal"("userId", "dismissedAt");

ALTER TABLE "CommitmentNote" ADD CONSTRAINT "CommitmentNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialDocument" ADD CONSTRAINT "FinancialDocument_commitmentNoteId_fkey" FOREIGN KEY ("commitmentNoteId") REFERENCES "CommitmentNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_commitmentNoteId_fkey" FOREIGN KEY ("commitmentNoteId") REFERENCES "CommitmentNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationDismissal" ADD CONSTRAINT "NotificationDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "description", "createdAt", "updatedAt")
VALUES
  ('perm:financial_execution.view', 'financial_execution.view', 'Permite consultar Notas de Empenho, liquidacoes, pagamentos e NFe', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm:financial_execution.manage', 'financial_execution.manage', 'Permite validar e vincular Notas de Empenho e registrar NFe', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('perm:financial_execution.sync', 'financial_execution.sync', 'Permite sincronizar a execucao financeira com o Portal da Transparencia', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "RolePermission" ("id", "role", "permissionId", "createdAt")
SELECT
  'role:' || role_name || ':' || permission_code,
  role_name::"UserRole",
  permission."id",
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('ADMIN', 'financial_execution.view'),
    ('ADMIN', 'financial_execution.manage'),
    ('ADMIN', 'financial_execution.sync'),
    ('GESTOR', 'financial_execution.view'),
    ('GESTOR', 'financial_execution.manage'),
    ('GESTOR', 'financial_execution.sync')
) AS grants(role_name, permission_code)
JOIN "Permission" permission ON permission."code" = permission_code
ON CONFLICT ("role", "permissionId") DO NOTHING;
