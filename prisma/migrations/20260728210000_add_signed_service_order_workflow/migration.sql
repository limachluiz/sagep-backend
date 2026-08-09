ALTER TYPE "ProjectStage" ADD VALUE IF NOT EXISTS 'AGUARDANDO_OS_ASSINADA' AFTER 'OS_LIBERADA';
ALTER TYPE "ProjectStage" ADD VALUE IF NOT EXISTS 'AGUARDANDO_INICIO_EXECUCAO' AFTER 'AGUARDANDO_OS_ASSINADA';

ALTER TABLE "Project"
ADD COLUMN "serviceOrderSignatureRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "signedServiceOrderLink" TEXT,
ADD COLUMN "signedServiceOrderReceivedAt" TIMESTAMP(3),
ADD COLUMN "signedServiceOrderNotes" TEXT,
ADD COLUMN "signedServiceOrderRegisteredById" TEXT;

ALTER TABLE "Project"
ADD CONSTRAINT "Project_signedServiceOrderRegisteredById_fkey"
FOREIGN KEY ("signedServiceOrderRegisteredById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Project_signedServiceOrderRegisteredById_idx"
ON "Project"("signedServiceOrderRegisteredById");
