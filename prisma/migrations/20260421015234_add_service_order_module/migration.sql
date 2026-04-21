-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "serviceOrderCode" SERIAL NOT NULL,
    "projectId" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "diexRequestId" TEXT,
    "serviceOrderNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "contractorName" TEXT NOT NULL,
    "contractorCnpj" TEXT NOT NULL,
    "commitmentNoteNumber" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterRank" TEXT NOT NULL,
    "requesterRole" TEXT NOT NULL DEFAULT 'Fiscal do Contrato',
    "issuingOrganization" TEXT NOT NULL DEFAULT '4º CTA',
    "notes" TEXT,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderItem" (
    "id" TEXT NOT NULL,
    "serviceOrderItemCode" SERIAL NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "estimateItemId" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplyUnit" TEXT NOT NULL,
    "quantityOrdered" DECIMAL(14,2) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_serviceOrderCode_key" ON "ServiceOrder"("serviceOrderCode");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_estimateId_key" ON "ServiceOrder"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrderItem_serviceOrderItemCode_key" ON "ServiceOrderItem"("serviceOrderItemCode");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrderItem_serviceOrderId_estimateItemId_key" ON "ServiceOrderItem"("serviceOrderId", "estimateItemId");

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_diexRequestId_fkey" FOREIGN KEY ("diexRequestId") REFERENCES "DiexRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_estimateItemId_fkey" FOREIGN KEY ("estimateItemId") REFERENCES "EstimateItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
