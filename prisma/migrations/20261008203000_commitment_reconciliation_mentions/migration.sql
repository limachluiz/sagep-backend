CREATE TYPE "CommitmentReconciliationStatus" AS ENUM ('CONFIRMED', 'REVERSED');

ALTER TABLE "NotificationAutomationConfiguration"
  ADD COLUMN "mentionEscalationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mentionEscalationHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "mentionEscalationRoles" "UserRole"[] NOT NULL DEFAULT ARRAY['ADMIN', 'GESTOR']::"UserRole"[];

CREATE TABLE "EntityMention" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "notificationId" TEXT,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "projectId" TEXT,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "sourceText" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "escalatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EntityMention_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EntityMention_eventKey_key" ON "EntityMention"("eventKey");
CREATE UNIQUE INDEX "EntityMention_notificationId_key" ON "EntityMention"("notificationId");
CREATE INDEX "EntityMention_recipientId_resolvedAt_createdAt_idx" ON "EntityMention"("recipientId", "resolvedAt", "createdAt");
CREATE INDEX "EntityMention_projectId_entityType_entityId_idx" ON "EntityMention"("projectId", "entityType", "entityId");
CREATE INDEX "EntityMention_escalatedAt_resolvedAt_createdAt_idx" ON "EntityMention"("escalatedAt", "resolvedAt", "createdAt");

CREATE TABLE "CommitmentReconciliation" (
  "id" TEXT NOT NULL,
  "discoveredCommitmentId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "ataId" TEXT NOT NULL,
  "status" "CommitmentReconciliationStatus" NOT NULL DEFAULT 'CONFIRMED',
  "confidenceScore" INTEGER NOT NULL,
  "evidence" JSONB NOT NULL,
  "reason" TEXT,
  "applyToBalance" BOOLEAN NOT NULL DEFAULT true,
  "confirmedById" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedById" TEXT,
  "reversedAt" TIMESTAMP(3),
  "reversalReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommitmentReconciliation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommitmentReconciliation_discoveredCommitmentId_status_idx" ON "CommitmentReconciliation"("discoveredCommitmentId", "status");
CREATE INDEX "CommitmentReconciliation_projectId_status_idx" ON "CommitmentReconciliation"("projectId", "status");
CREATE INDEX "CommitmentReconciliation_ataId_status_idx" ON "CommitmentReconciliation"("ataId", "status");

CREATE TABLE "CommitmentReconciliationAllocation" (
  "id" TEXT NOT NULL,
  "reconciliationId" TEXT NOT NULL,
  "ataItemId" TEXT NOT NULL,
  "quantity" DECIMAL(18,5) NOT NULL,
  "unitPrice" DECIMAL(14,2) NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommitmentReconciliationAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommitmentReconciliationAllocation_reconciliationId_ataItemId_key" ON "CommitmentReconciliationAllocation"("reconciliationId", "ataItemId");
CREATE INDEX "CommitmentReconciliationAllocation_ataItemId_idx" ON "CommitmentReconciliationAllocation"("ataItemId");
ALTER TABLE "CommitmentReconciliationAllocation" ADD CONSTRAINT "CommitmentReconciliationAllocation_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "CommitmentReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
