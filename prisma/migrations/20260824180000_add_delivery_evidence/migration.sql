ALTER TYPE "ProjectStage" ADD VALUE IF NOT EXISTS 'ENTREGA_TECNICA' BEFORE 'SERVICO_CONCLUIDO';

CREATE TYPE "EvidenceCategory" AS ENUM ('IMAGE', 'VIDEO', 'KMZ_KML', 'TECHNICAL_DOCUMENT', 'CERTIFICATION', 'DIAGRAM', 'AS_BUILT', 'OTHER');
CREATE TYPE "EvidencePhase" AS ENUM ('BEFORE', 'DURING', 'AFTER', 'GENERAL');

ALTER TABLE "Project"
  ADD COLUMN "deliveryReportGeneratedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryReportSignedAt" TIMESTAMP(3),
  ADD COLUMN "deliveryReportSignedLink" TEXT;

CREATE TABLE "ProjectEvidence" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "taskId" TEXT,
  "uploadedById" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" "EvidenceCategory" NOT NULL,
  "phase" "EvidencePhase" NOT NULL DEFAULT 'GENERAL',
  "includeInReport" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectEvidence_storageKey_key" ON "ProjectEvidence"("storageKey");
CREATE INDEX "ProjectEvidence_projectId_includeInReport_sortOrder_idx" ON "ProjectEvidence"("projectId", "includeInReport", "sortOrder");
CREATE INDEX "ProjectEvidence_taskId_createdAt_idx" ON "ProjectEvidence"("taskId", "createdAt");
ALTER TABLE "ProjectEvidence" ADD CONSTRAINT "ProjectEvidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectEvidence" ADD CONSTRAINT "ProjectEvidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectEvidence" ADD CONSTRAINT "ProjectEvidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
