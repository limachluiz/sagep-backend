-- CreateEnum
CREATE TYPE "AtaType" AS ENUM ('CFTV', 'FIBRA_OPTICA');

-- CreateEnum
CREATE TYPE "FederativeUnit" AS ENUM ('AM', 'RO', 'RR', 'AC');

-- CreateTable
CREATE TABLE "Ata" (
    "id" TEXT NOT NULL,
    "ataCode" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "type" "AtaType" NOT NULL,
    "vendorName" TEXT NOT NULL,
    "managingAgency" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtaCoverageGroup" (
    "id" TEXT NOT NULL,
    "ataId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtaCoverageGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtaCoverageLocality" (
    "id" TEXT NOT NULL,
    "coverageGroupId" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "stateUf" "FederativeUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtaCoverageLocality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ata_ataCode_key" ON "Ata"("ataCode");

-- CreateIndex
CREATE UNIQUE INDEX "AtaCoverageGroup_ataId_code_key" ON "AtaCoverageGroup"("ataId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AtaCoverageLocality_coverageGroupId_cityName_stateUf_key" ON "AtaCoverageLocality"("coverageGroupId", "cityName", "stateUf");

-- AddForeignKey
ALTER TABLE "AtaCoverageGroup" ADD CONSTRAINT "AtaCoverageGroup_ataId_fkey" FOREIGN KEY ("ataId") REFERENCES "Ata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtaCoverageLocality" ADD CONSTRAINT "AtaCoverageLocality_coverageGroupId_fkey" FOREIGN KEY ("coverageGroupId") REFERENCES "AtaCoverageGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
