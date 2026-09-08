ALTER TABLE "Ata"
ADD COLUMN "externalContratosAtaId" TEXT;

CREATE TABLE "AtaItemExternalBalanceSnapshot" (
    "id" TEXT NOT NULL,
    "ataItemId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalItemNumber" TEXT NOT NULL,
    "managerRegisteredQuantity" DECIMAL(18,5),
    "managerCommittedQuantity" DECIMAL(18,5),
    "managerAvailableQuantity" DECIMAL(18,5),
    "publishedTotalRegisteredAuthorized" DECIMAL(18,5) NOT NULL,
    "publishedTotalAvailableForCommitment" DECIMAL(18,5) NOT NULL,
    "publishedAdhesionLimit" DECIMAL(18,5) NOT NULL,
    "publishedAvailableForAdhesion" DECIMAL(18,5) NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "rawSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtaItemExternalBalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtaItemExternalBalanceSnapshot_ataItemId_key"
ON "AtaItemExternalBalanceSnapshot"("ataItemId");

CREATE INDEX "AtaItemExternalBalanceSnapshot_checkedAt_idx"
ON "AtaItemExternalBalanceSnapshot"("checkedAt");

ALTER TABLE "AtaItemExternalBalanceSnapshot"
ADD CONSTRAINT "AtaItemExternalBalanceSnapshot_ataItemId_fkey"
FOREIGN KEY ("ataItemId") REFERENCES "AtaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
