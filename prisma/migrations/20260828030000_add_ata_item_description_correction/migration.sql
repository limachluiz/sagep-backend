ALTER TABLE "AtaItem"
ADD COLUMN "externalDescription" TEXT,
ADD COLUMN "descriptionEditedAt" TIMESTAMP(3);

UPDATE "AtaItem"
SET "externalDescription" = "description"
WHERE "externalSource" = 'COMPRAS_GOV';
