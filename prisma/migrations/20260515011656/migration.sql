-- DropIndex
DROP INDEX "Ata_externalSource_externalUasg_externalPregaoNumber_externalPr";

-- DropIndex
DROP INDEX "AtaItem_externalSource_externalItemId_idx";

-- CreateTable
CREATE TABLE "AtaItemExternalBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "ataItemId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "externalUsageStatus" TEXT,
    "managedBalance" JSONB,
    "adhesionBalance" JSONB,
    "commitments" JSONB,
    "nonParticipantCommitments" JSONB,
    "difference" TEXT,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtaItemExternalBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtaItemExternalBalanceSnapshot_ataItemId_key" ON "AtaItemExternalBalanceSnapshot"("ataItemId");

-- CreateIndex
CREATE INDEX "AtaItemExternalBalanceSnapshot_lastSyncAt_idx" ON "AtaItemExternalBalanceSnapshot"("lastSyncAt");

-- AddForeignKey
ALTER TABLE "AtaItemExternalBalanceSnapshot" ADD CONSTRAINT "AtaItemExternalBalanceSnapshot_ataItemId_fkey" FOREIGN KEY ("ataItemId") REFERENCES "AtaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
