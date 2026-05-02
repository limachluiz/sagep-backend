DO $$
BEGIN
  CREATE TYPE "AtaItemBalanceMovementType" AS ENUM (
    'RESERVE',
    'RELEASE',
    'CONSUME',
    'REVERSE_CONSUME',
    'ADJUSTMENT'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "AtaItem"
ADD COLUMN IF NOT EXISTS "initialQuantity" DECIMAL(14,2) NOT NULL DEFAULT 1000,
ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AtaItemBalanceMovement" (
  "id" TEXT NOT NULL,
  "ataItemId" TEXT NOT NULL,
  "projectId" TEXT,
  "estimateId" TEXT,
  "estimateItemId" TEXT,
  "diexRequestId" TEXT,
  "serviceOrderId" TEXT,
  "actorUserId" TEXT,
  "actorName" TEXT,
  "movementType" "AtaItemBalanceMovementType" NOT NULL,
  "quantity" DECIMAL(14,2) NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AtaItemBalanceMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AtaItemBalanceMovement_ataItemId_createdAt_idx" ON "AtaItemBalanceMovement"("ataItemId", "createdAt");

CREATE INDEX IF NOT EXISTS "AtaItemBalanceMovement_projectId_createdAt_idx" ON "AtaItemBalanceMovement"("projectId", "createdAt");

CREATE INDEX IF NOT EXISTS "AtaItemBalanceMovement_estimateId_createdAt_idx" ON "AtaItemBalanceMovement"("estimateId", "createdAt");

CREATE INDEX IF NOT EXISTS "AtaItemBalanceMovement_diexRequestId_createdAt_idx" ON "AtaItemBalanceMovement"("diexRequestId", "createdAt");

CREATE INDEX IF NOT EXISTS "AtaItemBalanceMovement_serviceOrderId_createdAt_idx" ON "AtaItemBalanceMovement"("serviceOrderId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "AtaItemBalanceMovement"
  ADD CONSTRAINT "AtaItemBalanceMovement_ataItemId_fkey"
  FOREIGN KEY ("ataItemId") REFERENCES "AtaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AtaItemBalanceMovement"
  ADD CONSTRAINT "AtaItemBalanceMovement_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AtaItemBalanceMovement"
  ADD CONSTRAINT "AtaItemBalanceMovement_estimateId_fkey"
  FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AtaItemBalanceMovement"
  ADD CONSTRAINT "AtaItemBalanceMovement_estimateItemId_fkey"
  FOREIGN KEY ("estimateItemId") REFERENCES "EstimateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AtaItemBalanceMovement"
  ADD CONSTRAINT "AtaItemBalanceMovement_diexRequestId_fkey"
  FOREIGN KEY ("diexRequestId") REFERENCES "DiexRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AtaItemBalanceMovement"
  ADD CONSTRAINT "AtaItemBalanceMovement_serviceOrderId_fkey"
  FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
