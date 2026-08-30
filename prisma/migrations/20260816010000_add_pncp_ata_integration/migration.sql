ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'PNCP';

ALTER TABLE "SystemConfiguration"
ADD COLUMN "pncpBaseUrl" TEXT NOT NULL DEFAULT 'https://pncp.gov.br/api/pncp';

ALTER TABLE "Ata"
ADD COLUMN "externalPncpControlNumber" TEXT,
ADD COLUMN "pncpLastSyncAt" TIMESTAMP(3),
ADD COLUMN "pncpSnapshot" JSONB;
