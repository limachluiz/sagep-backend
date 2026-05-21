ALTER TABLE "Ata"
  ADD COLUMN "externalSource" TEXT,
  ADD COLUMN "externalUasg" TEXT,
  ADD COLUMN "externalPregaoNumber" TEXT,
  ADD COLUMN "externalPregaoYear" TEXT,
  ADD COLUMN "externalAtaNumber" TEXT,
  ADD COLUMN "externalLastSyncAt" TIMESTAMP(3);

ALTER TABLE "AtaItem"
  ADD COLUMN "externalSource" TEXT,
  ADD COLUMN "externalItemId" TEXT,
  ADD COLUMN "externalItemNumber" TEXT,
  ADD COLUMN "externalLastSyncAt" TIMESTAMP(3);

CREATE INDEX "Ata_externalSource_externalUasg_externalPregaoNumber_externalPregaoYear_externalAtaNumber_idx"
  ON "Ata"("externalSource", "externalUasg", "externalPregaoNumber", "externalPregaoYear", "externalAtaNumber");

CREATE INDEX "AtaItem_externalSource_externalItemId_idx"
  ON "AtaItem"("externalSource", "externalItemId");
