-- CreateTable
CREATE TABLE "DiexRequest" (
    "id" TEXT NOT NULL,
    "diexCode" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "diexNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "issuingOrganization" TEXT NOT NULL DEFAULT '4º CTA',
    "commandName" TEXT NOT NULL DEFAULT 'COMANDO MILITAR DA AMAZÔNIA',
    "pregaoNumber" TEXT NOT NULL DEFAULT '04/2025',
    "uasg" TEXT NOT NULL DEFAULT '160016',
    "supplierName" TEXT NOT NULL,
    "supplierCnpj" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterRank" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL DEFAULT 'Requisitante',
    "notes" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiexRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiexRequestItem" (
    "id" TEXT NOT NULL,
    "diexItemCode" SERIAL NOT NULL,
    "diexRequestId" TEXT NOT NULL,
    "estimateItemId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplyUnit" TEXT NOT NULL,
    "quantityRequested" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiexRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiexRequest_diexCode_key" ON "DiexRequest"("diexCode");

-- CreateIndex
CREATE UNIQUE INDEX "DiexRequest_estimateId_key" ON "DiexRequest"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "DiexRequestItem_diexItemCode_key" ON "DiexRequestItem"("diexItemCode");

-- CreateIndex
CREATE UNIQUE INDEX "DiexRequestItem_diexRequestId_estimateItemId_key" ON "DiexRequestItem"("diexRequestId", "estimateItemId");

-- AddForeignKey
ALTER TABLE "DiexRequest" ADD CONSTRAINT "DiexRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiexRequest" ADD CONSTRAINT "DiexRequest_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiexRequestItem" ADD CONSTRAINT "DiexRequestItem_diexRequestId_fkey" FOREIGN KEY ("diexRequestId") REFERENCES "DiexRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiexRequestItem" ADD CONSTRAINT "DiexRequestItem_estimateItemId_fkey" FOREIGN KEY ("estimateItemId") REFERENCES "EstimateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
