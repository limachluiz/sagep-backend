ALTER TYPE "InvoiceSource" ADD VALUE 'SEFAZ';
CREATE TABLE "NfeOfficialConsultation" (
 "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL,
 "commitmentNoteId" TEXT NOT NULL, "accessKey" TEXT NOT NULL,
 "environment" TEXT NOT NULL, "interestedCnpj" TEXT NOT NULL,
 "requestedById" TEXT NOT NULL, "queriedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "result" JSONB NOT NULL
);
CREATE INDEX "NfeOfficialConsultation_projectId_accessKey_queriedAt_idx" ON "NfeOfficialConsultation"("projectId", "accessKey", "queriedAt");
CREATE TABLE "NfeDistributionState" (
 "id" TEXT NOT NULL PRIMARY KEY, "busyUntil" TIMESTAMP(3), "blockedUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL
);
