CREATE TYPE "InvoiceSource" AS ENUM ('MANUAL', 'XML');
CREATE TYPE "InvoiceConferenceStatus" AS ENUM ('PENDING', 'CONFERRED', 'DIVERGENT');
CREATE TYPE "DocumentSignatureStatus" AS ENUM ('NOT_SIGNED', 'PENDING_VALIDATION', 'VALID', 'INVALID');
ALTER TYPE "AuditEntityType" ADD VALUE 'DOCUMENT_VERSION';

ALTER TABLE "Invoice"
ADD COLUMN "source" "InvoiceSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "conferenceStatus" "InvoiceConferenceStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "conferenceDetails" JSONB,
ADD COLUMN "xmlChecksumSha256" TEXT,
ADD COLUMN "issuerName" TEXT,
ADD COLUMN "recipientCnpj" TEXT,
ADD COLUMN "itemCount" INTEGER;

CREATE INDEX "Invoice_conferenceStatus_issuedAt_idx" ON "Invoice"("conferenceStatus", "issuedAt");

CREATE TABLE "DocumentVersion" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "storageKey" TEXT NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "reason" TEXT,
  "generatedById" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "originalVersionId" TEXT,
  "signatureStatus" "DocumentSignatureStatus" NOT NULL DEFAULT 'NOT_SIGNED',
  "signatureProvider" TEXT,
  "signerName" TEXT,
  "signerDocument" TEXT,
  "signedAt" TIMESTAMP(3),
  "validationDetails" JSONB,
  "invalidatedAt" TIMESTAMP(3),
  "invalidationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentVersion_entityType_entityId_documentType_version_key" ON "DocumentVersion"("entityType", "entityId", "documentType", "version");
CREATE INDEX "DocumentVersion_entityType_entityId_documentType_generatedAt_idx" ON "DocumentVersion"("entityType", "entityId", "documentType", "generatedAt");
CREATE INDEX "DocumentVersion_originalVersionId_idx" ON "DocumentVersion"("originalVersionId");
CREATE INDEX "DocumentVersion_checksumSha256_idx" ON "DocumentVersion"("checksumSha256");

ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_originalVersionId_fkey" FOREIGN KEY ("originalVersionId") REFERENCES "DocumentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
