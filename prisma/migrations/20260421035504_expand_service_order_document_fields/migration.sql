-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "contactExtension" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "contractNumber" TEXT,
ADD COLUMN     "contractTotalTerm" TEXT,
ADD COLUMN     "contractorRepresentativeName" TEXT,
ADD COLUMN     "contractorRepresentativeRole" TEXT DEFAULT 'Responsável pela Contratada',
ADD COLUMN     "executionHours" TEXT,
ADD COLUMN     "executionLocation" TEXT,
ADD COLUMN     "originProcess" TEXT DEFAULT 'Pregão nº 90004/2025-CMA',
ADD COLUMN     "projectAcronym" TEXT,
ADD COLUMN     "projectDisplayName" TEXT,
ADD COLUMN     "requesterCpf" TEXT,
ADD COLUMN     "requestingArea" TEXT NOT NULL DEFAULT 'Seção de Projetos - Divisão Técnica 4º CTA';

-- CreateTable
CREATE TABLE "ServiceOrderScheduleItem" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "taskStep" TEXT NOT NULL,
    "scheduleText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrderScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderDeliveredDocument" (
    "id" TEXT NOT NULL,
    "serviceOrderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isChecked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOrderDeliveredDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ServiceOrderScheduleItem" ADD CONSTRAINT "ServiceOrderScheduleItem_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderDeliveredDocument" ADD CONSTRAINT "ServiceOrderDeliveredDocument_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
