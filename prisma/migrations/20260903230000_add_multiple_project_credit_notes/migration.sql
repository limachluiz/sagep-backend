CREATE TYPE "CreditNoteMode" AS ENUM ('SINGLE', 'MULTIPLE');
CREATE TYPE "CreditNoteStatus" AS ENUM ('ACTIVE', 'PARTIALLY_CANCELLED', 'CANCELLED');

ALTER TABLE "Project"
ADD COLUMN "creditNoteMode" "CreditNoteMode" NOT NULL DEFAULT 'SINGLE',
ADD COLUMN "creditNoteOverflowJustification" TEXT;

CREATE TABLE "ProjectCreditNote" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "cancelledAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "status" "CreditNoteStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuingManagementUnit" TEXT,
  "fundingSource" TEXT,
  "ptres" TEXT,
  "expenseNature" TEXT,
  "internalPlan" TEXT,
  "documentLink" TEXT,
  "notes" TEXT,
  "cancellationReason" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectCreditNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectCreditNote_projectId_number_key" ON "ProjectCreditNote"("projectId", "number");
CREATE INDEX "ProjectCreditNote_projectId_status_receivedAt_idx" ON "ProjectCreditNote"("projectId", "status", "receivedAt");
ALTER TABLE "ProjectCreditNote" ADD CONSTRAINT "ProjectCreditNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProjectCreditNote" ("id", "projectId", "number", "receivedAt", "amount", "updatedAt")
SELECT
  'legacy-' || p."id",
  p."id",
  p."creditNoteNumber",
  COALESCE(p."creditNoteReceivedAt", CURRENT_TIMESTAMP),
  COALESCE((
    SELECT SUM(e."totalAmount")
    FROM "Estimate" e
    WHERE e."projectId" = p."id" AND e."status" = 'FINALIZADA' AND e."archivedAt" IS NULL AND e."deletedAt" IS NULL
  ), 0),
  CURRENT_TIMESTAMP
FROM "Project" p
WHERE p."creditNoteNumber" IS NOT NULL;
