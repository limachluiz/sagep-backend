-- CreateTable
CREATE TABLE "MilitaryOrganization" (
    "id" TEXT NOT NULL,
    "omCode" SERIAL NOT NULL,
    "sigla" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "stateUf" "FederativeUnit" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MilitaryOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MilitaryOrganization_omCode_key" ON "MilitaryOrganization"("omCode");

-- CreateIndex
CREATE UNIQUE INDEX "MilitaryOrganization_sigla_key" ON "MilitaryOrganization"("sigla");
