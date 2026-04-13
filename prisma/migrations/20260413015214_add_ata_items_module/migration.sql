-- CreateTable
CREATE TABLE "AtaItem" (
    "id" TEXT NOT NULL,
    "ataItemCode" SERIAL NOT NULL,
    "ataId" TEXT NOT NULL,
    "coverageGroupId" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtaItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AtaItem_ataItemCode_key" ON "AtaItem"("ataItemCode");

-- CreateIndex
CREATE UNIQUE INDEX "AtaItem_ataId_coverageGroupId_referenceCode_key" ON "AtaItem"("ataId", "coverageGroupId", "referenceCode");

-- AddForeignKey
ALTER TABLE "AtaItem" ADD CONSTRAINT "AtaItem_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "Ata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtaItem" ADD CONSTRAINT "AtaItem_coverageGroupId_fkey" FOREIGN KEY ("coverageGroupId") REFERENCES "AtaCoverageGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
