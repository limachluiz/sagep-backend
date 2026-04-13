-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('RASCUNHO', 'FINALIZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "Estimate" (
    "id" TEXT NOT NULL,
    "estimateCode" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "coverageGroupId" TEXT NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'RASCUNHO',
    "omName" TEXT,
    "destinationCityName" TEXT NOT NULL,
    "destinationStateUf" "FederativeUnit" NOT NULL,
    "notes" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateItem" (
    "id" TEXT NOT NULL,
    "estimateItemCode" SERIAL NOT NULL,
    "estimateId" TEXT NOT NULL,
    "ataItemId" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_estimateCode_key" ON "Estimate"("estimateCode");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateItem_estimateItemCode_key" ON "EstimateItem"("estimateItemCode");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateItem_estimateId_ataItemId_key" ON "EstimateItem"("estimateId", "ataItemId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "Ata"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_coverageGroupId_fkey" FOREIGN KEY ("coverageGroupId") REFERENCES "AtaCoverageGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_ataItemId_fkey" FOREIGN KEY ("ataItemId") REFERENCES "AtaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
