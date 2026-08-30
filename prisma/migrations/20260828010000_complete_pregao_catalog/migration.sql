ALTER TABLE "Pregao"
ADD COLUMN "openingAt" TIMESTAMP(3),
ADD COLUMN "homologatedAt" TIMESTAMP(3);

ALTER TABLE "Ata"
ADD COLUMN "externalFingerprint" TEXT;
